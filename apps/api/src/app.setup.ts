import {
  ValidationPipe,
  type INestApplication,
  type ValidationPipeOptions,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export const validationOptions: ValidationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
};

// Create the application with bodyParser:false so only the bounded JSON parser is active.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  (app as NestExpressApplication).set('trust proxy', false);
  app.use(helmet());
  app.use(cookieParser());
  (app as NestExpressApplication).useBodyParser('json', { limit: '32kb' });
  app.useGlobalPipes(new ValidationPipe(validationOptions));
}
