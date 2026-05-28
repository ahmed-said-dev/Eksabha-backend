import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisEnabled = configService.get<boolean>('REDIS_ENABLED', false);
        const redis = new IORedis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          enableOfflineQueue: false,
          maxRetriesPerRequest: null,
          lazyConnect: true,
          retryStrategy: () => null,
        });

        if (!redisEnabled) {
          console.warn('[redis] disabled by REDIS_ENABLED=false');
          return redis;
        }

        redis.on('error', (error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[redis] connection error: ${message}`);
        });

        redis.connect().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[redis] initial connect failed: ${message}`);
        });

        return redis;
      },
    },
  ],
  exports: [REDIS_CONNECTION],
})
export class CacheModule {}
