import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength, ArrayUnique, ValidateIf, IsUrl } from 'class-validator';

export enum LogbookRoleEnumDto { Admin = 'Admin', User = 'User' }

export class CreateLogbookUserDto {
  @IsString() @MaxLength(50)
  username: string;

  @ValidateIf((o) => (o?.role ?? LogbookRoleEnumDto.User) === LogbookRoleEnumDto.Admin)
  @IsString() @MaxLength(255)
  password?: string;

  @IsOptional() @IsString() @MaxLength(120)
  nickname?: string;

  @IsOptional() @IsEnum(LogbookRoleEnumDto)
  role?: LogbookRoleEnumDto;

  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsUrl({ require_protocol: false }, { message: 'avatarUrl must be a valid URL' }) @MaxLength(512)
  avatarUrl?: string;

  @IsOptional() @IsString() @MaxLength(50)
  avatarIcon?: string;

  @IsOptional() @IsArray() @ArrayUnique()
  allowedPonds?: number[];
}

export class UpdateLogbookUserDto {
  @IsOptional() @IsString() @MaxLength(120)
  nickname?: string;

  @IsOptional() @IsEnum(LogbookRoleEnumDto)
  role?: LogbookRoleEnumDto;

  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsArray() @ArrayUnique()
  allowedPonds?: number[];

  @IsOptional() @IsString() @MaxLength(255)
  password?: string;

  @IsOptional() @IsUrl({ require_protocol: false }, { message: 'avatarUrl must be a valid URL' }) @MaxLength(512)
  avatarUrl?: string;

  @IsOptional() @IsString() @MaxLength(50)
  avatarIcon?: string;
}
