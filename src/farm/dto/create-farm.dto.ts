import { ApiProperty } from '@nestjs/swagger';

export class CreateFarmDto {}

export class QueryGraphValueDto {
  @ApiProperty({
    type: String,
  })
  device: string;

  @ApiProperty({
    type: Number,
  })
  moduleId: number;

  @ApiProperty({
    type: Number,
  })
  inputId: number;

  @ApiProperty({
    type: String,
    required: false,
    description: "ช่วงเวลา เช่น '1h', '4h', '1d'",
  })
  before?: string;
}
