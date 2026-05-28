import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FixtureStatus, PlayerPosition } from '../../common/database';
import { PlayerEntity } from '../catalog/entities/player.entity';
import { FantasyPickEntity } from '../fantasy/entities/fantasy-pick.entity';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { FixtureEntity } from '../tournament/entities/fixture.entity';
import { ScoreFixtureEventDto } from './dto/score-fixture-event.dto';
import { UpsertScoringRulesDto } from './dto/upsert-scoring-rules.dto';
import {
  FixtureScoringRunEntity,
  FixtureScoringRunStatus,
} from './entities/fixture-scoring-run.entity';
import { PlayerScoreEventEntity } from './entities/player-score-event.entity';
import { PlayerScoreLogEntity } from './entities/player-score-log.entity';
import { ScoringRuleEntity } from './entities/scoring-rule.entity';
import { ScoringRuleSetEntity } from './entities/scoring-rule-set.entity';

const REQUIRED_FANTASY_EVENT_RULES: Array<{
  eventType: string;
  position: PlayerPosition;
  points: number;
  description: string;
}> = [
  ...([PlayerPosition.GOALKEEPER, PlayerPosition.DEFENDER, PlayerPosition.MIDFIELDER, PlayerPosition.FORWARD] as const).flatMap((position) => ([
    {
      eventType: 'appearance',
      position,
      points: 1,
      description: 'Player appearance registered',
    },
    {
      eventType: 'played_60_minutes',
      position,
      points: 1,
      description: 'Player completed 60 minutes or more',
    },
    {
      eventType: 'yellow_card',
      position,
      points: -1,
      description: 'Yellow card penalty',
    },
    {
      eventType: 'red_card',
      position,
      points: -3,
      description: 'Red card penalty',
    },
    {
      eventType: 'bonus_1',
      position,
      points: 1,
      description: 'Single bonus point awarded',
    },
    {
      eventType: 'bonus_2',
      position,
      points: 2,
      description: 'Two bonus points awarded',
    },
    {
      eventType: 'bonus_3',
      position,
      points: 3,
      description: 'Three bonus points awarded',
    },
  ])),
  {
    eventType: 'save',
    position: PlayerPosition.GOALKEEPER,
    points: 1,
    description: 'Goalkeeper save',
  },
  {
    eventType: 'penalty_save',
    position: PlayerPosition.GOALKEEPER,
    points: 5,
    description: 'Penalty save by a goalkeeper',
  },
  {
    eventType: 'clean_sheet',
    position: PlayerPosition.GOALKEEPER,
    points: 4,
    description: 'Clean sheet for a goalkeeper',
  },
  {
    eventType: 'clean_sheet',
    position: PlayerPosition.DEFENDER,
    points: 4,
    description: 'Clean sheet for a defender',
  },
  {
    eventType: 'clean_sheet',
    position: PlayerPosition.MIDFIELDER,
    points: 1,
    description: 'Clean sheet for a midfielder',
  },
];

const AUTO_GENERATED_SOFASCORE_EVENT_SOURCE = 'sofascore_incident';
const LEGACY_ADMIN_DERIVED_EVENT_SOURCE = 'admin_fixture_event';
const LEGACY_ADMIN_DERIVED_EVENT_REASON = 'admin_fantasy_points_tab';
const RECOMPUTED_DERIVED_EVENT_TYPES = new Set<string>([
  'appearance',
  'played_60_minutes',
  'played_90_minutes',
  'clean_sheet',
  'save',
  'penalty_save',
  'yellow_card',
  'red_card',
  'goal',
  'assist',
  'own_goal',
  'penalty_scored',
  'penalty_missed',
]);
const LEGACY_SCORING_RULE_EVENT_TYPES = new Set<string>(['played_90_minutes']);

type DerivedFixtureEventType =
  | 'goal'
  | 'assist'
  | 'own_goal'
  | 'yellow_card'
  | 'red_card'
  | 'penalty_scored'
  | 'penalty_missed'
  | 'penalty_save';

type DerivedSofaIncident = {
  id: string;
  minute: number;
  addedTime: number | null;
  mappedType: string;
  teamSide: 'home' | 'away' | null;
  playerId: string | null;
  playerName: string | null;
  assistId: string | null;
  assistName: string | null;
  reason: string | null;
};

type ResolvedFixtureStarter = {
  player: PlayerEntity;
  teamSide: 'home' | 'away';
};

type ResolvedFixtureParticipant = ResolvedFixtureStarter & {
  started: boolean;
  enteredMinute: number;
  exitedMinute: number;
  playedMinutes: number;
};

@Injectable()
export class ScoringService {
  constructor(
    @InjectRepository(PlayerScoreLogEntity)
    private readonly playerScoreLogsRepository: Repository<PlayerScoreLogEntity>,
    @InjectRepository(PlayerScoreEventEntity)
    private readonly playerScoreEventsRepository: Repository<PlayerScoreEventEntity>,
    @InjectRepository(FixtureScoringRunEntity)
    private readonly fixtureScoringRunsRepository: Repository<FixtureScoringRunEntity>,
    @InjectRepository(ScoringRuleSetEntity)
    private readonly scoringRuleSetsRepository: Repository<ScoringRuleSetEntity>,
    @InjectRepository(ScoringRuleEntity)
    private readonly scoringRulesRepository: Repository<ScoringRuleEntity>,
    @InjectRepository(FixtureEntity)
    private readonly fixturesRepository: Repository<FixtureEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playersRepository: Repository<PlayerEntity>,
    @InjectRepository(FantasyPickEntity)
    private readonly fantasyPicksRepository: Repository<FantasyPickEntity>,
    @InjectRepository(FantasyTeamEntity)
    private readonly fantasyTeamsRepository: Repository<FantasyTeamEntity>,
    private readonly leaderboardsService: LeaderboardsService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeEventsService: RealtimeEventsService,
  ) {}

  getStatus() {
    return {
      module: 'scoring',
      status: 'rule-engine-and-materialization-ready',
      nextSteps: ['bonus resolver', 'rule versioning', 'automatic feed ingestion'],
    };
  }

  async getExistingFixtureEvent(
    fixtureId: string,
    playerId: string,
    type: string,
    minute: number,
  ) {
    return this.playerScoreEventsRepository.findOne({
      where: {
        fixture: { id: fixtureId },
        player: { id: playerId },
        type,
        minute,
      },
      relations: { fixture: true, player: true },
    });
  }

  async getScoringRules(code?: string, activeOnly = false) {
    if (code) {
      const ruleSet = await this.scoringRuleSetsRepository.findOne({
        where: { code },
        relations: { rules: true },
      });

      if (!ruleSet) {
        throw new NotFoundException(`Scoring rule set ${code} not found.`);
      }

      await this.ensureRequiredFantasyRules(ruleSet);

      return this.serializeRuleSet(ruleSet);
    }

    if (activeOnly) {
      const [activeRuleSet] = await this.scoringRuleSetsRepository.find({
        where: { isActive: true },
        relations: { rules: true },
        order: { version: 'DESC', createdAt: 'DESC' },
        take: 1,
      });

      if (!activeRuleSet) {
        throw new NotFoundException('No active scoring rule set configured yet.');
      }

      await this.ensureRequiredFantasyRules(activeRuleSet);

      return this.serializeRuleSet(activeRuleSet);
    }

    const ruleSets = await this.scoringRuleSetsRepository.find({
      relations: { rules: true },
      order: { isActive: 'DESC', version: 'DESC', createdAt: 'DESC' },
    });

    for (const ruleSet of ruleSets) {
      await this.ensureRequiredFantasyRules(ruleSet);
    }

    return ruleSets.map((ruleSet) => this.serializeRuleSet(ruleSet));
  }

  async upsertScoringRules(dto: UpsertScoringRulesDto) {
    let ruleSet = await this.scoringRuleSetsRepository.findOne({
      where: { code: dto.ruleSet.code },
      relations: { rules: true },
    });

    if (ruleSet) {
      ruleSet.name = dto.ruleSet.name;
      ruleSet.description = dto.ruleSet.description ?? null;
      ruleSet.isActive = dto.ruleSet.isActive;
      ruleSet.version = dto.ruleSet.version ?? ruleSet.version;
    } else {
      ruleSet = this.scoringRuleSetsRepository.create({
        name: dto.ruleSet.name,
        code: dto.ruleSet.code,
        description: dto.ruleSet.description ?? null,
        isActive: dto.ruleSet.isActive,
        version: dto.ruleSet.version ?? 1,
      });
    }

    if (dto.ruleSet.isActive) {
      await this.scoringRuleSetsRepository
        .createQueryBuilder()
        .update(ScoringRuleSetEntity)
        .set({ isActive: false })
        .where('code != :code', { code: dto.ruleSet.code })
        .execute();
    }

    ruleSet = await this.scoringRuleSetsRepository.save(ruleSet);

    const existingRules = await this.scoringRulesRepository.find({
      where: { ruleSet: { id: ruleSet.id } },
      relations: { ruleSet: true },
    });

    const existingRulesByKey = new Map(
      existingRules.map((rule) => [this.buildRuleKey(rule.eventType, rule.position), rule]),
    );

    for (const nextRule of dto.rules) {
      const ruleKey = this.buildRuleKey(nextRule.eventType, nextRule.position);
      const existingRule = existingRulesByKey.get(ruleKey);

      if (existingRule) {
        existingRule.points = nextRule.points;
        existingRule.isEnabled = nextRule.isEnabled ?? true;
        existingRule.description = nextRule.description ?? null;
        await this.scoringRulesRepository.save(existingRule);
        continue;
      }

      await this.scoringRulesRepository.save(
        this.scoringRulesRepository.create({
          eventType: nextRule.eventType,
          position: nextRule.position,
          points: nextRule.points,
          isEnabled: nextRule.isEnabled ?? true,
          description: nextRule.description ?? null,
          ruleSet,
        }),
      );
    }

    return this.getScoringRules(ruleSet.code);
  }

  async getFixtureScoringLogs(fixtureId: string) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: { homeTeam: true, awayTeam: true },
    });

    const logs = await this.playerScoreLogsRepository.find({
      where: { fixture: { id: fixtureId } },
      relations: { player: { team: true }, fixture: true },
      order: { totalPoints: 'DESC', createdAt: 'ASC' },
    });

    const runs = await this.fixtureScoringRunsRepository.find({
      where: { fixture: { id: fixtureId } },
      relations: { fixture: true },
      order: { createdAt: 'DESC' },
    });

    const materializedLogs = logs.filter(
      (scoreLog) => Boolean(scoreLog.player?.id)
        && Array.isArray(scoreLog.eventSummary)
        && scoreLog.eventSummary.length > 0,
    );

    return {
      fixture,
      logs: materializedLogs,
      runs,
      status: 'read-model-ready',
    };
  }

  async getScoringLogsByFixtures(fixtureIds: string[]) {
    if (fixtureIds.length === 0) {
      return [];
    }

    return this.playerScoreLogsRepository.find({
      where: fixtureIds.map((fixtureId) => ({ fixture: { id: fixtureId } })),
      relations: { player: true, fixture: true },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async getScoringLogsByFilters(query: { fixtureId?: string; playerId?: string }) {
    const queryBuilder = this.playerScoreLogsRepository
      .createQueryBuilder('scoreLog')
      .leftJoinAndSelect('scoreLog.player', 'player')
      .leftJoinAndSelect('scoreLog.fixture', 'fixture')
      .leftJoinAndSelect('fixture.matchday', 'matchday')
      .leftJoinAndSelect('fixture.homeTeam', 'homeTeam')
      .leftJoinAndSelect('fixture.awayTeam', 'awayTeam')
      .orderBy('scoreLog.createdAt', 'DESC')
      .take(150);

    if (query.fixtureId) {
      queryBuilder.andWhere('fixture.id = :fixtureId', { fixtureId: query.fixtureId });
    }

    if (query.playerId) {
      queryBuilder.andWhere('player.id = :playerId', { playerId: query.playerId });
    }

    const logs = await queryBuilder.getMany();

    return logs.filter(
      (scoreLog) => Boolean(scoreLog.player?.id)
        && Array.isArray(scoreLog.eventSummary)
        && scoreLog.eventSummary.length > 0,
    );
  }

  async getScoringRunsForFixtures(fixtureIds: string[]) {
    if (fixtureIds.length === 0) {
      return [];
    }

    return this.fixtureScoringRunsRepository.find({
      where: fixtureIds.map((fixtureId) => ({ fixture: { id: fixtureId } })),
      relations: { fixture: true },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async getScoringRunsByFilters(query: { fixtureId?: string; matchdayId?: string }) {
    const queryBuilder = this.fixtureScoringRunsRepository
      .createQueryBuilder('run')
      .leftJoinAndSelect('run.fixture', 'fixture')
      .leftJoinAndSelect('fixture.matchday', 'matchday')
      .leftJoinAndSelect('fixture.homeTeam', 'homeTeam')
      .leftJoinAndSelect('fixture.awayTeam', 'awayTeam')
      .orderBy('run.createdAt', 'DESC')
      .take(120);

    if (query.fixtureId) {
      queryBuilder.andWhere('fixture.id = :fixtureId', { fixtureId: query.fixtureId });
    }

    if (query.matchdayId) {
      queryBuilder.andWhere('matchday.id = :matchdayId', { matchdayId: query.matchdayId });
    }

    return queryBuilder.getMany();
  }

  async scoreFixtureEvent(dto: ScoreFixtureEventDto) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: dto.fixtureId },
      relations: { homeTeam: true, awayTeam: true, matchday: true },
    });

    if (!fixture) {
      throw new NotFoundException('Fixture not found.');
    }

    const player = await this.playersRepository.findOne({
      where: { id: dto.playerId },
      relations: { team: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found.');
    }

    const eligibleTeamIds = new Set([fixture.homeTeam.id, fixture.awayTeam.id]);
    if (!player.team || !eligibleTeamIds.has(player.team.id)) {
      throw new BadRequestException('Selected player does not belong to this fixture.');
    }

    const resolvedPoints = await this.resolvePointsForEvent(
      dto.type,
      player.position,
      dto.points,
    );

    let scoringRun = await this.fixtureScoringRunsRepository.findOne({
      where: { fixture: { id: fixture.id } },
      relations: { fixture: true },
      order: { createdAt: 'DESC' },
    });

    scoringRun ??= this.fixtureScoringRunsRepository.create({
      fixture,
      status: FixtureScoringRunStatus.PENDING,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    });

    scoringRun.status = FixtureScoringRunStatus.PROCESSING;
    scoringRun.startedAt = new Date();
    scoringRun.completedAt = null;
    scoringRun.errorMessage = null;
    scoringRun = await this.fixtureScoringRunsRepository.save(scoringRun);

    try {
      let scoreLog = await this.playerScoreLogsRepository.findOne({
        where: { fixture: { id: fixture.id }, player: { id: player.id } },
        relations: { fixture: true, player: true },
      });

      scoreLog ??= await this.playerScoreLogsRepository.save(
        this.playerScoreLogsRepository.create({
          fixture,
          player,
          totalPoints: 0,
          bonusPoints: 0,
          eventSummary: [],
        }),
      );

      const eventDetails = {
        ...dto.details,
        pointsSource: resolvedPoints.source,
        ruleSetCode: resolvedPoints.ruleSetCode,
      };
      const normalizedEventType = dto.type.trim();
      const awardedBonusPoints = normalizedEventType === 'bonus_1'
        ? 1
        : normalizedEventType === 'bonus_2'
          ? 2
          : normalizedEventType === 'bonus_3'
            ? 3
            : 0;

      const scoreEvent = await this.playerScoreEventsRepository.save(
        this.playerScoreEventsRepository.create({
          playerScoreLog: scoreLog,
          player,
          fixture,
          type: normalizedEventType,
          points: resolvedPoints.points,
          minute: dto.minute,
          details: eventDetails,
        }),
      );

      scoreLog = await this.recalculateScoreLog(scoreLog.id);
      if (awardedBonusPoints > 0) {
        scoreLog.bonusPoints += awardedBonusPoints;
        scoreLog = await this.playerScoreLogsRepository.save(scoreLog);
      }
      const fantasyRefresh = await this.refreshFantasyTeamsForPlayer(player.id);
      const leaderboardRefresh = fixture.matchday
        ? await this.leaderboardsService.materializeForMatchday(fixture.matchday.id)
        : null;
      await this.emitScoringSideEffects({
        fixture,
        player,
        resolvedPoints,
        fantasyRefresh,
        leaderboardRefresh,
        eventType: normalizedEventType,
      });

      scoringRun.status = FixtureScoringRunStatus.COMPLETED;
      scoringRun.completedAt = new Date();
      scoringRun.errorMessage = null;
      await this.fixtureScoringRunsRepository.save(scoringRun);

      return {
        fixtureId: fixture.id,
        playerId: player.id,
        resolvedPoints,
        scoreEvent,
        scoreLog,
        fantasyRefresh,
        leaderboardRefresh,
      };
    } catch (error) {
      scoringRun.status = FixtureScoringRunStatus.FAILED;
      scoringRun.completedAt = new Date();
      scoringRun.errorMessage =
        error instanceof Error ? error.message : 'Unexpected scoring pipeline failure.';
      await this.fixtureScoringRunsRepository.save(scoringRun);

      throw error;
    }
  }

  async getFixtureEvents(fixtureId: string) {
    const fixture = await this.fixturesRepository.findOne({ where: { id: fixtureId } });
    if (!fixture) {
      throw new NotFoundException('Fixture not found.');
    }

    return this.playerScoreEventsRepository.find({
      where: { fixture: { id: fixtureId } },
      relations: { player: { team: true }, fixture: true },
      order: { minute: 'ASC', createdAt: 'ASC' },
    });
  }

  async getFixtureEventsByIds(eventIds: string[]) {
    if (eventIds.length === 0) {
      return [];
    }

    return this.playerScoreEventsRepository.find({
      where: eventIds.map((eventId) => ({ id: eventId })),
      relations: { player: { team: true }, fixture: { matchday: true }, playerScoreLog: true },
      order: { minute: 'ASC', createdAt: 'ASC' },
    });
  }

  async recomputeFixture(fixtureId: string) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: { homeTeam: true, awayTeam: true, matchday: true },
    });

    if (!fixture) {
      throw new NotFoundException('Fixture not found.');
    }

    let scoringRun = await this.fixtureScoringRunsRepository.findOne({
      where: { fixture: { id: fixture.id } },
      relations: { fixture: true },
      order: { createdAt: 'DESC' },
    });

    scoringRun ??= this.fixtureScoringRunsRepository.create({
      fixture,
      status: FixtureScoringRunStatus.PENDING,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    });

    scoringRun.status = FixtureScoringRunStatus.PROCESSING;
    scoringRun.startedAt = new Date();
    scoringRun.completedAt = null;
    scoringRun.errorMessage = null;
    scoringRun = await this.fixtureScoringRunsRepository.save(scoringRun);

    try {
      const autoGeneratedSync = await this.syncAutoGeneratedFixtureEventsFromSofaScore(fixture);

      const scoreLogs = await this.playerScoreLogsRepository.find({
        where: { fixture: { id: fixture.id } },
        relations: { player: true, fixture: true },
        order: { createdAt: 'ASC' },
      });

      const affectedPlayerIds = new Set<string>(autoGeneratedSync.affectedPlayerIds);
      for (const scoreLog of scoreLogs) {
        await this.recalculateScoreLog(scoreLog.id);

        if (scoreLog.player?.id) {
          affectedPlayerIds.add(scoreLog.player.id);
        }
      }

      await this.removeEmptyFixtureScoreLogs(fixture.id);

      const fantasyRefreshes = [] as Array<{
        playerId: string;
        playerTotalPoints: number;
        affectedFantasyTeamIds: string[];
        affectedFantasyTeams: Array<{ fantasyTeamId: string; totalPoints: number }>;
      }>;

      for (const playerId of affectedPlayerIds) {
        fantasyRefreshes.push(await this.refreshFantasyTeamsForPlayer(playerId));
      }

      const leaderboardRefresh = fixture.matchday
        ? await this.leaderboardsService.materializeForMatchday(fixture.matchday.id)
        : null;

      const refreshedLogs = await this.playerScoreLogsRepository.find({
        where: { fixture: { id: fixture.id } },
        relations: { player: true, fixture: true },
        order: { totalPoints: 'DESC', createdAt: 'ASC' },
      });
      const materializedLogs = refreshedLogs.filter((scoreLog) => Boolean(scoreLog.player?.id));

      this.realtimeEventsService.emitScoringUpdated({
        fixtureId: fixture.id,
        scoreLogsProcessed: refreshedLogs.length,
        affectedPlayerIds: Array.from(affectedPlayerIds),
      });

      if (leaderboardRefresh) {
        this.realtimeEventsService.emitLeaderboardUpdated(leaderboardRefresh as Record<string, unknown>);
      }

      scoringRun.status = FixtureScoringRunStatus.COMPLETED;
      scoringRun.completedAt = new Date();
      scoringRun.errorMessage = null;
      await this.fixtureScoringRunsRepository.save(scoringRun);

      return {
        fixtureId: fixture.id,
        autoGeneratedEventsCreated: autoGeneratedSync.createdEvents,
        scoreLogsProcessed: materializedLogs.length,
        affectedPlayerIds: Array.from(affectedPlayerIds),
        logs: materializedLogs,
        fantasyRefreshes,
        leaderboardRefresh,
      };
    } catch (error) {
      scoringRun.status = FixtureScoringRunStatus.FAILED;
      scoringRun.completedAt = new Date();
      scoringRun.errorMessage =
        error instanceof Error ? error.message : 'Unexpected fixture recompute failure.';
      await this.fixtureScoringRunsRepository.save(scoringRun);

      throw error;
    }
  }

  async applyFixtureCorrection(input: {
    fixtureId: string;
    homeScore?: number | null;
    awayScore?: number | null;
    currentMinute?: number | null;
    status?: FixtureStatus | null;
  }) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: input.fixtureId },
      relations: { homeTeam: true, awayTeam: true, matchday: true, tournament: true },
    });

    if (!fixture) {
      throw new NotFoundException('Fixture not found.');
    }

    if (input.homeScore !== undefined) {
      fixture.homeScore = input.homeScore;
    }

    if (input.awayScore !== undefined) {
      fixture.awayScore = input.awayScore;
    }

    if (input.currentMinute !== undefined) {
      fixture.currentMinute = input.currentMinute;
    }

    if (input.status !== undefined && input.status !== null) {
      fixture.status = input.status;
    }

    return this.fixturesRepository.save(fixture);
  }

  async deleteFixtureEvent(eventId: string) {
    const scoreEvent = await this.playerScoreEventsRepository.findOne({
      where: { id: eventId },
      relations: {
        playerScoreLog: { fixture: { matchday: true }, player: true },
        player: { team: true },
        fixture: { matchday: true },
      },
    });

    if (!scoreEvent) {
      throw new NotFoundException('Fixture event not found.');
    }

    const fixture = scoreEvent.fixture;
    const player = scoreEvent.player;
    const deletedEvent = {
      id: scoreEvent.id,
      fixtureId: fixture.id,
      playerId: player.id,
      type: scoreEvent.type,
      minute: scoreEvent.minute,
      points: scoreEvent.points,
      details: scoreEvent.details,
    };

    await this.playerScoreEventsRepository.remove(scoreEvent);

    const scoreLog = await this.recalculateScoreLog(scoreEvent.playerScoreLog.id);
    await this.removeEmptyFixtureScoreLogs(fixture.id);

    const persistedScoreLog = await this.playerScoreLogsRepository.findOne({
      where: { id: scoreEvent.playerScoreLog.id },
      relations: { fixture: true, player: true },
    });

    const fantasyRefresh = await this.refreshFantasyTeamsForPlayer(player.id);
    const leaderboardRefresh = fixture.matchday
      ? await this.leaderboardsService.materializeForMatchday(fixture.matchday.id)
      : null;

    this.realtimeEventsService.emitScoringUpdated({
      fixtureId: fixture.id,
      playerId: player.id,
      eventType: deletedEvent.type,
      deletedEventId: deletedEvent.id,
      affectedFantasyTeamIds: fantasyRefresh.affectedFantasyTeamIds,
    });

    if (leaderboardRefresh) {
      this.realtimeEventsService.emitLeaderboardUpdated(leaderboardRefresh as Record<string, unknown>);
    }

    return {
      eventId,
      fixtureId: fixture.id,
      playerId: player.id,
      deletedEvent,
      scoreLog: persistedScoreLog ?? scoreLog,
      fantasyRefresh,
      leaderboardRefresh,
    };
  }

  async deleteAllFixtureEvents(fixtureId: string) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: { matchday: true },
    });

    if (!fixture) {
      throw new NotFoundException('Fixture not found.');
    }

    const scoreEvents = await this.playerScoreEventsRepository.find({
      where: { fixture: { id: fixtureId } },
      relations: { player: true },
      order: { minute: 'ASC', createdAt: 'ASC' },
    });

    if (scoreEvents.length === 0) {
      return {
        fixtureId,
        deletedEventsCount: 0,
        deletedEvents: [],
        fantasyRefreshes: [],
        leaderboardRefresh: fixture.matchday ? await this.leaderboardsService.materializeForMatchday(fixture.matchday.id) : null,
      };
    }

    const deletedEvents = scoreEvents.map((scoreEvent) => ({
      id: scoreEvent.id,
      playerId: scoreEvent.player?.id ?? null,
      type: scoreEvent.type,
      minute: scoreEvent.minute,
      points: scoreEvent.points,
      details: scoreEvent.details,
    }));

    const affectedPlayerIds = Array.from(new Set(scoreEvents.map((event) => event.player?.id).filter((value): value is string => Boolean(value))));

    await this.playerScoreEventsRepository.remove(scoreEvents);

    const scoreLogs = await this.playerScoreLogsRepository.find({
      where: { fixture: { id: fixtureId } },
      order: { createdAt: 'ASC' },
    });

    for (const scoreLog of scoreLogs) {
      await this.recalculateScoreLog(scoreLog.id);
    }

    await this.removeEmptyFixtureScoreLogs(fixtureId);

    const fantasyRefreshes = [] as Array<Record<string, unknown>>;
    for (const playerId of affectedPlayerIds) {
      fantasyRefreshes.push(await this.refreshFantasyTeamsForPlayer(playerId));
    }

    const leaderboardRefresh = fixture.matchday
      ? await this.leaderboardsService.materializeForMatchday(fixture.matchday.id)
      : null;

    this.realtimeEventsService.emitScoringUpdated({
      fixtureId,
      playerId: 'bulk-delete',
      eventType: 'fixture_events_bulk_delete',
      affectedFantasyTeamIds: fantasyRefreshes.flatMap((refresh) => Array.isArray(refresh.affectedFantasyTeamIds) ? refresh.affectedFantasyTeamIds as string[] : []),
    });

    if (leaderboardRefresh) {
      this.realtimeEventsService.emitLeaderboardUpdated(leaderboardRefresh as Record<string, unknown>);
    }

    return {
      fixtureId,
      deletedEventsCount: deletedEvents.length,
      deletedEvents,
      fantasyRefreshes,
      leaderboardRefresh,
    };
  }

  private async syncAutoGeneratedFixtureEventsFromSofaScore(fixture: FixtureEntity) {
    const fixturePlayers = await this.playersRepository.find({
      where: [
        { team: { id: fixture.homeTeam.id } },
        { team: { id: fixture.awayTeam.id } },
      ],
      relations: { team: true },
      order: { createdAt: 'ASC' },
    });

    const existingScoreLogs = await this.playerScoreLogsRepository.find({
      where: { fixture: { id: fixture.id } },
      relations: { fixture: true, player: true },
      order: { createdAt: 'ASC' },
    });
    const scoreLogsByPlayerId = new Map(
      existingScoreLogs
        .filter((scoreLog) => Boolean(scoreLog.player?.id))
        .map((scoreLog) => [scoreLog.player.id, scoreLog]),
    );

    const existingAutoGeneratedEvents = await this.playerScoreEventsRepository.find({
      where: { fixture: { id: fixture.id } },
      relations: { player: true },
      order: { createdAt: 'ASC' },
    });

    const autoGeneratedEventsToDelete = existingAutoGeneratedEvents.filter((event) => this.shouldDeleteDerivedFixtureEvent(event));

    const affectedPlayerIds = new Set(
      autoGeneratedEventsToDelete
        .map((event) => event.player?.id ?? null)
        .filter((playerId): playerId is string => Boolean(playerId)),
    );

    if (autoGeneratedEventsToDelete.length > 0) {
      await this.playerScoreEventsRepository.remove(autoGeneratedEventsToDelete);
    }

    const incidents = this.extractSofaScoreIncidents(fixture.statistics);
    const resolvedParticipants = await this.extractResolvedFixtureParticipants({
      fixture,
      fixturePlayers,
      incidents,
    });
    const resolvedStarters = resolvedParticipants.filter((participant) => participant.started);
    const redCardedPlayerIds = new Set<string>();
    let createdEvents = 0;

    for (const incident of incidents) {
      const eventType = this.resolveDerivedIncidentEventType(incident.mappedType);
      const teamId = this.resolveIncidentTeamId(fixture, incident.teamSide);
      const primaryPlayer = await this.resolveFixturePlayer({
        fixturePlayers,
        teamId,
        providerPlayerId: incident.playerId,
        playerName: incident.playerName,
      });
      const assistPlayer = await this.resolveFixturePlayer({
        fixturePlayers,
        teamId,
        providerPlayerId: incident.assistId,
        playerName: incident.assistName,
      });

      if (eventType && primaryPlayer) {
        if (eventType === 'red_card') {
          redCardedPlayerIds.add(primaryPlayer.id);
        }

        affectedPlayerIds.add(primaryPlayer.id);
        const resolvedPoints = await this.resolvePointsForEvent(
          eventType,
          primaryPlayer.position,
          this.resolveDerivedEventPoints(eventType, primaryPlayer.position),
        );

        createdEvents += await this.createAutoGeneratedScoreEvent({
          scoreLogsByPlayerId,
          fixture,
          player: primaryPlayer,
          eventType,
          minute: this.normalizeIncidentMinute(incident.minute),
          resolvedPoints,
          details: {
            sourceIncidentId: incident.id,
            addedTime: incident.addedTime,
            teamSide: incident.teamSide,
            reason: incident.reason,
            providerPlayerId: incident.playerId,
            playerName: incident.playerName,
            relatedPlayerId: assistPlayer?.id ?? null,
            relatedPlayerName: assistPlayer?.name ?? incident.assistName ?? null,
            providerRelatedPlayerId: incident.assistId,
          },
        });
      }

      if (
        !assistPlayer
        || !incident.assistId
        || (incident.mappedType !== 'goal' && incident.mappedType !== 'penalty_scored')
      ) {
        continue;
      }

      affectedPlayerIds.add(assistPlayer.id);
      const assistPoints = await this.resolvePointsForEvent(
        'assist',
        assistPlayer.position,
        this.resolveDerivedEventPoints('assist', assistPlayer.position),
      );

      createdEvents += await this.createAutoGeneratedScoreEvent({
        scoreLogsByPlayerId,
        fixture,
        player: assistPlayer,
        eventType: 'assist',
        minute: this.normalizeIncidentMinute(incident.minute),
        resolvedPoints: assistPoints,
        details: {
          sourceIncidentId: incident.id,
          addedTime: incident.addedTime,
          teamSide: incident.teamSide,
          reason: incident.reason,
          providerPlayerId: incident.assistId,
          playerName: incident.assistName,
          relatedPlayerId: primaryPlayer?.id ?? null,
          relatedPlayerName: primaryPlayer?.name ?? incident.playerName ?? null,
          providerRelatedPlayerId: incident.playerId,
        },
      });
    }

    const fixtureHasStarted = fixture.status !== FixtureStatus.SCHEDULED;
    if (fixtureHasStarted) {
      for (const participant of resolvedParticipants) {
        if (participant.playedMinutes <= 0) {
          continue;
        }

        affectedPlayerIds.add(participant.player.id);
        createdEvents += await this.createAutoGeneratedScoreEvent({
          scoreLogsByPlayerId,
          fixture,
          player: participant.player,
          eventType: 'appearance',
          minute: Math.max(1, participant.enteredMinute || 1),
          resolvedPoints: await this.resolvePointsForEvent('appearance', participant.player.position),
          details: {
            teamSide: participant.teamSide,
            reason: participant.started ? 'lineup_start' : 'substitution_appearance',
          },
        });
      }
    }

    if (this.isFixtureAtOrBeyondSixtyMinutes(fixture)) {
      for (const participant of resolvedParticipants) {
        if (participant.playedMinutes < 60) {
          continue;
        }

        affectedPlayerIds.add(participant.player.id);
        createdEvents += await this.createAutoGeneratedScoreEvent({
          scoreLogsByPlayerId,
          fixture,
          player: participant.player,
          eventType: 'played_60_minutes',
          minute: Math.max(60, participant.enteredMinute + 60),
          resolvedPoints: await this.resolvePointsForEvent('played_60_minutes', participant.player.position),
          details: {
            teamSide: participant.teamSide,
            reason: 'completed_60_minutes',
          },
        });
      }
    }

    if (this.isFixtureAtOrBeyondSixtyMinutes(fixture)) {
      for (const participant of resolvedParticipants) {
        if (redCardedPlayerIds.has(participant.player.id) || participant.playedMinutes < 60) {
          continue;
        }

        if (
          participant.player.position !== PlayerPosition.GOALKEEPER
          && participant.player.position !== PlayerPosition.DEFENDER
          && participant.player.position !== PlayerPosition.MIDFIELDER
        ) {
          continue;
        }

        if (!this.qualifiesForSixtyMinuteCleanSheet(participant, incidents)) {
          continue;
        }

        affectedPlayerIds.add(participant.player.id);
        createdEvents += await this.createAutoGeneratedScoreEvent({
          scoreLogsByPlayerId,
          fixture,
          player: participant.player,
          eventType: 'clean_sheet',
          minute: Math.max(60, participant.enteredMinute + 60),
          resolvedPoints: await this.resolvePointsForEvent('clean_sheet', participant.player.position),
          details: {
            teamSide: participant.teamSide,
            reason: 'sixty_minute_clean_sheet',
            enteredMinute: participant.enteredMinute,
            exitedMinute: participant.exitedMinute,
          },
        });
      }
    }

    if (this.isFixtureAtOrBeyondNinetyMinutes(fixture)) {
      const homeGoalkeeper = this.findStartingGoalkeeper(resolvedStarters, 'home');
      const awayGoalkeeper = this.findStartingGoalkeeper(resolvedStarters, 'away');
      const saveTargets = [
        { teamSide: 'home' as const, goalkeeper: homeGoalkeeper, saveCount: this.getGoalkeeperSavesForSide(fixture.statistics, 'home') },
        { teamSide: 'away' as const, goalkeeper: awayGoalkeeper, saveCount: this.getGoalkeeperSavesForSide(fixture.statistics, 'away') },
      ];

      for (const target of saveTargets) {
        if (!target.goalkeeper || target.saveCount <= 0) {
          continue;
        }

        const resolvedSavePoints = await this.resolvePointsForEvent('save', target.goalkeeper.position);
        const awardedSaveBlocks = Math.floor(target.saveCount / 3);
        if (awardedSaveBlocks <= 0) {
          continue;
        }
        affectedPlayerIds.add(target.goalkeeper.id);
        createdEvents += await this.createAutoGeneratedScoreEvent({
          scoreLogsByPlayerId,
          fixture,
          player: target.goalkeeper,
          eventType: 'save',
          minute: 90,
          resolvedPoints: {
            points: resolvedSavePoints.points * awardedSaveBlocks,
            source: resolvedSavePoints.source,
            ruleSetCode: resolvedSavePoints.ruleSetCode,
          },
          details: {
            teamSide: target.teamSide,
            reason: 'goalkeeper_saves',
            saveCount: target.saveCount,
            awardedSaveBlocks,
            savePointValue: resolvedSavePoints.points,
            savesPerPoint: 3,
          },
        });
      }
    }

    return {
      createdEvents,
      affectedPlayerIds: Array.from(affectedPlayerIds),
    };
  }

  private extractSofaScoreIncidents(statistics: Record<string, unknown> | null | undefined): DerivedSofaIncident[] {
    const incidents = statistics?.incidents;
    if (!Array.isArray(incidents)) {
      return [];
    }

    return incidents
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }

        const incident = entry as Record<string, unknown>;
        const rawIncidentId = incident.id;
        const rawMappedType = incident.mappedType;
        const rawType = incident.type;
        return {
          id: this.toOptionalString(rawIncidentId) ?? String(index),
          minute: this.normalizeIncidentMinute(incident.minute),
          addedTime: this.toOptionalNumber(incident.addedTime),
          mappedType: (this.toOptionalString(rawMappedType) ?? this.toOptionalString(rawType) ?? '')
            .trim()
            .toLowerCase(),
          teamSide: incident.teamSide === 'home' || incident.teamSide === 'away'
            ? incident.teamSide
            : null,
          playerId: this.toOptionalString(incident.playerId),
          playerName: this.toOptionalString(incident.playerName),
          assistId: this.toOptionalString(incident.assistId),
          assistName: this.toOptionalString(incident.assistName),
          reason: this.toOptionalString(incident.reason),
        } satisfies DerivedSofaIncident;
      })
      .filter((incident): incident is DerivedSofaIncident => Boolean(incident));
  }

  private resolveDerivedIncidentEventType(mappedType: string): DerivedFixtureEventType | null {
    switch (mappedType) {
      case 'goal':
      case 'own_goal':
      case 'yellow_card':
      case 'red_card':
      case 'penalty_scored':
      case 'penalty_missed':
      case 'penalty_save':
        return mappedType;
      default:
        return null;
    }
  }

  private resolveDerivedEventPoints(eventType: DerivedFixtureEventType | 'assist', position: PlayerPosition) {
    if (eventType === 'goal' || eventType === 'penalty_scored') {
      if (position === PlayerPosition.GOALKEEPER || position === PlayerPosition.DEFENDER) {
        return 6;
      }

      if (position === PlayerPosition.MIDFIELDER) {
        return 5;
      }

      return 4;
    }

    if (eventType === 'assist') {
      return 3;
    }

    if (eventType === 'own_goal' || eventType === 'penalty_missed') {
      return -2;
    }

    if (eventType === 'yellow_card') {
      return -1;
    }

    if (eventType === 'red_card') {
      return -3;
    }

    if (eventType === 'penalty_save') {
      return 5;
    }

    return 0;
  }

  private resolveIncidentTeamId(fixture: FixtureEntity, teamSide: 'home' | 'away' | null) {
    if (teamSide === 'home') {
      return fixture.homeTeam.id;
    }

    if (teamSide === 'away') {
      return fixture.awayTeam.id;
    }

    return null;
  }

  private async resolveFixturePlayer(input: {
    fixturePlayers: PlayerEntity[];
    teamId: string | null;
    providerPlayerId: string | null;
    playerName: string | null;
  }) {
    const providerPlayerId = input.providerPlayerId?.trim();
    if (providerPlayerId) {
      const providerMatch = input.fixturePlayers.find((player) => (
        player.externalProviderId === providerPlayerId
        && (!input.teamId || player.team?.id === input.teamId)
      ));
      if (providerMatch) {
        return providerMatch;
      }

      const globalProviderMatches = input.fixturePlayers.filter((player) => player.externalProviderId === providerPlayerId);
      if (globalProviderMatches.length === 1) {
        return globalProviderMatches[0];
      }

      const globalCatalogProviderMatch = await this.playersRepository.findOne({
        where: { externalProviderId: providerPlayerId },
        relations: { team: true },
      });
      if (globalCatalogProviderMatch) {
        return globalCatalogProviderMatch;
      }
    }

    const normalizedName = this.normalizeLookup(input.playerName);
    if (!normalizedName) {
      return null;
    }

    const fixtureScopedNameMatch = input.fixturePlayers.find((player) => {
      if (input.teamId && player.team?.id !== input.teamId) {
        return false;
      }

      const candidateNames = [
        this.normalizeLookup(player.name),
        this.normalizeLookup(player.shortName),
      ].filter(Boolean);

      return candidateNames.includes(normalizedName);
    });
    if (fixtureScopedNameMatch) {
      return fixtureScopedNameMatch;
    }

    const globalNameMatches = input.fixturePlayers.filter((player) => {
      const candidateNames = [
        this.normalizeLookup(player.name),
        this.normalizeLookup(player.shortName),
      ].filter(Boolean);

      return candidateNames.includes(normalizedName);
    });

    if (globalNameMatches.length === 1) {
      return globalNameMatches[0];
    }

    return null;
  }

  private async ensureScoreLogForFixturePlayer(input: {
    scoreLogsByPlayerId: Map<string, PlayerScoreLogEntity>;
    fixture: FixtureEntity;
    player: PlayerEntity;
  }) {
    const existingScoreLog = input.scoreLogsByPlayerId.get(input.player.id);
    if (existingScoreLog) {
      return existingScoreLog;
    }

    const scoreLog = await this.playerScoreLogsRepository.save(
      this.playerScoreLogsRepository.create({
        fixture: input.fixture,
        player: input.player,
        totalPoints: 0,
        bonusPoints: 0,
        eventSummary: [],
      }),
    );
    input.scoreLogsByPlayerId.set(input.player.id, scoreLog);
    return scoreLog;
  }

  private getAutoGeneratedSource(details: Record<string, unknown> | null | undefined) {
    if (!details || typeof details !== 'object' || Array.isArray(details)) {
      return null;
    }

    const value = details.autoGeneratedSource;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private shouldDeleteDerivedFixtureEvent(event: PlayerScoreEventEntity) {
    if (!RECOMPUTED_DERIVED_EVENT_TYPES.has(event.type)) {
      return false;
    }

    if (this.getAutoGeneratedSource(event.details) === AUTO_GENERATED_SOFASCORE_EVENT_SOURCE) {
      return true;
    }

    const source = this.getEventDetailsString(event.details, 'source');
    const reason = this.getEventDetailsString(event.details, 'reason');

    if (source === LEGACY_ADMIN_DERIVED_EVENT_SOURCE && reason === LEGACY_ADMIN_DERIVED_EVENT_REASON) {
      return true;
    }

    // Recompute fully owns these derived event types and must replace stale legacy rows
    // even when older records are missing or mis-shaping their details metadata.
    return true;
  }

  private getEventDetailsString(details: Record<string, unknown> | null | undefined, key: string) {
    if (!details || typeof details !== 'object' || Array.isArray(details)) {
      return null;
    }

    const value = details[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private normalizeLookup(value: string | null | undefined) {
    return (value ?? '')
      .normalize('NFD')
      .replaceAll(/[\u0300-\u036f]/g, '')
      .replaceAll(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private toOptionalNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private toOptionalString(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return null;
  }

  private normalizeIncidentMinute(value: unknown) {
    return this.toOptionalNumber(value) ?? 0;
  }

  private async createAutoGeneratedScoreEvent(input: {
    scoreLogsByPlayerId: Map<string, PlayerScoreLogEntity>;
    fixture: FixtureEntity;
    player: PlayerEntity;
    eventType: string;
    minute: number;
    resolvedPoints: { points: number; source: 'explicit' | 'rule'; ruleSetCode: string | null };
    details?: Record<string, unknown>;
  }) {
    const scoreLog = await this.ensureScoreLogForFixturePlayer({
      scoreLogsByPlayerId: input.scoreLogsByPlayerId,
      fixture: input.fixture,
      player: input.player,
    });

    await this.playerScoreEventsRepository.save(
      this.playerScoreEventsRepository.create({
        playerScoreLog: scoreLog,
        player: input.player,
        fixture: input.fixture,
        type: input.eventType,
        points: input.resolvedPoints.points,
        minute: input.minute,
        details: {
          autoGeneratedSource: AUTO_GENERATED_SOFASCORE_EVENT_SOURCE,
          pointsSource: input.resolvedPoints.source,
          ruleSetCode: input.resolvedPoints.ruleSetCode,
          ...(input.details ?? {}),
        },
      }),
    );

    return 1;
  }

  private async extractResolvedFixtureParticipants(input: {
    fixture: FixtureEntity;
    fixturePlayers: PlayerEntity[];
    incidents: DerivedSofaIncident[];
  }) {
    const participantsByPlayerId = new Map<string, ResolvedFixtureParticipant>();
    const lineups = input.fixture.lineups;
    const matchMinute = this.getFixtureElapsedMinute(input.fixture);

    for (const teamSide of ['home', 'away'] as const) {
      const sideLineup = this.toObjectRecord(lineups?.[teamSide]);
      const startingXI = Array.isArray(sideLineup?.startingXI) ? sideLineup.startingXI : [];
      const teamId = teamSide === 'home' ? input.fixture.homeTeam.id : input.fixture.awayTeam.id;

      for (const entry of startingXI) {
        const lineupPlayer = this.toObjectRecord(entry);
        const resolvedPlayer = await this.resolveFixturePlayer({
          fixturePlayers: input.fixturePlayers,
          teamId,
          providerPlayerId: this.toOptionalString(lineupPlayer?.id),
          playerName: this.toOptionalString(lineupPlayer?.name),
        });

        if (!resolvedPlayer || participantsByPlayerId.has(resolvedPlayer.id)) {
          continue;
        }

        participantsByPlayerId.set(resolvedPlayer.id, {
          player: resolvedPlayer,
          teamSide,
          started: true,
          enteredMinute: 0,
          exitedMinute: matchMinute,
          playedMinutes: matchMinute,
        });
      }
    }

    for (const incident of input.incidents) {
      if (incident.mappedType !== 'substitution' || !incident.teamSide) {
        continue;
      }

      const teamId = incident.teamSide === 'home' ? input.fixture.homeTeam.id : input.fixture.awayTeam.id;
      const incomingPlayer = await this.resolveFixturePlayer({
        fixturePlayers: input.fixturePlayers,
        teamId,
        providerPlayerId: incident.playerId,
        playerName: incident.playerName,
      });
      const outgoingPlayer = await this.resolveFixturePlayer({
        fixturePlayers: input.fixturePlayers,
        teamId,
        providerPlayerId: incident.assistId,
        playerName: incident.assistName,
      });

      const substitutionMinute = Math.max(0, this.normalizeIncidentMinute(incident.minute));

      if (outgoingPlayer) {
        const existingOutgoing = participantsByPlayerId.get(outgoingPlayer.id);
        if (existingOutgoing) {
          existingOutgoing.exitedMinute = Math.min(existingOutgoing.exitedMinute, substitutionMinute);
        }
      }

      if (incomingPlayer) {
        const existingIncoming = participantsByPlayerId.get(incomingPlayer.id);
        if (existingIncoming) {
          existingIncoming.enteredMinute = Math.min(existingIncoming.enteredMinute, substitutionMinute);
        } else {
          participantsByPlayerId.set(incomingPlayer.id, {
            player: incomingPlayer,
            teamSide: incident.teamSide,
            started: false,
            enteredMinute: substitutionMinute,
            exitedMinute: matchMinute,
            playedMinutes: 0,
          });
        }
      }
    }

    const participants = Array.from(participantsByPlayerId.values()).map((participant) => ({
      ...participant,
      enteredMinute: Math.max(0, participant.enteredMinute),
      exitedMinute: Math.max(participant.enteredMinute, participant.exitedMinute),
      playedMinutes: Math.max(0, participant.exitedMinute - participant.enteredMinute),
    }));

    return participants;
  }

  private findStartingGoalkeeper(starters: ResolvedFixtureStarter[], teamSide: 'home' | 'away') {
    return starters.find((starter) => (
      starter.teamSide === teamSide && starter.player.position === PlayerPosition.GOALKEEPER
    ))?.player ?? null;
  }

  private getGoalkeeperSavesForSide(
    statistics: Record<string, unknown> | null | undefined,
    teamSide: 'home' | 'away',
  ) {
    const sideStats = this.toObjectRecord(statistics?.[teamSide]);
    return this.toOptionalNumber(sideStats?.goalkeeper_saves) ?? 0;
  }

  private isFixtureAtOrBeyondNinetyMinutes(fixture: FixtureEntity) {
    return fixture.status === FixtureStatus.FULL_TIME || (fixture.currentMinute ?? 0) >= 90;
  }

  private isFixtureAtOrBeyondSixtyMinutes(fixture: FixtureEntity) {
    return fixture.status === FixtureStatus.FULL_TIME || (fixture.currentMinute ?? 0) >= 60;
  }

  private getFixtureElapsedMinute(fixture: FixtureEntity) {
    if (fixture.status === FixtureStatus.FULL_TIME) {
      return 90;
    }

    return Math.max(0, fixture.currentMinute ?? 0);
  }

  private qualifiesForSixtyMinuteCleanSheet(
    participant: ResolvedFixtureParticipant,
    incidents: DerivedSofaIncident[],
  ) {
    const concededGoalMinutes = incidents
      .filter((incident) => this.isConcededGoalAgainstTeamSide(incident, participant.teamSide))
      .map((incident) => this.normalizeIncidentMinute(incident.minute));

    return !concededGoalMinutes.some((minute) => (
      minute > participant.enteredMinute && minute <= participant.exitedMinute
    ));
  }

  private isConcededGoalAgainstTeamSide(
    incident: DerivedSofaIncident,
    defendingTeamSide: 'home' | 'away',
  ) {
    if (incident.mappedType === 'goal' || incident.mappedType === 'penalty_scored') {
      return incident.teamSide !== null && incident.teamSide !== defendingTeamSide;
    }

    if (incident.mappedType === 'own_goal') {
      return incident.teamSide === defendingTeamSide;
    }

    return false;
  }

  private toObjectRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private async recalculateScoreLog(scoreLogId: string) {
    const scoreLog = await this.playerScoreLogsRepository.findOne({
      where: { id: scoreLogId },
      relations: { fixture: true, player: true },
    });

    if (!scoreLog) {
      throw new NotFoundException('Player score log not found.');
    }

    const events = await this.playerScoreEventsRepository.find({
      where: { playerScoreLog: { id: scoreLogId } },
      order: { minute: 'ASC', createdAt: 'ASC' },
    });

    scoreLog.totalPoints = events.reduce((sum, event) => sum + event.points, 0);
    scoreLog.eventSummary = events.map((event) => ({
      type: event.type,
      minute: event.minute,
      points: event.points,
      relatedPlayerId: this.toOptionalString(event.details?.relatedPlayerId),
      relatedPlayerName: this.toOptionalString(event.details?.relatedPlayerName),
    }));

    return this.playerScoreLogsRepository.save(scoreLog);
  }

  private async removeEmptyFixtureScoreLogs(fixtureId: string) {
    const scoreLogs = await this.playerScoreLogsRepository.find({
      where: { fixture: { id: fixtureId } },
      relations: { player: true },
      order: { createdAt: 'ASC' },
    });

    const emptyLogs = scoreLogs.filter(
      (scoreLog) => !scoreLog.player?.id || !Array.isArray(scoreLog.eventSummary) || scoreLog.eventSummary.length === 0,
    );
    if (emptyLogs.length === 0) {
      return;
    }

    await this.playerScoreLogsRepository.remove(emptyLogs);
  }

  private async resolvePointsForEvent(
    eventType: string,
    position: PlayerPosition,
    explicitPoints?: number,
  ) {
    if (typeof explicitPoints === 'number') {
      return {
        points: explicitPoints,
        source: 'explicit' as const,
        ruleSetCode: null,
      };
    }

    let scoringRule = await this.scoringRulesRepository
      .createQueryBuilder('rule')
      .innerJoinAndSelect('rule.ruleSet', 'ruleSet')
      .where('rule.eventType = :eventType', { eventType })
      .andWhere('rule.position = :position', { position })
      .andWhere('rule.isEnabled = :isEnabled', { isEnabled: true })
      .andWhere('ruleSet.isActive = :isActive', { isActive: true })
      .orderBy('ruleSet.version', 'DESC')
      .addOrderBy('rule.createdAt', 'DESC')
      .getOne();

    if (!scoringRule) {
      const activeRuleSet = await this.scoringRuleSetsRepository.findOne({
        where: { isActive: true },
        relations: { rules: true },
        order: { version: 'DESC', createdAt: 'DESC' },
      });

      if (activeRuleSet) {
        await this.ensureRequiredFantasyRules(activeRuleSet);

        scoringRule = await this.scoringRulesRepository
          .createQueryBuilder('rule')
          .innerJoinAndSelect('rule.ruleSet', 'ruleSet')
          .where('rule.eventType = :eventType', { eventType })
          .andWhere('rule.position = :position', { position })
          .andWhere('rule.isEnabled = :isEnabled', { isEnabled: true })
          .andWhere('ruleSet.isActive = :isActive', { isActive: true })
          .orderBy('ruleSet.version', 'DESC')
          .addOrderBy('rule.createdAt', 'DESC')
          .getOne();
      }
    }

    if (!scoringRule) {
      throw new BadRequestException(
        `No active scoring rule configured for event ${eventType} and position ${position}.`,
      );
    }

    return {
      points: scoringRule.points,
      source: 'rule' as const,
      ruleSetCode: scoringRule.ruleSet.code,
    };
  }

  private async refreshFantasyTeamsForPlayer(playerId: string) {
    const player = await this.playersRepository.findOne({
      where: { id: playerId },
      relations: { team: { tournament: true } },
    });

    if (!player) {
      throw new NotFoundException('Player not found while refreshing fantasy points.');
    }

    const tournamentId = player.team?.tournament?.id;

    const scoreLogs = tournamentId
      ? await this.playerScoreLogsRepository
        .createQueryBuilder('scoreLog')
        .innerJoinAndSelect('scoreLog.player', 'player')
        .innerJoinAndSelect('scoreLog.fixture', 'fixture')
        .where('player.id = :playerId', { playerId })
        .andWhere('fixture.tournament_id = :tournamentId', { tournamentId })
        .orderBy('scoreLog.createdAt', 'ASC')
        .getMany()
      : await this.playerScoreLogsRepository.find({
        where: { player: { id: playerId } },
        relations: { player: true, fixture: true },
        order: { createdAt: 'ASC' },
      });

    const playerTotalPoints = scoreLogs.reduce((sum, scoreLog) => sum + scoreLog.totalPoints, 0);
    player.totalPoints = playerTotalPoints;
    await this.playersRepository.save(player);

    const affectedPicks = await this.fantasyPicksRepository.find({
      where: tournamentId
        ? { player: { id: playerId }, fantasyTeam: { tournament: { id: tournamentId } } }
        : { player: { id: playerId } },
      relations: { fantasyTeam: { user: true, tournament: true }, player: true },
    });

    const affectedFantasyTeamIds = new Set<string>();
    for (const pick of affectedPicks) {
      pick.livePoints = playerTotalPoints;
      await this.fantasyPicksRepository.save(pick);
      affectedFantasyTeamIds.add(pick.fantasyTeam.id);
    }

    const affectedFantasyTeams = [] as Array<{ fantasyTeamId: string; totalPoints: number }>;
    for (const fantasyTeamId of affectedFantasyTeamIds) {
      const fantasyTeam = await this.recalculateFantasyTeamTotal(fantasyTeamId);
      affectedFantasyTeams.push({
        fantasyTeamId: fantasyTeam.id,
        totalPoints: fantasyTeam.totalPoints,
      });
    }

    return {
      playerId,
      playerTotalPoints,
      affectedFantasyTeamIds: Array.from(affectedFantasyTeamIds),
      affectedFantasyTeams,
    };
  }

  private async recalculateFantasyTeamTotal(fantasyTeamId: string) {
    const fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: { id: fantasyTeamId },
      relations: { picks: { player: true } },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found while recalculating totals.');
    }

    fantasyTeam.totalPoints = fantasyTeam.picks.reduce((sum, pick) => {
      if (pick.isBenched) {
        return sum;
      }

      return sum + (pick.livePoints ?? 0) * Math.max(pick.multiplier ?? 1, 1);
    }, 0);

    return this.fantasyTeamsRepository.save(fantasyTeam);
  }

  private async emitScoringSideEffects(input: {
    fixture: FixtureEntity;
    player: PlayerEntity;
    resolvedPoints: { points: number; source: 'explicit' | 'rule'; ruleSetCode: string | null };
    fantasyRefresh: {
      playerId: string;
      playerTotalPoints: number;
      affectedFantasyTeamIds: string[];
      affectedFantasyTeams: Array<{ fantasyTeamId: string; totalPoints: number }>;
    };
    leaderboardRefresh: Record<string, unknown> | null;
    eventType: string;
  }) {
    this.realtimeEventsService.emitScoringUpdated({
      fixtureId: input.fixture.id,
      playerId: input.player.id,
      eventType: input.eventType,
      points: input.resolvedPoints.points,
      pointsSource: input.resolvedPoints.source,
      ruleSetCode: input.resolvedPoints.ruleSetCode,
      affectedFantasyTeamIds: input.fantasyRefresh.affectedFantasyTeamIds,
    });

    if (input.leaderboardRefresh) {
      this.realtimeEventsService.emitLeaderboardUpdated(input.leaderboardRefresh);
    }

    if (input.fantasyRefresh.affectedFantasyTeamIds.length === 0) {
      return;
    }

    const notifications = await this.buildNotificationsForAffectedFantasyTeams(input);
    if (notifications.length > 0) {
      await this.notificationsService.createNotificationsForUsers(notifications);
    }
  }

  private async buildNotificationsForAffectedFantasyTeams(input: {
    fixture: FixtureEntity;
    player: PlayerEntity;
    resolvedPoints: { points: number; source: 'explicit' | 'rule'; ruleSetCode: string | null };
    fantasyRefresh: {
      playerId: string;
      playerTotalPoints: number;
      affectedFantasyTeamIds: string[];
      affectedFantasyTeams: Array<{ fantasyTeamId: string; totalPoints: number }>;
    };
    eventType: string;
  }) {
    const affectedFantasyTeams = await this.fantasyTeamsRepository.find({
      where: input.fantasyRefresh.affectedFantasyTeamIds.map((fantasyTeamId) => ({ id: fantasyTeamId })),
      relations: { user: { profile: true } },
    });

    return affectedFantasyTeams.map((fantasyTeam) => ({
      userId: fantasyTeam.user.id,
      type: 'scoring_update',
      title: 'Scoring update',
      body: `${input.player.shortName} registered ${input.eventType} for ${input.resolvedPoints.points} points.`,
      payload: {
        fixtureId: input.fixture.id,
        playerId: input.player.id,
        fantasyTeamId: fantasyTeam.id,
        eventType: input.eventType,
        points: input.resolvedPoints.points,
      },
    }));
  }

  private serializeRuleSet(ruleSet: ScoringRuleSetEntity) {
    return {
      ruleSet: {
        id: ruleSet.id,
        name: ruleSet.name,
        code: ruleSet.code,
        description: ruleSet.description,
        isActive: ruleSet.isActive,
        version: ruleSet.version,
      },
      rules: [...(ruleSet.rules ?? [])]
        .filter((rule) => !this.isLegacyScoringRule(rule))
        .sort((left, right) => {
          const eventComparison = left.eventType.localeCompare(right.eventType);
          if (eventComparison !== 0) {
            return eventComparison;
          }

          return left.position.localeCompare(right.position);
        })
        .map((rule) => ({
          id: rule.id,
          eventType: rule.eventType,
          position: rule.position,
          points: rule.points,
          isEnabled: rule.isEnabled,
          description: rule.description,
        })),
    };
  }

  private buildRuleKey(eventType: string, position: PlayerPosition) {
    return `${eventType}:${position}`;
  }

  private isLegacyScoringRule(rule: Pick<ScoringRuleEntity, 'eventType' | 'position'>) {
    if (LEGACY_SCORING_RULE_EVENT_TYPES.has(rule.eventType)) {
      return true;
    }

    return rule.eventType === 'clean_sheet' && (
      rule.position === PlayerPosition.MIDFIELDER || rule.position === PlayerPosition.FORWARD
    );
  }

  private async ensureRequiredFantasyRules(ruleSet: ScoringRuleSetEntity) {
    const legacyRules = ruleSet.rules.filter((rule) => this.isLegacyScoringRule(rule));
    if (legacyRules.length > 0) {
      const legacyRulesToDisable = legacyRules.filter((rule) => rule.isEnabled);
      if (legacyRulesToDisable.length > 0) {
        await this.scoringRulesRepository.save(
          legacyRulesToDisable.map((rule) => ({ ...rule, isEnabled: false })),
        );
      }

      ruleSet.rules = ruleSet.rules.map((rule) => (
        this.isLegacyScoringRule(rule)
          ? { ...rule, isEnabled: false }
          : rule
      ));
    }

    const existingRuleKeys = new Set(ruleSet.rules.map((rule) => this.buildRuleKey(rule.eventType, rule.position)));
    const missingRules = REQUIRED_FANTASY_EVENT_RULES.filter((rule) => !existingRuleKeys.has(this.buildRuleKey(rule.eventType, rule.position)));

    if (!missingRules.length) {
      return;
    }

    const createdRules = await this.scoringRulesRepository.save(
      missingRules.map((rule) => this.scoringRulesRepository.create({
        ruleSet,
        eventType: rule.eventType,
        position: rule.position,
        points: rule.points,
        isEnabled: true,
        description: rule.description,
      })),
    );

    ruleSet.rules = [...ruleSet.rules, ...createdRules];
  }
}
