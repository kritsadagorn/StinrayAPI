import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../PrismaService/prisma.service';
import { CreatePondDto } from './dto/create-pond.dto';
import { UpdatePondDto } from './dto/update-pond.dto';
import { CreateEntryDto, LogMetricEnumDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { CreateLogbookUserDto, UpdateLogbookUserDto } from './dto/logbook-user.dto';
import * as crypto from 'crypto';

@Injectable()
export class LogbookService {
  constructor(private prisma: PrismaService) {}

  // Ponds
  listPonds() {
    return this.prisma.pond.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] });
    }

  async createPond(dto: CreatePondDto) {
    const data: CreatePondDto & { order?: number } = { ...dto };
    if (data.order == null) {
      const rows = await this.prisma.pond.findMany({ select: { order: true }, orderBy: { order: 'asc' } });
      const used = new Set<number>();
      for (const r of rows) {
        const ord = typeof r.order === 'number' ? r.order : 0;
        if (ord > 0) used.add(ord);
      }
      let next = 1;
      while (used.has(next)) next++;
      data.order = next;
    }
    return this.prisma.pond.create({ data });
  }

  async updatePond(id: number, dto: UpdatePondDto) {
    const exists = await this.prisma.pond.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Pond not found');
    return this.prisma.pond.update({ where: { id }, data: dto });
  }

  async deletePond(id: number) {
    // deleting pond cascades entries and audits by schema
    return this.prisma.pond.delete({ where: { id } });
  }

  // Entries
  async listEntries(pondId: number, metric?: LogMetricEnumDto, limit?: number) {
    const orderBy = { recordedAt: 'asc' as const };
    if (limit && Number.isFinite(limit) && limit > 0) {
      // Fetch latest N by ordering desc then reverse in memory to keep ascending display if needed
      const rows = await this.prisma.logEntry.findMany({
        where: { pondId, ...(metric ? { metric } : {}) },
        orderBy: { recordedAt: 'desc' },
        take: limit,
      });
      return rows.slice().reverse();
    }
    return this.prisma.logEntry.findMany({
      where: { pondId, ...(metric ? { metric } : {}) },
      orderBy,
    });
  }

  async createEntry(pondId: number, dto: CreateEntryDto) {
    const { metric, valueDecimal, note, byName, byUserId, recordedAt } = dto;
    const entry = await this.prisma.logEntry.create({
      data: { pondId, metric, valueDecimal, note, byName, byUserId, ...(recordedAt ? { recordedAt } : {}) },
    });
    await this.prisma.logAudit.create({
      data: {
        pondId,
        entryId: entry.id,
        metric,
        op: 'add',
        valueDecimal: entry.valueDecimal,
        note: entry.note ?? undefined,
        byName,
        byUserId,
      },
    });
    return entry;
  }

  async updateEntry(pondId: number, id: number, dto: UpdateEntryDto) {
    const prev = await this.prisma.logEntry.findUnique({ where: { id } });
    if (!prev || prev.pondId !== pondId) throw new NotFoundException('Entry not found');
    const entry = await this.prisma.logEntry.update({ where: { id }, data: dto });
    await this.prisma.logAudit.create({
      data: {
        pondId,
        entryId: entry.id,
        metric: entry.metric,
        op: 'edit',
        valueDecimal: entry.valueDecimal,
        note: entry.note ?? undefined,
        prevValueDecimal: prev.valueDecimal ?? undefined,
        prevNote: prev.note ?? undefined,
        byName: dto.byName ?? prev.byName ?? undefined,
        byUserId: dto.byUserId ?? prev.byUserId ?? undefined,
      },
    });
    return entry;
  }

  async deleteEntry(pondId: number, id: number, byName?: string, byUserId?: string, note?: string) {
    const prev = await this.prisma.logEntry.findUnique({ where: { id } });
    if (!prev || prev.pondId !== pondId) throw new NotFoundException('Entry not found');
    await this.prisma.$transaction(async (prisma) => {
      await prisma.logAudit.create({
        data: {
          pondId,
          entryId: id,
          metric: prev.metric,
          op: 'delete',
          prevValueDecimal: prev.valueDecimal ?? undefined,
          prevNote: prev.note ?? undefined,
          note: (note && note.trim() !== '') ? note : undefined,
          byName,
          byUserId,
        },
      });
      await prisma.logEntry.delete({ where: { id } });
    });
    return { success: true };
  }

  async clearNotes(pondId: number, byName?: string, byUserId?: string) {
    const notes = await this.prisma.logEntry.findMany({ where: { pondId, metric: 'note' } });
    if (!notes.length) return { cleared: 0 };
    const tx = await this.prisma.$transaction(async (prisma) => {
      const ids = notes.map((n) => n.id);
      await prisma.logAudit.createMany({
        data: notes.map((n) => ({
          pondId,
          entryId: n.id,
          metric: 'note',
          op: 'delete',
          prevValueDecimal: n.valueDecimal ?? undefined,
          prevNote: n.note ?? undefined,
          byName,
          byUserId,
        })),
      });
      await prisma.logEntry.deleteMany({ where: { id: { in: ids } } });
      return ids.length;
    });
    return { cleared: tx };
  }

  // Audits
  listAudits(pondId: number, metric?: LogMetricEnumDto) {
    return this.prisma.logAudit.findMany({
      where: { pondId, ...(metric ? { metric } : {}) },
      orderBy: { recordedAt: 'asc' },
    });
  }

  async deleteAudit(id: number) {
    await this.prisma.logAudit.delete({ where: { id } });
    return { success: true };
  }

  async deleteAudits(ids: number[]) {
    await this.prisma.logAudit.deleteMany({ where: { id: { in: ids } } });
    return { success: true, count: ids.length };
  }

  async purgeAudits(pondId: number) {
    const res = await this.prisma.logAudit.deleteMany({ where: { pondId } });
    return { success: true, count: res.count };
  }

  // Logbook Users
  async listLogbookUsers() {
    const users = await this.prisma.logbookUser.findMany({
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
      include: { allowedPonds: { select: { pondId: true } } },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      avatarUrl: (u as any).avatarUrl,
      avatarIcon: (u as any).avatarIcon,
      role: u.role,
      enabled: u.enabled,
      allowedPonds: u.allowedPonds.map((ap) => ap.pondId),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }

  async createLogbookUser(dto: CreateLogbookUserDto) {
    const { username, password, nickname, role, enabled, allowedPonds, avatarUrl, avatarIcon } = dto;
    const salt = crypto.randomBytes(16).toString('hex');
    const rawPass = (role === 'Admin') ? (password || '') : (password && password.length ? password : crypto.randomBytes(12).toString('hex'));
    const hash = crypto.pbkdf2Sync(rawPass, salt, 10000, 64, 'sha512').toString('hex');
    const passwordHash = `pbkdf2$10000$${salt}$${hash}`;
    const createData: any = {
      username,
      passwordHash,
      nickname,
      avatarUrl: avatarUrl || undefined,
      avatarIcon: avatarIcon || undefined,
      role,
      enabled,
      allowedPonds: allowedPonds && allowedPonds.length ? {
        createMany: { data: allowedPonds.map((pid) => ({ pondId: pid })) },
      } : undefined,
    };
    const user = await this.prisma.logbookUser.create({
      data: createData as any,
      include: { allowedPonds: true },
    });
    return { ...user, allowedPonds: user.allowedPonds.map((ap) => ap.pondId) };
  }

  async updateLogbookUser(id: string, dto: UpdateLogbookUserDto) {
    const { password, allowedPonds, avatarUrl, avatarIcon, ...rest } = dto;
    const data: any = { ...rest };
    if (typeof password === 'string' && password.length) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
      data.passwordHash = `pbkdf2$10000$${salt}$${hash}`;
    }
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl || null;
    if (avatarIcon !== undefined) data.avatarIcon = avatarIcon || null;
    const user = await this.prisma.logbookUser.update({ where: { id }, data });
    if (Array.isArray(allowedPonds)) {
      await this.prisma.logbookUserPond.deleteMany({ where: { userId: id } });
      if (allowedPonds.length) {
        await this.prisma.logbookUserPond.createMany({ data: allowedPonds.map((pid) => ({ userId: id, pondId: pid })) });
      }
    }
  const reloaded = await this.prisma.logbookUser.findUniqueOrThrow({ where: { id }, include: { allowedPonds: true } });
  return { ...reloaded, allowedPonds: reloaded.allowedPonds.map((ap) => ap.pondId) };
  }

  async deleteLogbookUser(id: string) {
    await this.prisma.logbookUser.delete({ where: { id } });
    return { success: true };
  }

  // Auth (JWT without external deps)
  private base64url(input: Buffer | string) {
    const buff = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return buff.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  private signJwt(payload: any, secret: string, expiresInSec = 7 * 24 * 3600) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const body = { ...payload, iat: now, exp: now + expiresInSec };
    const data = `${this.base64url(JSON.stringify(header))}.${this.base64url(JSON.stringify(body))}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${data}.${sig}`;
  }

  private parseStoredHash(hash: string) {
    // format: pbkdf2$<iters>$<salt>$<hash>
    const parts = (hash || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return null;
    const iters = parseInt(parts[1], 10) || 10000;
    const salt = parts[2];
    const digest = parts[3];
    return { iters, salt, digest };
  }

  private verifyPassword(stored: string, plain: string) {
    const parsed = this.parseStoredHash(stored);
    if (!parsed) return false;
    const { iters, salt, digest } = parsed;
    const calc = crypto.pbkdf2Sync(plain, salt, iters, 64, 'sha512').toString('hex');
    const a = Buffer.from(calc);
    const b = Buffer.from(digest);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async login(username: string, password: string) {
    const user = await this.prisma.logbookUser.findUnique({
      where: { username },
      include: { allowedPonds: true },
    });
    if (!user || !user.enabled) {
      return { ok: false, error: 'Invalid credentials' };
    }
    const ok = this.verifyPassword(user.passwordHash, password);
    if (!ok) return { ok: false, error: 'Invalid credentials' };
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const payload = {
      sub: user.id,
      username: user.username,
      nickname: user.nickname || undefined,
      role: user.role, // Admin|User (but Admin creation not allowed via staff UI)
      allowedPonds: user.allowedPonds.map((ap) => ap.pondId),
    };
    const token = this.signJwt(payload, secret);
    return {
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarUrl: (user as any).avatarUrl,
        avatarIcon: (user as any).avatarIcon,
        role: user.role,
        allowedPonds: payload.allowedPonds,
      },
    };
  }
}
