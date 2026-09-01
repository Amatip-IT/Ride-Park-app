import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { SanitizeInterceptor } from './common/sanitize.interceptor';
import { MongoExceptionFilter } from './common/mongo-exception.filter';
import {
  assertProductionSecurityConfig,
  getAllowedCorsOrigins,
} from './common/cors-config';

const bootstrap = async (): Promise<void> => {
  assertProductionSecurityConfig();

  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for Stripe webhooks
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: getAllowedCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'stripe-signature',
      'x-request-id',
    ],
    exposedHeaders: [
      'x-request-id',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ],
  });

  app.setGlobalPrefix('api');

  // Global sanitization
  app.useGlobalInterceptors(new SanitizeInterceptor());

  // Global MongoDB exception filter
  app.useGlobalFilters(new MongoExceptionFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = process.env.PORT ?? 5001;
  await app.listen(port, '0.0.0.0');

  console.log(`Application running on: http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
};

void bootstrap();
