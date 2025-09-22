import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFarmDto {}

export class QueryGraphValueDto {
  @ApiProperty({ type: String })
  @IsString()
  device: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  moduleId: number;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  inputId: number;

  // โหมด Preset (ถ้าให้ before จะถูกใช้แทน start/end)
  @ApiProperty({
    type: String,
    required: false,
    description: "ช่วงเวลาแบบ preset: '1h' | '4h' | '1d' | '1w' | '1y'",
  })
  @IsOptional()
  @IsIn(['1h', '4h', '1d', '1w', '1y'])
  before?: '1h' | '4h' | '1d' | '1w' | '1y';

  // โหมด Custom (ISO string): ใช้เมื่อไม่ส่ง before
  @ApiProperty({
    required: false,
    description: 'ISO start datetime (เช่น 2025-09-17T00:00:00Z)',
  })
  @IsOptional()
  @IsString()
  start?: string;

  @ApiProperty({
    required: false,
    description: 'ISO end datetime (เช่น 2025-09-17T12:00:00Z)',
  })
  @IsOptional()
  @IsString()
  end?: string;

  // ปรับแต่งการตอบสนอง
  @ApiProperty({
    required: false,
    description: 'จำนวนจุดสูงสุดหลัง downsample (default 1200)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPoints?: number;

  @ApiProperty({
    required: false,
    description: 'timeout ของคำขอ (ms) default 6000, max 15000',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  timeoutMs?: number;

  @ApiProperty({
    required: false,
    description: 'formula group number',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  computeFormulaId?: number;
}
