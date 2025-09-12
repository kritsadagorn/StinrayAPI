import { Injectable } from '@nestjs/common';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { PrismaService } from 'src/PrismaService/prisma.service';
import { Farm, Prisma, Device, InputModuleMeterValue } from '@prisma/client';

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
      include
    });
    return result
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
      include
    });
    return result
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
      orderBy
    });
    return result
  }
}
