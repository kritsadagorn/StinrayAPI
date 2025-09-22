import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule,{
    cors: true
  });
  const config = new DocumentBuilder()
  .setTitle('ECU')
  .setDescription('ECU Aquarium')
  .setVersion('1.0')
  .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  
  const port = process.env.PORT || 3000
  app.setGlobalPrefix('api')

  await app.listen(port,() => {
    console.log('Start Port : ', port)
  });
}

bootstrap();
