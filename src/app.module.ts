import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FarmModule } from './farm/farm.module';

@Module({
  imports: [FarmModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
