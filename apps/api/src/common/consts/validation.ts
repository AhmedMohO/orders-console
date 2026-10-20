import type { ValidationPipeOptions } from '@nestjs/common';

export const validationOptions: ValidationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
};
