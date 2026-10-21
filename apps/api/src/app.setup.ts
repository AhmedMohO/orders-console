import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { validationOptions } from './common/consts/validation.js';

// Create the application with bodyParser:false so only the bounded JSON parser is active.
export function configureApp(app: INestApplication): void {
  const expressApp = app as NestExpressApplication;
  app.setGlobalPrefix('api');
  expressApp.set('trust proxy', false);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(helmet());
  app.use(cookieParser());
  expressApp.useBodyParser('json', { limit: '32kb' });
  app.useGlobalPipes(new ValidationPipe(validationOptions));
}
