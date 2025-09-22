import { IsEnum, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export enum LogMetricEnumDto {
  ph = 'ph',
  waterTemp = 'waterTemp',
  nitrite = 'nitrite',
  nitrate = 'nitrate',
  amonia = 'amonia',
  voltage = 'voltage',
  oxyPct = 'oxyPct',
  oxyMgL = 'oxyMgL',
  note = 'note',
}

export class CreateEntryDto {
  @IsEnum(LogMetricEnumDto)
  metric: LogMetricEnumDto;

  @IsOptional()
  @IsNumber()
  valueDecimal?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  byName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  byUserId?: string;

  @IsOptional()
  recordedAt?: Date;
}
