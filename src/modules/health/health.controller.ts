import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';
import { DataSource } from 'typeorm';

import { REDIS_CONNECTION } from '../../infra/cache/cache.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Inject(REDIS_CONNECTION)
    private readonly redis: IORedis,
  ) {}

  @Get('live')
  getLive() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async getReady() {
    const checks: Record<string, { status: 'ok' | 'degraded' | 'down'; detail?: string }> = {
      api: { status: 'ok' },
      postgres: { status: 'ok' },
      redis: { status: 'ok' },
      queues: { status: 'ok' },
      websocket: { status: 'ok' },
    };

    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      checks.postgres = {
        status: 'down',
        detail: error instanceof Error ? error.message : 'Database probe failed',
      };
    }

    const redisEnabled = this.configService.get<boolean>('REDIS_ENABLED', false);
    if (!redisEnabled) {
      checks.redis = { status: 'degraded', detail: 'Disabled by REDIS_ENABLED=false' };
      checks.queues = { status: 'degraded', detail: 'Queue backend disabled with Redis' };
    } else {
      try {
        await this.redis.ping();
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Redis ping failed';
        checks.redis = { status: 'down', detail };
        checks.queues = { status: 'down', detail: `Queue backend unavailable: ${detail}` };
      }
    }

    const overallStatus = Object.values(checks).some((entry) => entry.status === 'down')
      ? 'down'
      : Object.values(checks).some((entry) => entry.status === 'degraded')
        ? 'degraded'
        : 'ready';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: checks,
    };
  }
}
