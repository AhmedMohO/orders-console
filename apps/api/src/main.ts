import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { readEnv } from './env.js';

async function bootstrap() {
  const env = readEnv(process.env);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors({ origin: env.appOrigin });
  await app.listen(env.apiPort);
}
await bootstrap();
