import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { FixtureStatus } from '../../common/database';
import { readActiveCompetitionConfig } from '../../common/config/competition.config';
import { PlayerScoreEventEntity } from '../scoring/entities/player-score-event.entity';
import { EgyptLiveStateService } from './egypt-live-state.service';
import { FixtureEntity } from './entities/fixture.entity';
import { GroupEntity } from './entities/group.entity';
import { MatchdayEntity } from './entities/matchday.entity';
import { TournamentEntity } from './entities/tournament.entity';
import { EgyptLiveTrackerService } from './egypt-live-tracker.service';

@Injectable()
export class TournamentService {
  private readonly logger = new Logger(TournamentService.name);
  private static readonly STALE_SCHEDULED_SYNC_GRACE_MS = 45 * 60 * 1000;
  private static readonly STALE_LIVE_FIXTURE_WINDOW_MS = 4 * 60 * 60 * 1000;
  private static readonly MAX_AUTO_SYNC_FIXTURES_PER_REQUEST = 12;
  private static readonly FIXTURES_CACHE_TTL_MS = 15_000;
  private static readonly CURRENT_TOURNAMENT_CACHE_TTL_MS = 60_000;
  private readonly inFlightAutoSyncFixtureIds = new Set<string>();
  private readonly fixturesCache = new Map<string, { expiresAt: number; data: Array<Record<string, unknown>> }>();
  private currentTournamentCache: { expiresAt: number; data: TournamentEntity } | null = null;

  constructor(
    @InjectRepository(TournamentEntity)
    private readonly tournamentsRepository: Repository<TournamentEntity>,
    @InjectRepository(MatchdayEntity)
    private readonly matchdaysRepository: Repository<MatchdayEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupsRepository: Repository<GroupEntity>,
    @InjectRepository(FixtureEntity)
    private readonly fixturesRepository: Repository<FixtureEntity>,
    @InjectRepository(PlayerScoreEventEntity)
    private readonly playerScoreEventsRepository: Repository<PlayerScoreEventEntity>,
    private readonly configService: ConfigService,
    private readonly egyptLiveStateService: EgyptLiveStateService,
    private readonly egyptLiveTrackerService: EgyptLiveTrackerService,
  ) {}

  private readRelationId(value: unknown) {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return null;
  }

  private mapScoreEvent(scoreEvent: PlayerScoreEventEntity, fixture?: FixtureEntity | null) {
    const relationPayload = scoreEvent as unknown as { playerId?: unknown };
    const relationPlayerId = this.readRelationId(relationPayload.playerId);
    const fallbackPlayerId =
      typeof scoreEvent.details?.playerId === 'string'
        ? scoreEvent.details.playerId
        : typeof scoreEvent.details?.relatedPlayerId === 'string'
          ? scoreEvent.details.relatedPlayerId
        : null;

    const teamSide = typeof scoreEvent.details?.teamSide === 'string'
      ? scoreEvent.details.teamSide.toLowerCase()
      : null;
    const derivedTeamId =
      teamSide === 'home'
        ? fixture?.homeTeam?.id ?? null
        : teamSide === 'away'
          ? fixture?.awayTeam?.id ?? null
          : null;

    return {
      id: scoreEvent.id,
      type: scoreEvent.type,
      minute: scoreEvent.minute,
      points: scoreEvent.points,
      playerId: relationPlayerId ?? fallbackPlayerId,
      teamId: derivedTeamId,
      relatedPlayerId:
        typeof scoreEvent.details?.relatedPlayerId === 'string'
          ? scoreEvent.details.relatedPlayerId
          : null,
      player: null,
    };
  }

  private mapRawScoreEvent(
    scoreEvent: {
      id: string;
      type: string;
      minute: number;
      points: number;
      details: Record<string, unknown> | null;
      fixtureId: string;
      playerId: string | null;
    },
    fixture?: FixtureEntity | null,
  ) {
    const details = scoreEvent.details ?? {};
    const teamSide = typeof details.teamSide === 'string'
      ? details.teamSide.toLowerCase()
      : null;
    const derivedTeamId =
      teamSide === 'home'
        ? fixture?.homeTeam?.id ?? null
        : teamSide === 'away'
          ? fixture?.awayTeam?.id ?? null
          : null;

    return {
      id: scoreEvent.id,
      type: scoreEvent.type,
      minute: scoreEvent.minute,
      points: scoreEvent.points,
      playerId:
        scoreEvent.playerId
        ?? (typeof details.playerId === 'string'
          ? details.playerId
          : typeof details.relatedPlayerId === 'string'
            ? details.relatedPlayerId
            : null),
      teamId: derivedTeamId,
      relatedPlayerId:
        typeof details.relatedPlayerId === 'string'
          ? details.relatedPlayerId
          : null,
      player: null,
    };
  }

  private extractScrapedEventsFromStatistics(rawStatistics: unknown, fixture: FixtureEntity) {
    if (!rawStatistics || typeof rawStatistics !== 'object' || !('incidents' in rawStatistics)) {
      return [];
    }

    const rawIncidents = (rawStatistics as { incidents?: unknown }).incidents;
    if (!Array.isArray(rawIncidents)) {
      return [];
    }

    const events = rawIncidents
      .map((incident, index) => {
        if (!incident || typeof incident !== 'object') {
          return null;
        }

        const item = incident as Record<string, unknown>;
        const typeValue = item.mappedType ?? item.incidentType;
        const type = typeof typeValue === 'string' && typeValue.trim().length > 0 ? typeValue : null;
        if (!type) {
          return null;
        }

        const minuteRaw = item.minute;
        const minute =
          typeof minuteRaw === 'number'
            ? minuteRaw
            : typeof minuteRaw === 'string'
              ? parseInt(minuteRaw, 10)
              : NaN;

        if (!Number.isFinite(minute)) {
          return null;
        }

        const teamSide = typeof item.teamSide === 'string' ? item.teamSide.toLowerCase() : null;
        const teamId =
          teamSide === 'home'
            ? fixture.homeTeam?.id ?? null
            : teamSide === 'away'
              ? fixture.awayTeam?.id ?? null
              : null;

        const playerId =
          typeof item.playerId === 'string'
            ? item.playerId
            : typeof item.playerId === 'number'
              ? String(item.playerId)
              : null;

        const relatedPlayerId =
          typeof item.assistId === 'string'
            ? item.assistId
            : typeof item.assistId === 'number'
              ? String(item.assistId)
              : typeof item.relatedPlayerId === 'string'
                ? item.relatedPlayerId
                : null;

        return {
          id:
            typeof item.id === 'string'
              ? item.id
              : typeof item.id === 'number'
                ? String(item.id)
                : `${fixture.id}-incident-${index}`,
          type,
          minute,
          playerId,
          teamId,
          relatedPlayerId,
          playerName: typeof item.playerName === 'string' ? item.playerName : null,
          relatedPlayerName: typeof item.assistName === 'string' ? item.assistName : null,
        };
      })
      .filter((event): event is NonNullable<typeof event> => Boolean(event));

    return events;
  }

  private extractScrapedEventsFromFixture(fixture: FixtureEntity) {
    return this.extractScrapedEventsFromStatistics(fixture.statistics, fixture);
  }

  private resolvePublicFixtureEvents(input: {
    fixture: FixtureEntity;
    statistics?: Record<string, unknown> | null;
    liveIncidents?: Array<Record<string, unknown>> | null;
    scoreEvents?: Array<Record<string, unknown>> | null;
  }) {
    const liveIncidents = Array.isArray(input.liveIncidents)
      ? input.liveIncidents.filter((event): event is Record<string, unknown> => Boolean(event) && typeof event === 'object')
      : [];

    if (liveIncidents.length > 0) {
      return liveIncidents;
    }

    const scrapedEvents = this.extractScrapedEventsFromStatistics(input.statistics ?? input.fixture.statistics, input.fixture);
    if (scrapedEvents.length > 0) {
      return scrapedEvents;
    }

    return Array.isArray(input.scoreEvents) ? input.scoreEvents : [];
  }

  private hasPrimaryPublicEvents(input: {
    fixture: FixtureEntity;
    statistics?: Record<string, unknown> | null;
    liveIncidents?: Array<Record<string, unknown>> | null;
  }) {
    return Boolean(
      (Array.isArray(input.liveIncidents) && input.liveIncidents.length > 0)
      || this.extractScrapedEventsFromStatistics(input.statistics ?? input.fixture.statistics, input.fixture).length > 0,
    );
  }

  private resolveScoresFromEvents(input: {
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    homeScore: number | null;
    awayScore: number | null;
    events?: Array<Record<string, unknown>> | null;
  }) {
    if (!Array.isArray(input.events) || input.events.length === 0) {
      return {
        homeScore: input.homeScore,
        awayScore: input.awayScore,
      };
    }

    let derivedHomeScore = 0;
    let derivedAwayScore = 0;
    let hasDerivedScoreSignal = false;

    for (const event of input.events) {
      if (!event || typeof event !== 'object') {
        continue;
      }

      const eventTypeValue = event.type ?? event.mappedType ?? event.incidentType;
      const eventType = typeof eventTypeValue === 'string' ? eventTypeValue : null;

      const scorePayload = 'score' in event && event.score && typeof event.score === 'object'
        ? event.score as Record<string, unknown>
        : null;

      const eventHomeScore = typeof scorePayload?.home === 'number' ? scorePayload.home : null;
      const eventAwayScore = typeof scorePayload?.away === 'number' ? scorePayload.away : null;

      if (eventHomeScore !== null && eventAwayScore !== null) {
        derivedHomeScore = Math.max(derivedHomeScore, eventHomeScore);
        derivedAwayScore = Math.max(derivedAwayScore, eventAwayScore);
        hasDerivedScoreSignal = true;
      }

      if (eventType !== 'goal' && eventType !== 'penalty_scored' && eventType !== 'own_goal') {
        continue;
      }

      const teamId = typeof event.teamId === 'string' ? event.teamId : null;
      const teamSide = typeof event.teamSide === 'string' ? event.teamSide.toLowerCase() : null;
      const isHomeTeamEvent = teamId
        ? teamId === input.homeTeamId
        : teamSide === 'home';
      const isAwayTeamEvent = teamId
        ? teamId === input.awayTeamId
        : teamSide === 'away';

      if (!isHomeTeamEvent && !isAwayTeamEvent) {
        continue;
      }

      hasDerivedScoreSignal = true;

      if (eventType === 'own_goal') {
        if (isHomeTeamEvent) {
          derivedAwayScore += 1;
        } else if (isAwayTeamEvent) {
          derivedHomeScore += 1;
        }
        continue;
      }

      if (isHomeTeamEvent) {
        derivedHomeScore += 1;
      } else if (isAwayTeamEvent) {
        derivedAwayScore += 1;
      }
    }

    if (!hasDerivedScoreSignal) {
      return {
        homeScore: input.homeScore,
        awayScore: input.awayScore,
      };
    }

    const storedHomeScore = input.homeScore;
    const storedAwayScore = input.awayScore;
    const storedTotal = (storedHomeScore ?? 0) + (storedAwayScore ?? 0);
    const derivedTotal = derivedHomeScore + derivedAwayScore;
    const shouldUseDerivedScore = storedHomeScore === null
      || storedAwayScore === null
      || storedTotal < derivedTotal
      || ((storedHomeScore ?? 0) === 0 && (storedAwayScore ?? 0) === 0 && derivedTotal > 0);

    if (!shouldUseDerivedScore) {
      return {
        homeScore: storedHomeScore,
        awayScore: storedAwayScore,
      };
    }

    return {
      homeScore: derivedHomeScore,
      awayScore: derivedAwayScore,
    };
  }

  private shouldAutoSyncFixtureSnapshot(fixture: FixtureEntity) {
    if (!fixture.externalProviderId?.startsWith('sofa_')) {
      return false;
    }

    if (fixture.status !== FixtureStatus.SCHEDULED) {
      return false;
    }

    const kickoffAtMs = fixture.kickoffAt.getTime();
    return Date.now() - kickoffAtMs > TournamentService.STALE_SCHEDULED_SYNC_GRACE_MS;
  }

  private triggerAutoSyncStaleFixtures(fixtures: FixtureEntity[]) {
    const staleFixtureIds = fixtures
      .filter((fixture) => (
        this.shouldAutoSyncFixtureSnapshot(fixture)
        && !this.inFlightAutoSyncFixtureIds.has(fixture.id)
      ))
      .map((fixture) => fixture.id)
      .slice(0, TournamentService.MAX_AUTO_SYNC_FIXTURES_PER_REQUEST);

    if (staleFixtureIds.length === 0) {
      return false;
    }

    for (const fixtureId of staleFixtureIds) {
      this.inFlightAutoSyncFixtureIds.add(fixtureId);
    }

    void this.egyptLiveTrackerService
      .refreshFixturesByIds(staleFixtureIds, { forceFullRefresh: true })
      .catch((error) => {
        this.logger.warn(
          `Automatic stale fixture sync failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      })
      .finally(() => {
        for (const fixtureId of staleFixtureIds) {
          this.inFlightAutoSyncFixtureIds.delete(fixtureId);
        }
      });

    return true;
  }

  private async normalizeStaleLiveFixtures(fixtures: FixtureEntity[]) {
    const now = Date.now();
    const staleFixtures = fixtures.filter((fixture) => (
      (fixture.status === FixtureStatus.LIVE || fixture.status === FixtureStatus.HALF_TIME)
      && fixture.kickoffAt.getTime() + TournamentService.STALE_LIVE_FIXTURE_WINDOW_MS <= now
    ));

    if (staleFixtures.length === 0) {
      return false;
    }

    for (const fixture of staleFixtures) {
      fixture.status = FixtureStatus.FULL_TIME;
      fixture.currentMinute = null;
      await this.fixturesRepository.save(fixture);
      this.egyptLiveStateService.clearState(fixture.id);
    }

    return true;
  }

  async getCurrentTournament() {
    if (this.currentTournamentCache && this.currentTournamentCache.expiresAt > Date.now()) {
      return this.currentTournamentCache.data;
    }

    const competition = readActiveCompetitionConfig(this.configService);

    const tournament = await this.tournamentsRepository.findOne({
      where: [{ competitionKey: competition.key }, { slug: competition.slug }],
      order: { year: 'DESC', createdAt: 'DESC' },
    });

    if (!tournament) {
      throw new NotFoundException('No tournament has been configured yet.');
    }

    this.currentTournamentCache = {
      expiresAt: Date.now() + TournamentService.CURRENT_TOURNAMENT_CACHE_TTL_MS,
      data: tournament,
    };

    return tournament;
  }

  async saveTournament(tournament: TournamentEntity) {
    const savedTournament = await this.tournamentsRepository.save(tournament);
    this.currentTournamentCache = {
      expiresAt: Date.now() + TournamentService.CURRENT_TOURNAMENT_CACHE_TTL_MS,
      data: savedTournament,
    };
    return savedTournament;
  }

  async getMatchdays(tournamentId?: string) {
    const queryBuilder = this.matchdaysRepository
      .createQueryBuilder('matchday')
      .leftJoinAndSelect('matchday.tournament', 'tournament')
      .orderBy('matchday.number', 'ASC');

    if (tournamentId) {
      queryBuilder.where('tournament.id = :tournamentId', { tournamentId });
    }

    return queryBuilder.getMany();
  }

  async getFixtures(options: {
    tournamentId?: string;
    matchdayId?: string;
    matchdayNumber?: number;
    groupCode?: string;
    includeStats?: boolean;
    includeLineups?: boolean;
    includeEvents?: boolean;
  }) {
    const resolvedTournamentId = options.tournamentId ?? (await this.getCurrentTournament()).id;
    const includeEvents = options.includeEvents === true;
    const includeStats = options.includeStats !== false || includeEvents;
    const includeLineups = options.includeLineups === true;
    const cacheKey = [
      resolvedTournamentId,
      options.matchdayId ?? '',
      options.matchdayNumber ?? '',
      options.groupCode?.trim().toUpperCase() ?? '',
      includeStats ? 'stats:1' : 'stats:0',
      includeLineups ? 'lineups:1' : 'lineups:0',
      includeEvents ? 'events:1' : 'events:0',
    ].join('::');
    const cached = this.fixturesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const queryBuilder = this.fixturesRepository
      .createQueryBuilder('fixture')
      .leftJoinAndSelect('fixture.tournament', 'tournament')
      .leftJoinAndSelect('fixture.matchday', 'matchday')
      .leftJoinAndSelect('fixture.group', 'group')
      .leftJoinAndSelect('fixture.homeTeam', 'homeTeam')
      .leftJoinAndSelect('fixture.awayTeam', 'awayTeam')
      .select([
        'fixture.id',
        'fixture.phase',
        'fixture.status',
        'fixture.kickoffAt',
        'fixture.venue',
        'fixture.homeScore',
        'fixture.awayScore',
        'fixture.currentMinute',
        'fixture.externalProviderId',
        'tournament.id',
        'tournament.name',
        'matchday.id',
        'matchday.number',
        'group.id',
        'group.code',
        'group.label',
        'homeTeam.id',
        'homeTeam.externalProviderId',
        'homeTeam.name',
        'homeTeam.shortName',
        'homeTeam.code',
        'homeTeam.flagUrl',
        'awayTeam.id',
        'awayTeam.externalProviderId',
        'awayTeam.name',
        'awayTeam.shortName',
        'awayTeam.code',
        'awayTeam.flagUrl',
      ])
      .where('tournament.id = :tournamentId', { tournamentId: resolvedTournamentId })
      .orderBy('fixture.kickoffAt', 'ASC');

    if (includeStats) {
      queryBuilder.addSelect('fixture.statistics');
    }

    if (includeLineups) {
      queryBuilder.addSelect('fixture.lineups');
    }

    if (options.matchdayId) {
      queryBuilder.andWhere('matchday.id = :matchdayId', {
        matchdayId: options.matchdayId,
      });
    }

    if (options.matchdayNumber !== undefined) {
      queryBuilder.andWhere('matchday.number = :matchdayNumber', {
        matchdayNumber: options.matchdayNumber,
      });
    }

    if (options.groupCode?.trim()) {
      queryBuilder.andWhere('group.code = :groupCode', {
        groupCode: options.groupCode.trim().toUpperCase(),
      });
    }

    let fixtures = await queryBuilder.getMany();
    const normalizedLiveFixtures = await this.normalizeStaleLiveFixtures(fixtures);
    if (normalizedLiveFixtures) {
      fixtures = await queryBuilder.getMany();
    }

    this.triggerAutoSyncStaleFixtures(fixtures);

    if (fixtures.length === 0) {
      return fixtures;
    }

    const eventsByFixtureId = new Map<string, Array<Record<string, unknown>>>();
    if (includeEvents) {
      const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
      const fallbackScoreEventFixtureIds = fixtures
        .filter((fixture) => {
          const liveState = this.egyptLiveStateService.getState(fixture.id);
          return !this.hasPrimaryPublicEvents({
            fixture,
            statistics: liveState?.statistics ?? fixture.statistics,
            liveIncidents: liveState?.incidents as Array<Record<string, unknown>> | undefined,
          });
        })
        .map((fixture) => fixture.id);

      if (fallbackScoreEventFixtureIds.length > 0) {
        const scoreEvents = await this.playerScoreEventsRepository
          .createQueryBuilder('scoreEvent')
          .select([
            'scoreEvent.id AS "id"',
            'scoreEvent.type AS "type"',
            'scoreEvent.minute AS "minute"',
            'scoreEvent.points AS "points"',
            'scoreEvent.details AS "details"',
            'scoreEvent.fixture_id AS "fixtureId"',
            'scoreEvent.player_id AS "playerId"',
          ])
          .where('scoreEvent.fixture_id IN (:...fixtureIds)', { fixtureIds: fallbackScoreEventFixtureIds })
          .orderBy('scoreEvent.minute', 'ASC')
          .addOrderBy('scoreEvent.createdAt', 'ASC')
          .getRawMany<{
            id: string;
            type: string;
            minute: number;
            points: number;
            details: Record<string, unknown> | null;
            fixtureId: string;
            playerId: string | null;
          }>();

        for (const scoreEvent of scoreEvents) {
          const fixtureId = scoreEvent.fixtureId;
          if (!fixtureId) {
            continue;
          }

          const existingEvents = eventsByFixtureId.get(fixtureId) ?? [];
          existingEvents.push(this.mapRawScoreEvent(scoreEvent, fixturesById.get(fixtureId)));
          eventsByFixtureId.set(fixtureId, existingEvents);
        }
      }
    }

    const response = fixtures.map((fixture) => {
      const liveState = this.egyptLiveStateService.getState(fixture.id);
      const effectiveStatistics = includeStats ? (liveState?.statistics ?? fixture.statistics) : null;
      const effectiveLineups = includeLineups ? (liveState?.lineups ?? fixture.lineups) : null;
      const resolvedEvents = includeEvents
        ? this.resolvePublicFixtureEvents({
          fixture,
          statistics: effectiveStatistics,
          liveIncidents: liveState?.incidents as Array<Record<string, unknown>> | undefined,
          scoreEvents: eventsByFixtureId.get(fixture.id),
        })
        : [];
      const resolvedScore = this.resolveScoresFromEvents({
        homeTeamId: fixture.homeTeam?.id ?? null,
        awayTeamId: fixture.awayTeam?.id ?? null,
        homeScore: liveState?.homeScore ?? fixture.homeScore,
        awayScore: liveState?.awayScore ?? fixture.awayScore,
        events: includeEvents ? resolvedEvents : null,
      });

      return {
        ...fixture,
        status: liveState?.status ?? fixture.status,
        currentMinute: liveState?.currentMinute ?? fixture.currentMinute,
        homeScore: resolvedScore.homeScore,
        awayScore: resolvedScore.awayScore,
        statistics: effectiveStatistics,
        lineups: effectiveLineups,
        events: resolvedEvents,
      };
    });

    this.fixturesCache.set(cacheKey, {
      expiresAt: Date.now() + TournamentService.FIXTURES_CACHE_TTL_MS,
      data: response,
    });

    return response;
  }

  async getLiveFixtures() {
    let fixtures = await this.fixturesRepository.find({
      where: [
        { status: FixtureStatus.LIVE },
        { status: FixtureStatus.HALF_TIME },
      ],
      relations: {
        tournament: true,
        matchday: true,
        group: true,
        homeTeam: true,
        awayTeam: true,
      },
      order: { kickoffAt: 'ASC' },
    });

    if (await this.normalizeStaleLiveFixtures(fixtures)) {
      fixtures = await this.fixturesRepository.find({
        where: [
          { status: FixtureStatus.LIVE },
          { status: FixtureStatus.HALF_TIME },
        ],
        relations: {
          tournament: true,
          matchday: true,
          group: true,
          homeTeam: true,
          awayTeam: true,
        },
        order: { kickoffAt: 'ASC' },
      });
    }

    const liveStates = this.egyptLiveStateService.getStates().filter((state) => (
      state.status === FixtureStatus.LIVE || state.status === FixtureStatus.HALF_TIME
    ));
    const persistedFixtureIds = new Set(fixtures.map((fixture) => fixture.id));

    for (const state of liveStates) {
      if (persistedFixtureIds.has(state.fixtureId)) {
        continue;
      }

      const liveFixture = await this.fixturesRepository.findOne({
        where: { id: state.fixtureId },
        relations: {
          tournament: true,
          matchday: true,
          group: true,
          homeTeam: true,
          awayTeam: true,
        },
      });

      if (liveFixture) {
        liveFixture.status = state.status;
        liveFixture.currentMinute = state.currentMinute;
        liveFixture.homeScore = state.homeScore;
        liveFixture.awayScore = state.awayScore;
        liveFixture.statistics = state.statistics;
        liveFixture.lineups = state.lineups;
        fixtures.push(liveFixture);
      }
    }

    if (fixtures.length === 0) return [];

    const scoreEvents = await this.playerScoreEventsRepository
      .createQueryBuilder('scoreEvent')
      .loadRelationIdAndMap('scoreEvent.fixtureId', 'scoreEvent.fixture')
      .loadRelationIdAndMap('scoreEvent.playerId', 'scoreEvent.player')
      .where('scoreEvent.fixture_id IN (:...fixtureIds)', { fixtureIds: fixtures.map((f) => f.id) })
      .orderBy('scoreEvent.minute', 'ASC')
      .addOrderBy('scoreEvent.createdAt', 'ASC')
      .getMany();

    const eventsByFixtureId = new Map<string, Array<Record<string, unknown>>>();
    const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    for (const scoreEvent of scoreEvents) {
      const relationPayload = scoreEvent as unknown as { fixtureId?: unknown };
      const fixtureId = this.readRelationId(relationPayload.fixtureId);
      if (!fixtureId) {
        continue;
      }

      const list = eventsByFixtureId.get(fixtureId) ?? [];
      list.push(this.mapScoreEvent(scoreEvent, fixturesById.get(fixtureId)));
      eventsByFixtureId.set(fixtureId, list);
    }

    return fixtures.map((fixture) => {
      const liveState = this.egyptLiveStateService.getState(fixture.id);
      const resolvedEvents = this.resolvePublicFixtureEvents({
        fixture,
        statistics: liveState?.statistics ?? fixture.statistics,
        liveIncidents: liveState?.incidents,
        scoreEvents: eventsByFixtureId.get(fixture.id),
      });
      const resolvedScore = this.resolveScoresFromEvents({
        homeTeamId: fixture.homeTeam?.id ?? null,
        awayTeamId: fixture.awayTeam?.id ?? null,
        homeScore: liveState?.homeScore ?? fixture.homeScore,
        awayScore: liveState?.awayScore ?? fixture.awayScore,
        events: resolvedEvents,
      });
      const resolvedFixture = {
        ...fixture,
        status: liveState?.status ?? fixture.status,
        currentMinute: liveState?.currentMinute ?? fixture.currentMinute,
        homeScore: resolvedScore.homeScore,
        awayScore: resolvedScore.awayScore,
        statistics: liveState?.statistics ?? fixture.statistics,
        lineups: liveState?.lineups ?? fixture.lineups,
        events: resolvedEvents,
      };
      return resolvedFixture;
    }).filter((fixture) => fixture.status === FixtureStatus.LIVE || fixture.status === FixtureStatus.HALF_TIME);
  }

  async refreshLiveFixtures() {
    try {
      return await this.egyptLiveTrackerService.refreshLiveFixtures();
    } catch (error) {
      this.logger.warn(
        `Live refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );

      return {
        updatedFixtures: 0,
        fixtureIds: [],
        skipped: true,
      };
    }
  }

  async syncFixtureResultById(fixtureId: string) {
    let fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: {
        tournament: true,
        matchday: true,
        group: true,
        homeTeam: true,
        awayTeam: true,
      },
    });

    if (!fixture) {
      throw new NotFoundException(`Fixture ${fixtureId} not found.`);
    }

    return this.egyptLiveTrackerService.syncFixtureResultsByIds([fixture.id]);
  }

  async syncMatchdayResults(matchdayId: string) {
    const fixtures = await this.fixturesRepository.find({
      where: { matchday: { id: matchdayId } },
      relations: {
        tournament: true,
        matchday: true,
        group: true,
        homeTeam: true,
        awayTeam: true,
      },
      order: { kickoffAt: 'ASC' },
    });

    if (fixtures.length === 0) {
      throw new NotFoundException(`No fixtures found for matchday ${matchdayId}.`);
    }

    return this.egyptLiveTrackerService.syncFixtureResultsByIds(fixtures.map((fixture) => fixture.id));
  }

  async scrapeFixtureById(fixtureId: string) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: {
        tournament: true,
        matchday: true,
        group: true,
        homeTeam: true,
        awayTeam: true,
      },
    });

    if (!fixture) {
      throw new NotFoundException(`Fixture ${fixtureId} not found.`);
    }

    if (!fixture.externalProviderId?.startsWith('sofa_')) {
      return {
        updatedFixtures: 0,
        fixtureIds: [],
        skipped: true,
        reason: 'Selected fixture is not scrape-enabled.',
      };
    }

    try {
      return await this.egyptLiveTrackerService.refreshFixturesByIds([fixtureId], { forceFullRefresh: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Manual fixture scrape failed for ${fixtureId}: ${message}`);

      return {
        updatedFixtures: 0,
        fixtureIds: [],
        skipped: true,
        reason: `Manual fixture scrape failed: ${message}`,
      };
    }
  }

  async linkFixtureToSofaScoreAndScrape(fixtureId: string, sofaScoreUrl: string) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: {
        tournament: true,
        matchday: true,
        group: true,
        homeTeam: true,
        awayTeam: true,
      },
    });

    if (!fixture) {
      throw new NotFoundException(`Fixture ${fixtureId} not found.`);
    }

    const eventId = this.extractSofaScoreEventId(sofaScoreUrl);
    if (!eventId) {
      throw new BadRequestException('The provided SofaScore URL does not contain a valid event id.');
    }

    fixture.externalProviderId = `sofa_${eventId}`;
    await this.fixturesRepository.save(fixture);

    const result = await this.scrapeFixtureById(fixtureId);

    return {
      fixtureId,
      sofaScoreUrl,
      eventId,
      externalProviderId: fixture.externalProviderId,
      result,
    };
  }

  private extractSofaScoreEventId(sofaScoreUrl: string): number | null {
    const value = sofaScoreUrl.trim();
    if (!value) {
      return null;
    }

    const patterns = [
      /#id:(\d+)/i,
      /\/event\/[^/]+\/(\d+)(?:[/?#]|$)/i,
      /(?:^|\/)(\d+)(?:[/?#]|$)/,
    ];

    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (!match) {
        continue;
      }

      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return null;
  }

  async scrapeFixturesByIds(fixtureIds: string[]) {
    const uniqueFixtureIds = Array.from(new Set(fixtureIds.filter(Boolean)));

    if (uniqueFixtureIds.length === 0) {
      return {
        updatedFixtures: 0,
        fixtureIds: [],
        skipped: true,
        reason: 'No scrape-enabled fixtures found for the selected round.',
      };
    }

    try {
      return await this.egyptLiveTrackerService.refreshFixturesByIds(uniqueFixtureIds, { forceFullRefresh: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Manual fixtures scrape failed: ${message}`);

      return {
        updatedFixtures: 0,
        fixtureIds: [],
        skipped: true,
        reason: `Manual fixtures scrape failed: ${message}`,
      };
    }
  }

  async getFixtureById(fixtureId: string) {
    let fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: {
        tournament: true,
        matchday: true,
        group: true,
        homeTeam: true,
        awayTeam: true,
      },
    });

    if (!fixture) {
      throw new NotFoundException(`Fixture ${fixtureId} not found.`);
    }

    if (await this.normalizeStaleLiveFixtures([fixture])) {
      const refreshedFixtureAfterStatusCleanup = await this.fixturesRepository.findOne({
        where: { id: fixtureId },
        relations: {
          tournament: true,
          matchday: true,
          group: true,
          homeTeam: true,
          awayTeam: true,
        },
      });

      if (refreshedFixtureAfterStatusCleanup) {
        fixture = refreshedFixtureAfterStatusCleanup;
      }
    }

    this.triggerAutoSyncStaleFixtures([fixture]);

    const scoreEvents = await this.playerScoreEventsRepository
      .createQueryBuilder('scoreEvent')
      .loadRelationIdAndMap('scoreEvent.playerId', 'scoreEvent.player')
      .where('scoreEvent.fixture_id = :fixtureId', { fixtureId })
      .orderBy('scoreEvent.minute', 'ASC')
      .addOrderBy('scoreEvent.createdAt', 'ASC')
      .getMany();

    const liveState = this.egyptLiveStateService.getState(fixture.id);
    const effectiveStatistics = liveState?.statistics ?? fixture.statistics;
    const effectiveLineups = liveState?.lineups ?? fixture.lineups;
    const fantasyScoreEvents = scoreEvents.map((scoreEvent) => this.mapScoreEvent(scoreEvent, fixture));
    const events = this.resolvePublicFixtureEvents({
      fixture,
      statistics: effectiveStatistics,
      liveIncidents: liveState?.incidents as Array<Record<string, unknown>> | undefined,
      scoreEvents: fantasyScoreEvents,
    });
    const resolvedScore = this.resolveScoresFromEvents({
      homeTeamId: fixture.homeTeam?.id ?? null,
      awayTeamId: fixture.awayTeam?.id ?? null,
      homeScore: liveState?.homeScore ?? fixture.homeScore,
      awayScore: liveState?.awayScore ?? fixture.awayScore,
      events,
    });

    return {
      ...fixture,
      status: liveState?.status ?? fixture.status,
      currentMinute: liveState?.currentMinute ?? fixture.currentMinute,
      homeScore: resolvedScore.homeScore,
      awayScore: resolvedScore.awayScore,
      statistics: effectiveStatistics,
      lineups: effectiveLineups,
      events,
    };
  }

  async getGroupStandings(groupCode: string, tournamentId?: string) {
    const normalizedGroupCode = groupCode.trim().toUpperCase();
    const resolvedTournamentId = tournamentId ?? (await this.getCurrentTournament()).id;

    const group = await this.groupsRepository.findOne({
      where: {
        code: normalizedGroupCode,
        tournament: { id: resolvedTournamentId },
      },
      relations: { teams: true, tournament: true },
    });

    if (!group) {
      throw new NotFoundException(`Group ${normalizedGroupCode} not found.`);
    }

    const fixtures = await this.fixturesRepository.find({
      where: { group: { id: group.id } },
      relations: { homeTeam: true, awayTeam: true },
      order: { kickoffAt: 'ASC' },
    });

    type StandingAccumulator = {
      team: GroupEntity['teams'][number];
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
      points: number;
    };

    const standingsByTeamId = new Map<string, StandingAccumulator>();

    const ensureTeamStanding = (team: GroupEntity['teams'][number]) => {
      const existing = standingsByTeamId.get(team.id);
      if (existing) {
        return existing;
      }

      const created: StandingAccumulator = {
        team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };

      standingsByTeamId.set(team.id, created);
      return created;
    };

    for (const team of group.teams ?? []) {
      ensureTeamStanding(team);
    }

    const providerBackedFixtures = fixtures.filter((fixture) => Boolean(fixture.externalProviderId));

    for (const fixture of providerBackedFixtures) {
      if (fixture.homeScore === null || fixture.awayScore === null) {
        continue;
      }

      const homeStanding = ensureTeamStanding(fixture.homeTeam);
      const awayStanding = ensureTeamStanding(fixture.awayTeam);

      homeStanding.played += 1;
      awayStanding.played += 1;

      homeStanding.goalsFor += fixture.homeScore;
      homeStanding.goalsAgainst += fixture.awayScore;
      awayStanding.goalsFor += fixture.awayScore;
      awayStanding.goalsAgainst += fixture.homeScore;

      if (fixture.homeScore > fixture.awayScore) {
        homeStanding.won += 1;
        homeStanding.points += 3;
        awayStanding.lost += 1;
      } else if (fixture.homeScore < fixture.awayScore) {
        awayStanding.won += 1;
        awayStanding.points += 3;
        homeStanding.lost += 1;
      } else {
        homeStanding.drawn += 1;
        awayStanding.drawn += 1;
        homeStanding.points += 1;
        awayStanding.points += 1;
      }
    }

    const sortedStandings = Array.from(standingsByTeamId.values())
      .map((standing) => ({
        ...standing,
        goalDifference: standing.goalsFor - standing.goalsAgainst,
      }))
      .sort((left, right) => {
        const pointsDifference = right.points - left.points;
        if (pointsDifference !== 0) {
          return pointsDifference;
        }

        const goalDifference = right.goalDifference - left.goalDifference;
        if (goalDifference !== 0) {
          return goalDifference;
        }

        const goalsForDifference = right.goalsFor - left.goalsFor;
        if (goalsForDifference !== 0) {
          return goalsForDifference;
        }

        return left.team.name.localeCompare(right.team.name);
      });

    return sortedStandings.map((standing, index) => ({
      position: index + 1,
      played: standing.played,
      won: standing.won,
      drawn: standing.drawn,
      lost: standing.lost,
      goalsFor: standing.goalsFor,
      goalsAgainst: standing.goalsAgainst,
      goalDifference: standing.goalDifference,
      points: standing.points,
      qualified: false,
      possibleThird: false,
      team: {
        id: standing.team.id,
        externalProviderId: standing.team.externalProviderId,
        name: standing.team.name,
        shortName: standing.team.shortName,
        code: standing.team.code,
        flagUrl: standing.team.flagUrl,
      },
    }));
  }
}
