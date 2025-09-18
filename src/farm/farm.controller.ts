import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FarmService } from './farm.service';
import { CreateFarmDto, QueryGraphValueDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { Device, InputModule, Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import { NotFoundError } from 'rxjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

interface DeviceCustom extends Device {
  InputModule: InputModule[];
}

type Preset = '1h' | '4h' | '1d' | '1w' | '1y';
const PRESET_MS: Record<Preset, number> = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

class ComputeFormulaDto {
  id?: number; // เช่น 25
  name?: string; // หรือ "Coffeefish.Turbidity"
  input!: number; // ค่าตัวเลขเริ่มต้น (เช่น voltage)
  extras?: Record<string, any>; // ตัวแปรเสริม (ph, temp ฯลฯ ถ้าสูตรต้องใช้)
}

@Controller('farm')
export class FarmController {
  constructor(private readonly farmService: FarmService) {}

  @Get()
  async findAll() {
    const include: Prisma.FarmInclude = { Plant: true };
    const where: Prisma.FarmWhereInput = {};
    const result = await this.farmService.findAllfarm({ include });

    return result;
  }

  @Get('device')
  async findDevice() {
    const include: Prisma.DeviceInclude = {
      InputModule: true,
    };
    const where: Prisma.DeviceWhereInput = {
      Plant: {
        id: 70,
      },
    };
    const result = (await this.farmService.findAllDevice({
      where,
      include,
    })) as DeviceCustom[];
    const sensorResult = result.map((item) => item.InputModule).flat();
    const data = sensorResult.map(async (item) => {
      const { device, moduleId, inputId } = item;
      const where: Prisma.InputModuleMeterValueWhereInput = {
        device,
        moduleId,
        inputId,
      };
      const orderBy: Prisma.InputModuleMeterValueOrderByWithRelationInput = {
        valueTimestamp: 'desc',
      };
      const resolved = await this.farmService.findMeterModuleSensorValue({
        where,
        orderBy,
        take: 50,
      });
      return { ...item, data: resolved };
    });
    const resultData = await Promise.all(data);
    const setDataDevice = await result.map((item) => {
      const result = resultData.filter((items) => items.device === item.id);
      return { ...item, InputModule: result };
    });
    return setDataDevice;
  }

  // @Get('graph')
  // async getGraph(@Query() q: QueryGraphValueDto) {
  //   const moduleId = Number(q.moduleId);
  //   const inputId = Number(q.inputId);
  //   const device = String(q.device || '').trim();

  //   if (!device || !Number.isFinite(moduleId) || !Number.isFinite(inputId)) {
  //     throw new BadRequestException('device, moduleId, inputId are required');
  //   }

  //   // resolve time window
  //   const nowMs = Date.now();
  //   let startAt: Date;
  //   let endAt: Date;

  //   if (q.before) {
  //     const ms = PRESET_MS[q.before];
  //     if (!ms) throw new BadRequestException('Invalid preset in "before"');
  //     endAt = new Date(nowMs);
  //     startAt = new Date(nowMs - ms);
  //   } else {
  //     if (!q.start || !q.end)
  //       throw new BadRequestException(
  //         'start and end are required for custom mode',
  //       );
  //     const s = Date.parse(q.start);
  //     const e = Date.parse(q.end);
  //     if (!Number.isFinite(s) || !Number.isFinite(e))
  //       throw new BadRequestException('Invalid start/end datetime');
  //     if (s >= e) throw new BadRequestException('start must be < end');
  //     startAt = new Date(s);
  //     endAt = new Date(e);
  //   }

  //   const maxPoints = Math.max(100, Math.min(5000, q.maxPoints ?? 1200));
  //   const timeoutMs = Math.max(500, Math.min(15000, q.timeoutMs ?? 6000));

  //   return this.farmService.getGraphSeries({
  //     moduleId,
  //     inputId,
  //     device,
  //     startAt,
  //     endAt,
  //     maxPoints,
  //     timeoutMs,
  //   });
  // }

  @Get('graph')
  async getGraph(@Query() q: QueryGraphValueDto) {
    const moduleId = Number(q.moduleId);
    const inputId = Number(q.inputId);
    const device = String(q.device || '').trim();

    if (!device || !Number.isFinite(moduleId) || !Number.isFinite(inputId)) {
      throw new BadRequestException('device, moduleId, inputId are required');
    }

    const nowMs = Date.now();
    let startAt: Date;
    let endAt: Date;

    if (q.before) {
      const ms = PRESET_MS[q.before];
      if (!ms) throw new BadRequestException('Invalid preset in "before"');
      endAt = new Date(nowMs);
      startAt = new Date(nowMs - ms);
    } else {
      if (!q.start || !q.end)
        throw new BadRequestException(
          'start and end are required for custom mode',
        );
      const s = Date.parse(q.start);
      const e = Date.parse(q.end);
      if (!Number.isFinite(s) || !Number.isFinite(e))
        throw new BadRequestException('Invalid start/end datetime');
      if (s >= e) throw new BadRequestException('start must be < end');
      startAt = new Date(s);
      endAt = new Date(e);
    }

    const maxPoints = Math.max(100, Math.min(5000, q.maxPoints ?? 1200));
    const timeoutMs = Math.max(500, Math.min(15000, q.timeoutMs ?? 6000));

    // ----- เพิ่ม"คำนวณสูตร" เมื่อมี computeFormulaId -----
    if (q.computeFormulaId) {
      const seriesRaw = await this.farmService.getGraphSeries({
        moduleId,
        inputId,
        device,
        startAt,
        endAt,
        maxPoints,
        timeoutMs,
      });

      const seriesComputed = await this.farmService.computeSeriesWithFormula(
        Number(q.computeFormulaId),
        seriesRaw,
        /* extras */ undefined, // ถ้ามีตัวแปรเสริมสำหรับสูตร ใส่ object ตรงนี้
      );

      return {
        series: seriesRaw,
        seriesRaw, 
        seriesComputed,
        meta: {
          device,
          moduleId,
          inputId,
          computeFormulaId: Number(q.computeFormulaId),
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        },
      };
    }

    // ----- ไม่คำนวณสูตร -----
    const series = await this.farmService.getGraphSeries({
      moduleId,
      inputId,
      device,
      startAt,
      endAt,
      maxPoints,
      timeoutMs,
    });

    return this.farmService.getGraphSeries({
      moduleId,
      inputId,
      device,
      startAt,
      endAt,
      maxPoints,
      timeoutMs,
    });
  }

  // POST /farm/formula
  // body: { id: 25, input: 2.48 }
  @Post('formula')
  async compute(@Body() body: ComputeFormulaDto) {
    const { id, name, input, extras } = body;
    return this.farmService.computeFormulaValue({
      formulaId: id,
      formulaName: name,
      input,
      extras,
    });
  }

  // @Get('graph')
  // async GetGraph(@Query() body: QueryGraphValueDto) {
  //   const { moduleId, inputId, device, before } = body;
  //   const mId = Number(moduleId);
  //   const iId = Number(inputId);
  //   const dev = String(device || '').trim();
  //   const now = dayjs();

  //   // -------- duration parser (รองรับ 1h / 4h / 1d) ----------
  //   const parseDuration = (raw?: string) => {
  //     const b = String(raw ?? '')
  //       .trim()
  //       .toLowerCase();
  //     if (/^\d+\s*[hdw]$/.test(b)) {
  //       const num = parseInt(b, 10);
  //       if (b.endsWith('h')) return { amount: num, unit: 'hour' as const };
  //       if (b.endsWith('d')) return { amount: num, unit: 'day' as const };
  //       if (b.endsWith('w')) return { amount: num, unit: 'week' as const };
  //     }
  //     return { amount: 1, unit: 'hour' as const }; // default
  //   };

  //   const SKEWED = new Set<string>([
  //     `1:24:MATD20240426151373604183`,
  //     `1:25:MATD20240426151373604183`,
  //     `1:26:MATD20240426151373604183`,
  //   ]);
  //   const isSkewed = SKEWED.has(`${mId}:${iId}:${dev}`);
  //   // console.log(isSkewed)

  //   // ---------- เคสเวลาเพี้ยน: อิง latestTs + progressive widening ----------
  //   if (isSkewed) {
  //     const baseWhere: Prisma.InputModuleMeterValueWhereInput = {
  //       moduleId: mId,
  //       inputId: iId,
  //       device: dev,
  //     };

  //     // 1) หาแถวล่าสุด (1 แถว)
  //     const latestOne = await this.farmService.findMeterModuleSensorValue({
  //       where: baseWhere,
  //       orderBy: { createdAt: 'desc' },
  //       take: 1,
  //     });

  //     const latestTs = (latestOne?.[0]?.createdAt ?? null) as Date | null;
  //     if (!latestTs) {
  //       console.warn('[SKEWED] no latest row found for', { mId, iId, dev });
  //       return [];
  //     }

  //     // 2) ระยะเริ่มต้นตาม before (1h/4h/1d/1w)
  //     const d0 = parseDuration(before);
  //     let amount = d0.amount;
  //     let unit = d0.unit;

  //     // 3) ดึงช่วง anchored ที่ latestTs; ถ้าน้อยกว่า MIN_POINTS ให้ขยายช่วง
  //     const MIN_POINTS = 30;
  //     const MAX_WEEKS = 1;
  //     const end = dayjs(latestTs);

  //     let tries = 0;
  //     let result: any[] = [];

  //     while (true) {
  //       const start = end.add(-amount, unit);
  //       const where: Prisma.InputModuleMeterValueWhereInput = {
  //         ...baseWhere,
  //         createdAt: { gte: start.toDate(), lte: end.toDate() },
  //       };

  //       result = await this.farmService.findMeterModuleSensorValue({
  //         where,
  //         orderBy: { valueTimestamp: 'asc' },
  //       });

  //       const reachedMaxWindow = unit === 'week' && amount >= MAX_WEEKS;

  //       if (result.length >= MIN_POINTS || reachedMaxWindow) {
  //         break;
  //       }

  //       tries += 1;
  //       if (unit === 'hour') {
  //         amount = Math.min(amount * 2, 24);
  //         if (amount === 24) {
  //           unit = 'day';
  //           amount = 1;
  //         }
  //       } else if (unit === 'day') {
  //         amount = Math.min(amount * 2, 7);
  //         if (amount === 7) {
  //           unit = 'week';
  //           amount = 1;
  //         }
  //       } else if (unit === 'week') {
  //         amount = Math.min(amount * 2, MAX_WEEKS);
  //       }

  //       if (tries > 6) {
  //         break;
  //       }
  //     }

  //     return result;
  //   }

  //   // ---------- เคสปกติ ----------
  //   let useRange = false;
  //   let gte = now.add(-1, 'hour'); // default 1h
  //   let lte = now;

  //   if (before) {
  //     const b = String(before).trim().toLowerCase();
  //     if (/^\d+\s*[hdw]$/.test(b)) {
  //       const d = parseDuration(b);
  //       gte = now.add(-d.amount, d.unit);
  //       useRange = true;
  //     } else if (dayjs(b).isValid()) {
  //       // หากส่ง ISO datetime มา → ใช้เป็น gte, และใช้ now เป็น lte
  //       gte = dayjs(b);
  //       useRange = true;
  //     }
  //   }

  //   const where: Prisma.InputModuleMeterValueWhereInput = {
  //     moduleId: mId,
  //     inputId: iId,
  //     device: dev,
  //     ...(useRange
  //       ? { valueTimestamp: { gte: gte.toDate(), lte: lte.toDate() } }
  //       : {}),
  //   };

  //   const orderBy: Prisma.InputModuleMeterValueOrderByWithRelationInput = {
  //     valueTimestamp: useRange ? 'asc' : 'desc',
  //   };

  //   const result = await this.farmService.findMeterModuleSensorValue({
  //     where,
  //     orderBy,
  //   });

  //   return result;
  // }
}
