import { PartialType } from '@nestjs/mapped-types';
import { CreatePondDto } from './create-pond.dto';

export class UpdatePondDto extends PartialType(CreatePondDto) {}
