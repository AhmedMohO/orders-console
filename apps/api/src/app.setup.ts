import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { validationOptions } from './common/consts/validation.js';

// Create the application with bodyParser:false so only the bounded JSON parser is active.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  (app as NestExpressApplication).set('trust proxy', false);
  app.use(helmet());
  app.use(cookieParser());
  (app as NestExpressApplication).useBodyParser('json', { limit: '32kb' });
  app.useGlobalPipes(new ValidationPipe(validationOptions));
}
