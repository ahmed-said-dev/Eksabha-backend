import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { API_PREFIX } from './common/constants/api.constants';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

function isPrivateIpv4Hostname(hostname: string) {
  const octets = hostname.split('.').map(Number);

  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function isAllowedDevelopmentOrigin(origin: string) {
  try {
    const { protocol, hostname } = new URL(origin);

    if (protocol !== 'http:') {
      return false;
    }

    return hostname === 'localhost' || hostname === '127.0.0.1' || isPrivateIpv4Hostname(hostname);
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const port = configService.get<number>('PORT', 4400);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');
  const configuredCorsOrigins =
    corsOrigin === '*'
      ? []
      : corsOrigin
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);
  const host = configService.get<string>('HOST') ?? '0.0.0.0';

  app.use(helmet());
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || corsOrigin === '*') {
        callback(null, true);
        return;
      }

      const isConfiguredOrigin = configuredCorsOrigins.includes(origin);
      const isLocalDevelopmentOrigin = nodeEnv === 'development' && isAllowedDevelopmentOrigin(origin);

      if (isConfiguredOrigin || isLocalDevelopmentOrigin) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(port, host);
}

bootstrap().catch((error: unknown) => {
  console.error('[Bootstrap] Failed to start server');
  console.error(error);
  process.exit(1);
});
