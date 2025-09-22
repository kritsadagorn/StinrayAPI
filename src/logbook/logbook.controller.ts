import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, BadRequestException, Headers } from '@nestjs/common';
import { LogbookService } from './logbook.service';
import { CreatePondDto } from './dto/create-pond.dto';
import { UpdatePondDto } from './dto/update-pond.dto';
import { CreateEntryDto, LogMetricEnumDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { BulkDeleteDto } from './dto/bulk-delete.dto';
import { CreateLogbookUserDto, UpdateLogbookUserDto, LogbookRoleEnumDto } from './dto/logbook-user.dto';

@Controller('logbook')
export class LogbookController {
  constructor(private readonly svc: LogbookService) {}

  // Ponds
  @Get('ponds')
  listPonds() {
    return this.svc.listPonds();
  }

  @Post('ponds')
  createPond(@Body() dto: CreatePondDto) {
    return this.svc.createPond(dto);
  }

  @Patch('ponds/:id')
  updatePond(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePondDto) {
    return this.svc.updatePond(id, dto);
  }

  @Delete('ponds/:id')
  deletePond(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deletePond(id);
  }

  // Entries
  @Get('ponds/:pondId/entries')
  listEntries(
    @Param('pondId', ParseIntPipe) pondId: number,
    @Query('metric') metric?: LogMetricEnumDto,
    @Query('limit') limitStr?: string,
  ) {
    const limitParsed = limitStr ? parseInt(limitStr, 10) : undefined;
    const limit = Number.isFinite(limitParsed as number) ? (limitParsed as number) : undefined;
    return this.svc.listEntries(pondId, metric, limit);
  }

  @Post('ponds/:pondId/entries')
  createEntry(@Param('pondId', ParseIntPipe) pondId: number, @Body() dto: CreateEntryDto) {
    return this.svc.createEntry(pondId, dto);
  }

  @Patch('ponds/:pondId/entries/:id')
  updateEntry(
    @Param('pondId', ParseIntPipe) pondId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEntryDto,
  ) {
    return this.svc.updateEntry(pondId, id, dto);
  }

  @Delete('ponds/:pondId/entries/:id')
  deleteEntry(
    @Param('pondId', ParseIntPipe) pondId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('byName') byName?: string,
    @Query('byUserId') byUserId?: string,
    @Query('note') note?: string,
  ) {
    return this.svc.deleteEntry(pondId, id, byName, byUserId, note);
  }

  @Post('ponds/:pondId/clear-notes')
  clearNotes(
    @Param('pondId', ParseIntPipe) pondId: number,
    @Query('byName') byName?: string,
    @Query('byUserId') byUserId?: string,
  ) {
    return this.svc.clearNotes(pondId, byName, byUserId);
  }

  // Audits
  @Get('ponds/:pondId/audits')
  listAudits(
    @Param('pondId', ParseIntPipe) pondId: number,
    @Query('metric') metric?: LogMetricEnumDto,
  ) {
    return this.svc.listAudits(pondId, metric);
  }

  @Delete('audits/:id')
  deleteAudit(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteAudit(id);
  }

  @Post('audits/bulk-delete')
  deleteAudits(@Body() dto: BulkDeleteDto) {
    return this.svc.deleteAudits(dto.ids);
  }

  @Delete('ponds/:pondId/audits')
  purgeAudits(@Param('pondId', ParseIntPipe) pondId: number) {
    return this.svc.purgeAudits(pondId);
  }

  // Staff Users (exclude Admin from list; block Admin mutations)
  @Get('staff')
  async listStaff() {
    return this.svc.listLogbookUsers();
  }

  @Post('staff')
  async createStaff(@Body() dto: CreateLogbookUserDto) {
    return this.svc.createLogbookUser({ ...dto, role: dto.role ?? LogbookRoleEnumDto.User });
  }

  @Patch('staff/:id')
  async updateStaff(@Param('id') id: string, @Body() dto: UpdateLogbookUserDto) {
    const existing = await this.svc.listLogbookUsers();
    const user = existing.find((u: any) => u.id === id);
    if (!user) throw new BadRequestException('User not found');
    return this.svc.updateLogbookUser(id, dto);
  }

  @Delete('staff/:id')
  async deleteStaff(@Param('id') id: string) {
    const existing = await this.svc.listLogbookUsers();
    const user = existing.find((u: any) => u.id === id);
    if (!user) throw new BadRequestException('User not found');
    return this.svc.deleteLogbookUser(id);
  }

  // Auth endpoints (simple)
  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    return this.svc.login(body?.username || '', body?.password || '');
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    const token = (authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return { ok: false };
    // Basic verify (without full library): decode payload only; rely on server to validate on use.
    try {
      const [, payload] = token.split('.');
      if (!payload) return { ok: false };
      const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      const exp = json?.exp ? Number(json.exp) : 0;
      const now = Math.floor(Date.now() / 1000);
      if (exp && now > exp) return { ok: false };
      return { ok: true, user: json };
    } catch {
      return { ok: false };
    }
  }
}
