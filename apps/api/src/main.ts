import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { readEnv } from './env.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const env = readEnv(process.env);
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(env.apiPort);
}
await bootstrap();
