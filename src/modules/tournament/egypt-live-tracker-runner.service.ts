import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FixtureStatus } from '../../common/database';
import { FixtureEntity } from './entities/fixture.entity';
import { EgyptLiveTrackerService } from './egypt-live-tracker.service';

const EGYPTIAN_PREMIER_LEAGUE_COMPETITION_KEY = 'egyptian-premier-league-current';

type RunnerMode = 'idle' | 'upcoming' | 'live' | 'cool_down';

@Injectable()
export class EgyptLiveTrackerRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EgyptLiveTrackerRunnerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private currentMode: RunnerMode = 'idle';
  private currentIntervalMs = 120_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly egyptLiveTrackerService: EgyptLiveTrackerService,
    @InjectRepository(FixtureEntity)
    private readonly fixturesRepository: Repository<FixtureEntity>,
  ) {}

  onModuleInit() {
    const enabled = this.readBoolean('EGYPT_LIVE_TRACKER_ENABLED', true);
    if (!enabled) {
      this.logger.log('Egypt live tracker runner is disabled.');
      return;
    }

    const runOnBoot = this.readBoolean('EGYPT_LIVE_TRACKER_ON_BOOT', true);
    if (runOnBoot) {
      void this.runCycle('startup').finally(() => this.scheduleNext());
      return;
    }

    this.scheduleNext();
    this.logger.log('Egypt live tracker runner enabled.');
  }

  onModuleDestroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(async () => {
      await this.runCycle('interval');
      this.scheduleNext();
    }, this.currentIntervalMs);
  }

  private async runCycle(reason: 'startup' | 'interval') {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.egyptLiveTrackerService.refreshLiveFixtures();
      const { mode, intervalMs } = await this.detectMode();
      const modeChanged = mode !== this.currentMode;

      this.currentMode = mode;
      this.currentIntervalMs = intervalMs;

      if (modeChanged) {
        this.logger.log(`Egypt live tracker mode changed to '${mode}' (interval: ${intervalMs / 1000}s)`);
      }

      this.logger.debug(
        `Egypt live tracker cycle (${reason}) finished. mode=${mode}, updated=${result.updatedFixtures}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected Egypt live tracker failure.';
      this.logger.error(`Egypt live tracker cycle (${reason}) failed: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async detectMode(): Promise<{ mode: RunnerMode; intervalMs: number }> {
    const now = new Date();
    const upcomingWindowMinutes = this.readNumber('EGYPT_LIVE_TRACKER_UPCOMING_WINDOW_MINUTES', 15);
    const cooldownWindowMinutes = this.readNumber('EGYPT_LIVE_TRACKER_COOLDOWN_WINDOW_MINUTES', 5);

    const liveCount = await this.fixturesRepository.count({
      where: [
        {
          tournament: { competitionKey: EGYPTIAN_PREMIER_LEAGUE_COMPETITION_KEY },
          status: FixtureStatus.LIVE,
        },
        {
          tournament: { competitionKey: EGYPTIAN_PREMIER_LEAGUE_COMPETITION_KEY },
          status: FixtureStatus.HALF_TIME,
        },
      ],
    });

    if (liveCount > 0) {
      return {
        mode: 'live',
        intervalMs: this.readNumber('EGYPT_LIVE_TRACKER_LIVE_INTERVAL_SECONDS', 5) * 1000,
      };
    }

    const cooldownSince = new Date(now.getTime() - cooldownWindowMinutes * 60 * 1000);
    const recentlyFinished = await this.fixturesRepository
      .createQueryBuilder('fixture')
      .leftJoin('fixture.tournament', 'tournament')
      .where('tournament.competitionKey = :competitionKey', { competitionKey: EGYPTIAN_PREMIER_LEAGUE_COMPETITION_KEY })
      .andWhere('fixture.status = :status', { status: FixtureStatus.FULL_TIME })
      .andWhere('fixture.updatedAt >= :since', { since: cooldownSince })
      .getCount();

    if (recentlyFinished > 0) {
      return {
        mode: 'cool_down',
        intervalMs: this.readNumber('EGYPT_LIVE_TRACKER_COOLDOWN_INTERVAL_SECONDS', 20) * 1000,
      };
    }

    const upcomingUntil = new Date(now.getTime() + upcomingWindowMinutes * 60 * 1000);
    const upcomingCount = await this.fixturesRepository
      .createQueryBuilder('fixture')
      .leftJoin('fixture.tournament', 'tournament')
      .where('tournament.competitionKey = :competitionKey', { competitionKey: EGYPTIAN_PREMIER_LEAGUE_COMPETITION_KEY })
      .andWhere('fixture.status = :status', { status: FixtureStatus.SCHEDULED })
      .andWhere('fixture.kickoffAt BETWEEN :now AND :until', { now, until: upcomingUntil })
      .getCount();

    if (upcomingCount > 0) {
      return {
        mode: 'upcoming',
        intervalMs: this.readNumber('EGYPT_LIVE_TRACKER_UPCOMING_INTERVAL_SECONDS', 15) * 1000,
      };
    }

    return {
      mode: 'idle',
      intervalMs: this.readNumber('EGYPT_LIVE_TRACKER_IDLE_INTERVAL_SECONDS', 120) * 1000,
    };
  }

  private readBoolean(key: string, fallback: boolean) {
    const value = this.configService.get<string | boolean | null | undefined>(key);

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();

      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }

      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }

    return fallback;
  }

  private readNumber(key: string, fallback: number) {
    const value = this.configService.get<string | number | null | undefined>(key);

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }
}
