import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FarmModule } from './farm/farm.module';
import { LogbookModule } from './logbook/logbook.module';

@Module({
  imports: [FarmModule, LogbookModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
