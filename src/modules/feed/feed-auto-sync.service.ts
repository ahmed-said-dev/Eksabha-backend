import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FixtureStatus } from '../../common/database';
import { FixtureEntity } from '../tournament/entities/fixture.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { FeedService } from './feed.service';

/** Polling intervals in seconds */
const INTERVAL_IDLE = 5 * 60;           // 5 min — no live matches
const INTERVAL_UPCOMING = 2 * 60;       // 2 min — match starting within 30 min
const INTERVAL_LIVE = 30;               // 30s   — live matches in progress
const INTERVAL_JUST_FINISHED = 60;      // 1 min — match just finished (cool-down)

type SyncMode = 'idle' | 'upcoming' | 'live' | 'cool_down';

@Injectable()
export class FeedAutoSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedAutoSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private currentMode: SyncMode = 'idle';
  private currentIntervalMs = INTERVAL_IDLE * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly feedService: FeedService,
    @InjectRepository(FixtureEntity)
    private readonly fixturesRepository: Repository<FixtureEntity>,
    private readonly realtimeEventsService: RealtimeEventsService,
  ) {}

  onModuleInit() {
    const enabled = this.readBoolean('EXTERNAL_FEED_AUTO_SYNC_ENABLED', false);

    if (!enabled) {
      this.logger.log('Automatic feed sync is disabled.');
      return;
    }

    const runOnBoot = this.readBoolean('EXTERNAL_FEED_AUTO_SYNC_ON_BOOT', true);

    if (runOnBoot) {
      void this.runCycle('startup');
    }

    this.scheduleNext();
    this.logger.log('Adaptive feed auto-sync enabled.');
  }

  onModuleDestroy() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Determine the optimal sync mode based on fixture state */
  private async detectSyncMode(): Promise<{ mode: SyncMode; intervalMs: number }> {
    const now = new Date();

    // Check for live matches
    const liveCount = await this.fixturesRepository.count({
      where: [
        { status: FixtureStatus.LIVE },
        { status: FixtureStatus.HALF_TIME },
      ],
    });

    if (liveCount > 0) {
      return { mode: 'live', intervalMs: INTERVAL_LIVE * 1000 };
    }

    // Check for recently finished matches (within last 5 minutes)
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const recentlyFinished = await this.fixturesRepository
      .createQueryBuilder('f')
      .where('f.status = :status', { status: FixtureStatus.FULL_TIME })
      .andWhere('f.updatedAt >= :since', { since: fiveMinAgo })
      .getCount();

    if (recentlyFinished > 0) {
      return { mode: 'cool_down', intervalMs: INTERVAL_JUST_FINISHED * 1000 };
    }

    // Check for upcoming matches (within 30 minutes)
    const thirtyMinFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    const upcomingCount = await this.fixturesRepository
      .createQueryBuilder('f')
      .where('f.status = :status', { status: FixtureStatus.SCHEDULED })
      .andWhere('f.kickoffAt BETWEEN :now AND :soon', { now, soon: thirtyMinFromNow })
      .getCount();

    if (upcomingCount > 0) {
      return { mode: 'upcoming', intervalMs: INTERVAL_UPCOMING * 1000 };
    }

    return { mode: 'idle', intervalMs: INTERVAL_IDLE * 1000 };
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
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;

    try {
      const result = await this.feedService.syncAllTournaments(true);

      const { mode, intervalMs } = await this.detectSyncMode();
      const modeChanged = mode !== this.currentMode;
      this.currentMode = mode;
      this.currentIntervalMs = intervalMs;

      if (modeChanged) {
        this.logger.log(`Sync mode changed to '${mode}' (interval: ${intervalMs / 1000}s)`);
      }

      this.logger.debug(
        `Feed sync (${reason}) finished. mode=${mode}, totalUpdated=${result.totalUpdated}, tournaments=${result.tournaments.length}`,
      );

      if (mode === 'live') {
        const liveFixtures = await this.fixturesRepository.find({
          where: [
            { status: FixtureStatus.LIVE },
            { status: FixtureStatus.HALF_TIME },
          ],
          relations: { homeTeam: true, awayTeam: true },
          order: { kickoffAt: 'ASC' },
        });

        if (liveFixtures.length > 0) {
          this.realtimeEventsService.emitLiveMatchTick({
            liveCount: liveFixtures.length,
            fixtures: liveFixtures.map((f) => ({
              fixtureId: f.id,
              status: f.status,
              homeScore: f.homeScore,
              awayScore: f.awayScore,
              currentMinute: f.currentMinute,
              homeTeamName: f.homeTeam?.shortName,
              awayTeamName: f.awayTeam?.shortName,
            })),
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected automatic feed sync failure.';
      this.logger.error(`Feed sync (${reason}) failed: ${message}`);
    } finally {
      this.isSyncing = false;
    }
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
}
