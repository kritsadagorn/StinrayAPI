import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { PrismaService } from 'src/PrismaService/prisma.service';
import {
  Farm,
  Prisma,
  Device,
  InputModuleMeterValue,
  InputModule,
} from '@prisma/client';
import dayjs from 'dayjs';
import { VM } from 'vm2';

type GetGraphArgs = {
  moduleId: number;
  inputId: number;
  device: string;
  startAt: Date;
  endAt: Date;
  maxPoints: number;
  timeoutMs: number;
};

type Point = { valueTimestamp: Date; value: number | null };

type FormulaStep = {
  id: number;
  name: string;
  unit: string | null;
  sequence: number;
  eval: string;
};

type FormulaChainResponse = {
  groupId: number;
  groupName: string;
  targetId: number;
  steps: FormulaStep[];
};

@Injectable()
export class FarmService {
  constructor(private prisma: PrismaService) {}

  async findAllfarm(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.FarmWhereUniqueInput;
    where?: Prisma.FarmWhereInput;
    orderBy?: Prisma.FarmOrderByWithRelationInput;
    include?: Prisma.FarmInclude;
  }): Promise<Farm[]> {
    const { skip, take, cursor, where, orderBy, include } = params;
    const result = await this.prisma.farm.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
      include,
    });
    return result;
  }

  async findAllDevice(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.DeviceWhereUniqueInput;
    where?: Prisma.DeviceWhereInput;
    orderBy?: Prisma.DeviceOrderByWithRelationInput;
    include?: Prisma.DeviceInclude;
  }): Promise<Object[]> {
    const { skip, take, cursor, where, orderBy, include } = params;
    const result = await this.prisma.device.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
      include,
    });
    return result;
  }

  async findMeterModuleSensorValue(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.InputModuleMeterValueWhereUniqueInput;
    where?: Prisma.InputModuleMeterValueWhereInput;
    orderBy?: Prisma.InputModuleMeterValueOrderByWithRelationInput;
  }): Promise<InputModuleMeterValue[]> {
    const { skip, take, cursor, where, orderBy } = params;
    const result = await this.prisma.inputModuleMeterValue.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
    return result;
  }

  async findInputModule(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.InputModuleWhereUniqueInput;
    where?: Prisma.InputModuleWhereInput;
    orderBy?: Prisma.InputModuleOrderByWithRelationInput;
  }): Promise<InputModule[]> {
    const { skip, take, cursor, where, orderBy } = params;
    const result = await this.prisma.inputModule.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
    return result;
  }

  //ทุกๆ 5 นาที
  async getGraphSeries(args: GetGraphArgs): Promise<Point[]> {
    return this.withTimeout(this.getGraphSeriesInner(args), args.timeoutMs);
  }

  private async getGraphSeriesInner({
    moduleId,
    inputId,
    device,
    startAt,
    endAt,
    maxPoints,
    timeoutMs,
  }: GetGraphArgs): Promise<Point[]> {
    const rangeMs = endAt.getTime() - startAt.getTime();
    const targetPts = Math.max(300, Math.min(1500, maxPoints || 1200));

    // 1) คิด bucketSec จากช่วง / target points
    const rawBucketSec = Math.ceil(rangeMs / 1000 / targetPts);
    // 2) ปัดขึ้นเป็นพหุคูณของ 300s (5 นาที) เพื่อ “ลดจำนวน bucket” และ align กับความถี่ข้อมูล
    const bucketSec = Math.max(300, Math.ceil(rawBucketSec / 300) * 300);

    try {
      // ใช้ statement_timeout ที่ DB เพื่อตัดคำสั่งช้า ๆ (นอกเหนือจาก JS timeout)
      return await this.withDbStatementTimeout<Point[]>(timeoutMs, async () => {
        // -- IMPORTANT --
        // ตัด non-numeric ออก ณ WHERE เพื่อให้ AVG::numeric เร็วและไม่ throw
        const rows = await this.prisma.$queryRaw<
          { ts: Date; v_avg: number | null }[]
        >`
          SELECT
            to_timestamp(floor(extract(epoch from "valueTimestamp") / ${bucketSec}) * ${bucketSec}) AS ts,
            AVG(("value")::numeric) AS v_avg
          FROM "InputModuleMeterValue"
          WHERE "device" = ${device}
            AND "moduleId" = ${moduleId}
            AND "inputId"  = ${inputId}
            AND "valueTimestamp" >= ${startAt}
            AND "valueTimestamp" <  ${endAt}
            AND "value" ~ '^-?[0-9]+(\\.[0-9]+)?$'      -- filter non-numeric early
          GROUP BY 1
          ORDER BY 1 ASC
        `;

        return rows.map((r) => ({
          valueTimestamp: new Date(r.ts),
          value: r.v_avg === null ? null : Number(r.v_avg),
        }));
      });
    } catch (e) {
      // bucket ล้มเหลว → fallback stride
    }

    // -------- Fallback: stride sampling --------
    const all = await this.prisma.inputModuleMeterValue.findMany({
      where: {
        device,
        moduleId,
        inputId,
        valueTimestamp: { gte: startAt, lt: endAt },
        // ถ้า schema อนุญาต numeric only ให้ตัด WHERE นี้ทิ้งได้ จะยิ่งเร็วขึ้น
      },
      orderBy: { valueTimestamp: 'asc' },
      select: { valueTimestamp: true, value: true },
    });

    if (all.length <= targetPts) {
      return all.map((r) => ({
        valueTimestamp: r.valueTimestamp!,
        value: this.safeNumber(r.value),
      }));
    }

    const stride = Math.ceil(all.length / targetPts);
    const sampled: Point[] = [];
    for (let i = 0; i < all.length; i += stride) {
      const r = all[i];
      sampled.push({
        valueTimestamp: r.valueTimestamp!,
        value: this.safeNumber(r.value),
      });
    }
    return sampled;
  }

  private safeNumber(v: string | null): number | null {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = setTimeout(
        () => reject(new Error(`Query timeout after ${timeoutMs}ms`)),
        timeoutMs,
      );
      p.then((v) => {
        clearTimeout(id);
        resolve(v);
      }).catch((e) => {
        clearTimeout(id);
        reject(e);
      });
    });
  }

  /**
   * Run the provided callback with a scoped Postgres statement_timeout
   * so the DB cancels heavy queries by itself.
   */
  private async withDbStatementTimeout<T>(
    ms: number,
    cb: () => Promise<T>,
  ): Promise<T> {
    // ใช้ transaction เล็ก ๆ + SET LOCAL (มีผลเฉพาะใน txn นั้น)
    return await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL statement_timeout = ${Math.max(500, Math.min(15000, ms))}`,
      );
      return cb();
    });
  }

  // ทุก 1 นาที

  // async getGraphSeries(args: GetGraphArgs): Promise<Point[]> {
  //   return this.withTimeout(this.getGraphSeriesInner(args), args.timeoutMs);
  // }

  // private async getGraphSeriesInner({
  //   moduleId,
  //   inputId,
  //   device,
  //   startAt,
  //   endAt,
  //   maxPoints,
  // }: GetGraphArgs): Promise<Point[]> {
  //   const rangeMs = endAt.getTime() - startAt.getTime();
  //   // กำหนดความกว้าง bucket (วินาที) ให้จำนวนจุดไม่เกิน maxPoints
  //   const bucketSec = Math.max(1, Math.floor(rangeMs / maxPoints / 1000));

  //   // ------------- (1) Time-bucket บน Postgres -------------
  //   // หมายเหตุ: "InputModuleMeterValue" และชื่อคอลัมน์ต้องใส่ double-quote ให้ตรง schema (PascalCase)
  //   try {
  //     const rows = await this.prisma.$queryRaw<
  //       { ts: Date; v_avg: number | null }[]
  //     >`
  //       SELECT
  //         to_timestamp(floor(extract(epoch from "valueTimestamp") / ${bucketSec}) * ${bucketSec}) AS ts,
  //         AVG(
  //           CASE
  //             WHEN "value" ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN ("value")::numeric
  //             ELSE NULL
  //           END
  //         ) AS v_avg
  //       FROM "InputModuleMeterValue"
  //       WHERE "device" = ${device}
  //         AND "moduleId" = ${moduleId}
  //         AND "inputId"  = ${inputId}
  //         AND "valueTimestamp" IS NOT NULL
  //         AND "valueTimestamp" >= ${startAt}
  //         AND "valueTimestamp" <  ${endAt}
  //       GROUP BY 1
  //       ORDER BY 1 ASC
  //     `;

  //     // ได้จุดน้อยกว่า maxPoints อยู่แล้ว (เพราะ bucket)
  //     return rows.map((r) => ({
  //       valueTimestamp: new Date(r.ts),
  //       value: r.v_avg === null ? null : Number(r.v_avg),
  //     }));
  //   } catch (err) {
  //     // ถ้า raw ไม่ผ่าน (เช่น สิทธิ์/ชื่อ table ต่าง) จะ fallback
  //     // console.error('bucket query failed:', err);
  //   }

  //   // ------------- (2) Fallback: ดึงช่วง + stride -------------
  //   const all = await this.prisma.inputModuleMeterValue.findMany({
  //     where: {
  //       device,
  //       moduleId,
  //       inputId,
  //       valueTimestamp: { gte: startAt, lt: endAt },
  //     },
  //     orderBy: { valueTimestamp: 'asc' },
  //     select: { valueTimestamp: true, value: true }, // << ลด payload เท่าที่ต้องใช้
  //   });

  //   if (all.length <= maxPoints) {
  //     return all.map((r) => ({
  //       valueTimestamp: r.valueTimestamp!,
  //       value: this.safeNumber(r.value),
  //     }));
  //   }

  //   const stride = Math.ceil(all.length / maxPoints);
  //   const sampled: Point[] = [];
  //   for (let i = 0; i < all.length; i += stride) {
  //     const r = all[i];
  //     sampled.push({
  //       valueTimestamp: r.valueTimestamp!,
  //       value: this.safeNumber(r.value),
  //     });
  //   }
  //   return sampled;
  // }

  // private safeNumber(v: string | null): number | null {
  //   if (v == null) return null;
  //   const n = Number(v);
  //   return Number.isFinite(n) ? n : null;
  // }

  // private withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  //   return new Promise<T>((resolve, reject) => {
  //     const id = setTimeout(
  //       () => reject(new Error(`Query timeout after ${timeoutMs}ms`)),
  //       timeoutMs,
  //     );
  //     p.then((v) => {
  //       clearTimeout(id);
  //       resolve(v);
  //     }).catch((e) => {
  //       clearTimeout(id);
  //       reject(e);
  //     });
  //   });
  // }

  // async findInputModules(where: Prisma.InputModuleWhereUniqueInput) {
  //   const result = await this.prisma.inputModule.findUnique({ where });
  //   if (!result) return null;
  //   return result;
  // }

  // 1) ดึง chain ของสูตร (ตัดให้ถึงสูตรเป้าหมาย)

  async getFormulaChain(opts: {
    formulaId?: number;
    formulaName?: string;
  }): Promise<FormulaChainResponse> {
    const { formulaId, formulaName } = opts;
    if (!formulaId && !formulaName) {
      throw new BadRequestException('ต้องระบุ formulaId หรือ formulaName');
    }

    const target = await this.prisma.formula.findFirst({
      where: formulaId ? { id: formulaId } : { name: formulaName! },
      select: { id: true, name: true },
    });
    if (!target) throw new NotFoundException('ไม่พบสูตรเป้าหมาย');

    const link = await this.prisma.formulaOnGroup.findFirst({
      where: { formula: target.id, enable: true },
      orderBy: { sequence: 'desc' }, // ถ้าอยู่หลาย group ให้ถือว่าอันที่ sequence สูงสุดคือปลายทาง
      include: { FormulaGroup: { select: { id: true, name: true } } },
    });
    if (!link)
      throw new NotFoundException(
        'สูตรนี้ไม่ได้ถูกผูกกับกลุ่มใด (FormulaOnGroup)',
      );

    const chainAll = await this.prisma.formulaOnGroup.findMany({
      where: { group: link.group, enable: true },
      orderBy: { sequence: 'asc' },
      include: { Formula: true },
    });

    const targetIdx = chainAll.findIndex((c) => c.formula === target.id);
    if (targetIdx < 0) throw new NotFoundException('ไม่พบสูตรเป้าหมายใน chain');

    const steps: FormulaStep[] = chainAll.slice(0, targetIdx + 1).map((c) => ({
      id: c.formula,
      name: c.Formula.name,
      unit: c.Formula.unit,
      sequence: c.sequence,
      eval: c.Formula.eval,
    }));

    return {
      groupId: link.group,
      groupName: link.FormulaGroup.name,
      targetId: target.id,
      steps,
    };
  }

  // 2) คำนวณ chain ทั้งชุดจากค่า input เริ่มต้น (และตัวแปรเสริม)
  async computeFormulaValue(opts: {
    formulaId?: number;
    formulaName?: string;
    input: number; // ค่าจุดเริ่มต้น เช่น voltage
    extras?: Record<string, any>; // ตัวแปรเสริม (เช่น ph, temp) ถ้าสูตรใช้
  }) {
    const { input, extras, ...findOpts } = opts;
    if (typeof input !== 'number' || Number.isNaN(input)) {
      throw new BadRequestException('input ต้องเป็นตัวเลข');
    }

    const chain = await this.getFormulaChain(findOpts);

    let value: any = input;
    const perStep: Array<{
      id: number;
      name: string;
      sequence: number;
      output: number;
    }> = [];

    for (const step of chain.steps) {
      // สร้าง sandbox ให้สูตรใช้ตัวแปร value และ extras ได้
      const vm = new VM({
        timeout: 200,
        sandbox: {
          value, // ค่าจากขั้นก่อนหน้า
          ...extras, // เช่น ph, temp หากต้องใช้
          Math, // ให้ใช้ Math ได้
        },
      });

      // คาดหวังว่า eval คืนค่าเป็น "result ของบรรทัดสุดท้าย"
      // ตัวอย่างใน DB:
      // function voltage_to_NTU(v){...}
      // voltage_to_NTU(value)
      const result = vm.run(step.eval);

      const num = Number(result);
      if (Number.isNaN(num)) {
        throw new BadRequestException(
          `สูตร ${step.name} คืนค่าที่ไม่ใช่ตัวเลข`,
        );
      }

      value = num;
      perStep.push({
        id: step.id,
        name: step.name,
        sequence: step.sequence,
        output: num,
      });
    }

    return {
      targetId: chain.targetId,
      groupId: chain.groupId,
      groupName: chain.groupName,
      unit: chain.steps[chain.steps.length - 1]?.unit ?? null,
      input,
      extras: extras ?? {},
      steps: perStep, // log ผลระหว่างทาง (มีประโยชน์มากเวลา debug)
      output: value, // ค่าสุดท้าย
    };
  }

  // คำนวณทั้ง series ด้วยสูตรเดียวกัน (เรียก computeFormulaValue รายจุด)
  // รองรับค่า null/NaN โดยจะคืน value: null
  async computeSeriesWithFormula(
    formulaId: number,
    points: Array<{ valueTimestamp: Date; value: number | null }>,
    extras?: Record<string, any>,
  ): Promise<
    Array<{ valueTimestamp: Date; raw: number | null; value: number | null }>
  > {
    if (!Number.isFinite(formulaId))
      throw new BadRequestException('invalid formulaId');
    if (!Array.isArray(points) || points.length === 0) return [];

    const CONCURRENCY = 8; // กันสูตรหนัก ๆ
    const out: Array<{
      valueTimestamp: Date;
      raw: number | null;
      value: number | null;
    }> = [];

    for (let i = 0; i < points.length; i += CONCURRENCY) {
      const batch = points.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (p) => {
          if (p.value == null || Number.isNaN(Number(p.value))) {
            return {
              valueTimestamp: p.valueTimestamp,
              raw: p.value,
              value: null,
            };
          }
          const res = await this.computeFormulaValue({
            formulaId,
            input: Number(p.value),
            extras, // ถ้าสูตรคุณต้องใช้ตัวแปรเสริม (เช่น temp/ph จากที่อื่น)
          });
          return {
            valueTimestamp: p.valueTimestamp,
            raw: p.value,
            value: Number(res.output),
          };
        }),
      );
      out.push(...results);
    }

    return out;
  }

  async getGraphSeriesComputed(args: {
    moduleId: number;
    inputId: number;
    device: string;
    startAt: Date;
    endAt: Date;
    maxPoints: number;
    timeoutMs: number;
    formulaId: number;
    extras?: Record<string, any>;
  }) {
    const seriesRaw = await this.getGraphSeries(args);
    const seriesComputed = await this.computeSeriesWithFormula(
      args.formulaId,
      seriesRaw,
      args.extras,
    );

    // เดา unit จากสูตร (ใช้ chain สุดท้ายใน computeFormulaValue ก็ได้)
    // ที่นี่ให้ unit เป็น null ไปก่อน หรือจะเรียก getFormulaChain() มาอ่าน unit ก็ได้
    return { seriesRaw, seriesComputed, unit: null as string | null };
  }
}
