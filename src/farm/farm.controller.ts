import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { FarmService } from './farm.service';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { Device, InputModule, Prisma } from '@prisma/client';

interface DeviceCustom extends Device {
  InputModule : InputModule[]
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
      InputModule: true
    };
    const where: Prisma.DeviceWhereInput = { 
      Plant:{
        id:70
      }
    };
    const result = await this.farmService.findAllDevice({ where, include }) as DeviceCustom[]
    const sensorResult = result.map((item) => item.InputModule).flat()
    const data = sensorResult.map(async (item) =>  {
      const { device, moduleId, inputId } = item
      const where : Prisma.InputModuleMeterValueWhereInput = { device, moduleId, inputId }
      const orderBy : Prisma.InputModuleMeterValueOrderByWithRelationInput = { 
        valueTimestamp : 'desc'
      }
      const resolved = await this.farmService.findMeterModuleSensorValue({
        where, orderBy, take: 20
      })
      return { ...item, data: resolved }
    })
    const resultData = await Promise.all(data)
    const setDataDevice = await result.map((item) => {
      const result = resultData.filter(items => items.device === item.id)
      return { ...item, InputModule: result }
    })
    return setDataDevice;
  }
  
}
