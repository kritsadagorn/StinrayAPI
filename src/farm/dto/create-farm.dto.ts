import { ApiProperty } from '@nestjs/swagger';

export class CreateFarmDto {}

export class QueryGraphValueDto {
  @ApiProperty({ type: String })
  device: string;

  @ApiProperty({ type: Number })
  moduleId: number;

  @ApiProperty({ type: Number })
  inputId: number;

  // โหมด Preset (ถ้าให้ before จะถูกใช้แทน start/end)
  @ApiProperty({
    type: String,
    required: false,
    description: "ช่วงเวลาแบบ preset: '1h' | '4h' | '1d' | '1w' | '1y'",
  })
  before?: '1h' | '4h' | '1d' | '1w' | '1y';

  // โหมด Custom (ISO string): ใช้เมื่อไม่ส่ง before
  @ApiProperty({
    required: false,
    description: 'ISO start datetime (เช่น 2025-09-17T00:00:00Z)',
  })
  start?: string;

  @ApiProperty({
    required: false,
    description: 'ISO end datetime (เช่น 2025-09-17T12:00:00Z)',
  })
  end?: string;

  // ปรับแต่งการตอบสนอง
  @ApiProperty({
    required: false,
    description: 'จำนวนจุดสูงสุดหลัง downsample (default 1200)',
  })
  maxPoints?: number;

  @ApiProperty({
    required: false,
    description: 'timeout ของคำขอ (ms) default 6000, max 15000',
  })
  timeoutMs?: number;

  @ApiProperty({
    required: false,
    description: 'formula group number',
  })
  computeFormulaId?: number;
}
