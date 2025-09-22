import { Module } from '@nestjs/common';
import { LogbookService } from './logbook.service';
import { LogbookController } from './logbook.controller';
import { PrismaService } from '../PrismaService/prisma.service';

@Module({
  providers: [PrismaService, LogbookService],
  controllers: [LogbookController],
})
export class LogbookModule {}
