import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FixtureStatus, PlayerPosition, TournamentPhase } from '../../common/database';
import { resolveLeagueId } from '../../common/config/competition.config';
import { PlayerEntity } from '../catalog/entities/player.entity';
import { TeamEntity } from '../catalog/entities/team.entity';
import { UserEntity } from '../users/entities/user.entity';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { ScoringService } from '../scoring/scoring.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { TournamentService } from '../tournament/tournament.service';
import { FixtureEntity } from '../tournament/entities/fixture.entity';
import { TournamentEntity } from '../tournament/entities/tournament.entity';
import { GroupEntity } from '../tournament/entities/group.entity';
import { MatchdayEntity, MatchdayStatus } from '../tournament/entities/matchday.entity';
import { FeedPayloadQueryDto } from './dto/feed-payload-query.dto';
import {
  FEED_MATCHDAY_RECOMPUTE_MODES,
  FeedMatchdayRecomputeMode,
  FeedSyncAdminDto,
} from './dto/feed-sync-admin.dto';
import { IngestFeedPayloadDto } from './dto/ingest-feed-payload.dto';
import { ProviderMappingQueryDto } from './dto/provider-mapping-query.dto';
import { SofaFixtureScrapeAdminDto } from './dto/sofa-fixture-scrape-admin.dto';
import { SofaTeamPlayersScrapeAdminDto } from './dto/sofa-team-players-scrape-admin.dto';
import { FeedProcessingStatus, RawFeedPayloadEntity } from './entities/raw-feed-payload.entity';
import { ProviderRouter } from './providers/provider-router';
import { ProviderFixtureEvent, ProviderStatEntry, ProviderTeamLineup, ProviderTeamStats } from './providers/provider.interface';
import { SofaBrowserClient } from '../tournament/egypt-live-tracker.service';

const ADMIN_DASHBOARD_COMPETITION_KEY = 'egyptian-premier-league-current';
const EGYPTIAN_PREMIER_LEAGUE_EXTERNAL_ID = 808;

type SofaTeamPlayersResponse = {
  players?: Array<{
    player?: {
      id?: number;
      name?: string;
      shortName?: string | null;
      position?: string | null;
    };
  }>;
};

@Injectable()
export class FeedService implements OnModuleDestroy {
  private readonly logger = new Logger(FeedService.name);
  private readonly inFlightTournamentSyncs = new Map<string, Promise<Record<string, unknown>>>();
  private readonly sofaClient = new SofaBrowserClient();

  constructor(
    @InjectRepository(RawFeedPayloadEntity)
    private readonly rawFeedPayloadsRepository: Repository<RawFeedPayloadEntity>,
    @InjectRepository(FixtureEntity)
    private readonly fixturesRepository: Repository<FixtureEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playersRepository: Repository<PlayerEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamsRepository: Repository<TeamEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupsRepository: Repository<GroupEntity>,
    @InjectRepository(MatchdayEntity)
    private readonly matchdaysRepository: Repository<MatchdayEntity>,
    @InjectRepository(TournamentEntity)
    private readonly tournamentsRepository: Repository<TournamentEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly configService: ConfigService,
    private readonly scoringService: ScoringService,
    private readonly leaderboardsService: LeaderboardsService,
    private readonly tournamentService: TournamentService,
    private readonly realtimeEventsService: RealtimeEventsService,
    private readonly providerRouter: ProviderRouter,
  ) {}

  async onModuleDestroy() {
    await this.sofaClient.close();
  }

  async getStatus() {
    const [pending, processed, failed] = await Promise.all([
      this.rawFeedPayloadsRepository.count({ where: { status: FeedProcessingStatus.PENDING } }),
      this.rawFeedPayloadsRepository.count({ where: { status: FeedProcessingStatus.PROCESSED } }),
      this.rawFeedPayloadsRepository.count({ where: { status: FeedProcessingStatus.FAILED } }),
    ]);

    return {
      module: 'feed',
      status: 'ingestion-ready',
      ingestionModes: ['polling', 'webhook', 'replay'],
      counts: { pending, processed, failed },
      providers: this.providerRouter.getStatus(),
    };
  }

  getPayloads(status?: FeedProcessingStatus) {
    return this.rawFeedPayloadsRepository.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: 25,
    });
  }

  async getAdminOverview(tournamentId?: string) {
    let tournament = null;

    if (tournamentId) {
      tournament = await this.tournamentsRepository.findOne({ where: { id: tournamentId } });
    } else {
      const tournaments = await this.tournamentsRepository.find({
        where: { competitionKey: ADMIN_DASHBOARD_COMPETITION_KEY },
        order: { year: 'DESC', createdAt: 'DESC' },
        take: 1,
      });
      tournament = tournaments[0] ?? null;
    }

    const [status, providerMappings, recentPayloads] = await Promise.all([
      this.getStatus(),
      this.getProviderMappings(tournament?.id),
      this.rawFeedPayloadsRepository.find({
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    return {
      tournament,
      status,
      providerMappings,
      recentPayloads,
      autoSync: {
        enabled: this.configService.get<boolean>('EXTERNAL_FEED_AUTO_SYNC_ENABLED', false),
        intervalSeconds: this.configService.get<number>('EXTERNAL_FEED_SYNC_INTERVAL_SECONDS', 30),
        runOnBoot: this.configService.get<boolean>('EXTERNAL_FEED_AUTO_SYNC_ON_BOOT', true),
      },
    };
  }

  async getAdminPayloads(query: FeedPayloadQueryDto) {
    const queryBuilder = this.rawFeedPayloadsRepository
      .createQueryBuilder('payload')
      .orderBy('payload.createdAt', 'DESC')
      .take(100);

    if (query.status) {
      queryBuilder.andWhere('payload.status = :status', { status: query.status });
    }

    if (query.provider) {
      queryBuilder.andWhere('payload.provider = :provider', { provider: query.provider });
    }

    if (query.entityType) {
      queryBuilder.andWhere('payload.entityType = :entityType', { entityType: query.entityType });
    }

    return queryBuilder.getMany();
  }

  getProviderStatus() {
    return this.providerRouter.getStatus();
  }

  async getProviderMappings(tournamentId?: string) {
    const tournaments = await this.tournamentsRepository.find(
      tournamentId
        ? { where: { id: tournamentId }, order: { year: 'DESC', createdAt: 'DESC' } }
        : { where: { competitionKey: ADMIN_DASHBOARD_COMPETITION_KEY }, order: { year: 'DESC', createdAt: 'DESC' } },
    );

    return Promise.all(
      tournaments.map(async (tournament) => {
        const teams = await this.teamsRepository.find({
          where: { tournament: { id: tournament.id } },
          order: { name: 'ASC' },
        });

        const players = await this.playersRepository.find({
          where: { team: { tournament: { id: tournament.id } } },
          relations: { team: true },
          order: { name: 'ASC' },
        });

        return {
          tournament: {
            id: tournament.id,
            name: tournament.name,
            competitionKey: tournament.competitionKey,
            externalLeagueId: tournament.externalLeagueId,
            externalSeason: tournament.externalSeason,
            format: tournament.format,
          },
          teams: teams.map((team) => ({
            id: team.id,
            name: team.name,
            shortName: team.shortName,
            flagUrl: team.flagUrl,
            externalProviderId: team.externalProviderId,
            mapped: Boolean(team.externalProviderId),
          })),
          players: players.map((player) => ({
            id: player.id,
            name: player.name,
            shortName: player.shortName,
            teamId: player.team?.id ?? null,
            teamName: player.team?.name ?? null,
            externalProviderId: player.externalProviderId,
            mapped: Boolean(player.externalProviderId),
          })),
        };
      }),
    );
  }

  async triggerAdminSync(dto: FeedSyncAdminDto) {
    try {
      const actor = dto.requestedByUserId
        ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
        : null;

      const syncEvents = dto.syncEvents ?? true;

      if (dto.fixtureId) {
        const result = await this.ingestApiFootballFixtureEvents(dto.fixtureId);
        return {
          mode: 'fixture_events',
          actor: actor?.email ?? null,
          reason: dto.reason ?? 'admin_fixture_event_sync',
          result,
        };
      }

      if (dto.tournamentId) {
        const result = await this.syncTournamentById(dto.tournamentId, syncEvents);
        return {
          mode: 'tournament_sync',
          actor: actor?.email ?? null,
          reason: dto.reason ?? 'admin_tournament_sync',
          result,
        };
      }

      const result = await this.syncAllTournaments(syncEvents);
      return {
        mode: 'all_tournaments_sync',
        actor: actor?.email ?? null,
        reason: dto.reason ?? 'admin_global_sync',
        result,
      };
    } catch (error) {
      this.logger.error(JSON.stringify({
        alertType: 'feed_sync_failed',
        severity: 'critical',
        scope: dto.fixtureId ? 'fixture' : dto.tournamentId ? 'tournament' : 'global',
        fixtureId: dto.fixtureId ?? null,
        tournamentId: dto.tournamentId ?? null,
        requestedByUserId: dto.requestedByUserId ?? null,
        reason: dto.reason ?? null,
        message: error instanceof Error ? error.message : 'Unknown feed sync failure',
        timestamp: new Date().toISOString(),
      }));
      throw error;
    }
  }

  async triggerAdminFixtureResultSync(
    fixtureId: string,
    dto: Pick<FeedSyncAdminDto, 'reason' | 'requestedByUserId'>,
  ) {
    const actor = dto.requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
      : null;

    const result = await this.tournamentService.syncFixtureResultById(fixtureId);

    return {
      mode: 'fixture_result_sync',
      actor: actor?.email ?? null,
      reason: dto.reason ?? 'admin_fixture_result_sync',
      fixtureId,
      result,
    };
  }

  async triggerAdminMatchdayResultSync(
    matchdayId: string,
    dto: Pick<FeedSyncAdminDto, 'reason' | 'requestedByUserId'>,
  ) {
    const actor = dto.requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
      : null;

    const fixtures = await this.fixturesRepository.find({
      where: { matchday: { id: matchdayId } },
      relations: {
        matchday: true,
        tournament: true,
      },
      order: { kickoffAt: 'ASC' },
    });

    if (fixtures.length === 0) {
      throw new NotFoundException(`No fixtures found for matchday ${matchdayId}.`);
    }

    if (!this.isEgyptianPremierLeagueMatchday(fixtures)) {
      throw new BadRequestException('Matchday result sync is allowed only for the Egyptian Premier League.');
    }

    const result = await this.tournamentService.syncMatchdayResults(matchdayId);

    return {
      mode: 'matchday_result_sync',
      actor: actor?.email ?? null,
      reason: dto.reason ?? 'admin_matchday_result_sync',
      matchdayId,
      result,
    };
  }

  async triggerAdminLiveScrape(dto: Pick<FeedSyncAdminDto, 'reason' | 'requestedByUserId'>) {
    try {
      const actor = dto.requestedByUserId
        ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
        : null;

      const result = await this.tournamentService.refreshLiveFixtures();

      return {
        mode: 'manual_live_scrape',
        actor: actor?.email ?? null,
        reason: dto.reason ?? 'admin_manual_live_scrape',
        result,
      };
    } catch (error) {
      this.logger.error(JSON.stringify({
        alertType: 'feed_live_scrape_failed',
        severity: 'critical',
        requestedByUserId: dto.requestedByUserId ?? null,
        reason: dto.reason ?? null,
        message: error instanceof Error ? error.message : 'Unknown live scrape failure',
        timestamp: new Date().toISOString(),
      }));
      throw error;
    }
  }

  async triggerAdminFixtureScrape(
    fixtureId: string,
    dto: Pick<FeedSyncAdminDto, 'reason' | 'requestedByUserId'>,
  ) {
    const actor = dto.requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
      : null;

    const result = await this.tournamentService.scrapeFixtureById(fixtureId);

    return {
      mode: 'manual_fixture_scrape',
      actor: actor?.email ?? null,
      reason: dto.reason ?? 'admin_manual_fixture_scrape',
      result,
    };
  }

  async triggerAdminSofaScoreFixtureScrape(dto: SofaFixtureScrapeAdminDto) {
    const actor = dto.requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
      : null;

    const result = await this.tournamentService.linkFixtureToSofaScoreAndScrape(dto.fixtureId, dto.sofaScoreUrl);
    const scoring = await this.scoringService.recomputeFixture(dto.fixtureId);

    return {
      mode: 'manual_sofascore_fixture_scrape',
      actor: actor?.email ?? null,
      reason: dto.reason ?? 'admin_manual_sofascore_fixture_scrape',
      fixtureId: dto.fixtureId,
      sofaScoreUrl: dto.sofaScoreUrl,
      result,
      scoring,
    };
  }

  async triggerAdminSofaScoreTeamPlayersScrape(dto: SofaTeamPlayersScrapeAdminDto) {
    const actor = dto.requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
      : null;

    const team = await this.teamsRepository.findOne({
      where: { id: dto.teamId },
      relations: { tournament: true },
    });

    if (!team) {
      throw new NotFoundException('Selected team was not found.');
    }

    const sofaScoreTeamId = this.extractSofaScoreTeamId(dto.sofaScoreUrl);
    if (!sofaScoreTeamId) {
      throw new BadRequestException('The provided SofaScore team URL does not contain a valid team id.');
    }

    await this.sofaClient.init();
    const roster = await this.sofaClient.requestJson<SofaTeamPlayersResponse>(`https://www.sofascore.com/api/v1/team/${sofaScoreTeamId}/players`);
    const rosterPlayers = roster.players ?? [];

    if (!rosterPlayers.length) {
      throw new NotFoundException('No players were returned from the provided SofaScore team page.');
    }

    const existingTeamPlayers = await this.playersRepository.find({
      where: { team: { id: team.id } },
      relations: { team: true },
    });

    const existingByExternalId = new Map(
      existingTeamPlayers
        .filter((player) => typeof player.externalProviderId === 'string' && player.externalProviderId.trim().length > 0)
        .map((player) => [player.externalProviderId!.trim(), player]),
    );
    const existingByName = new Map(existingTeamPlayers.map((player) => [this.normalizeLookup(player.name), player]));

    let created = 0;
    let updated = 0;

    for (const entry of rosterPlayers) {
      const remotePlayer = entry.player;
      if (!remotePlayer?.name?.trim()) {
        continue;
      }

      const remoteExternalId = typeof remotePlayer.id === 'number' && Number.isFinite(remotePlayer.id)
        ? String(remotePlayer.id)
        : null;
      const normalizedName = this.normalizeLookup(remotePlayer.name);
      const existing = (remoteExternalId ? existingByExternalId.get(remoteExternalId) : undefined)
        ?? existingByName.get(normalizedName)
        ?? null;

      const nextShortName = this.buildSofaShortName(remotePlayer.name, remotePlayer.shortName);
      const nextPosition = this.mapSofaRosterPosition(remotePlayer.position);

      if (existing) {
        existing.name = remotePlayer.name.trim();
        existing.shortName = nextShortName;
        existing.position = nextPosition;
        existing.team = team;
        existing.currentPrice = '5.00';
        existing.externalProviderId = remoteExternalId ?? existing.externalProviderId ?? null;
        existing.isActive = true;
        existing.isInjured = false;
        existing.isSuspended = false;
        await this.playersRepository.save(existing);
        updated += 1;
        continue;
      }

      const createdPlayer = this.playersRepository.create({
        name: remotePlayer.name.trim(),
        shortName: nextShortName,
        position: nextPosition,
        externalProviderId: remoteExternalId,
        currentPrice: '5.00',
        isActive: true,
        isInjured: false,
        isSuspended: false,
        minutesPlayed: 0,
        totalPoints: 0,
        team,
      });
      await this.playersRepository.save(createdPlayer);
      created += 1;
    }

    return {
      mode: 'manual_sofascore_team_players_scrape',
      actor: actor?.email ?? null,
      reason: dto.reason ?? 'admin_manual_sofascore_team_players_scrape',
      teamId: team.id,
      teamName: team.name,
      sofaScoreUrl: dto.sofaScoreUrl,
      sofaScoreTeamId,
      totalRemotePlayers: rosterPlayers.length,
      created,
      updated,
      fixedPrice: '5.00',
    };
  }

  async triggerAdminMatchdayScrape(
    matchdayId: string,
    dto: Pick<FeedSyncAdminDto, 'reason' | 'requestedByUserId' | 'recomputeMode'>,
  ) {
    const actor = dto.requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
      : null;

    const recomputeMode: FeedMatchdayRecomputeMode = FEED_MATCHDAY_RECOMPUTE_MODES.includes(
      dto.recomputeMode as FeedMatchdayRecomputeMode,
    )
      ? (dto.recomputeMode as FeedMatchdayRecomputeMode)
      : 'changed_only';

    const fixtures = await this.fixturesRepository.find({
      where: { matchday: { id: matchdayId } },
      relations: {
        matchday: true,
        tournament: true,
      },
      order: { kickoffAt: 'ASC' },
    });

    if (fixtures.length === 0) {
      throw new NotFoundException(`No fixtures found for matchday ${matchdayId}.`);
    }

    if (!this.isEgyptianPremierLeagueMatchday(fixtures)) {
      throw new BadRequestException('Matchday scrape is allowed only for the Egyptian Premier League.');
    }

    const scrapeableFixtureIds = fixtures
      .filter((fixture) => fixture.externalProviderId?.startsWith('sofa_'))
      .map((fixture) => fixture.id);

    const result = await this.tournamentService.scrapeFixturesByIds(scrapeableFixtureIds);

    const changedFixtureIds = this.resolveChangedFixtureIds(result, scrapeableFixtureIds);
    const fixtureIdsToRecompute = recomputeMode === 'all_matchday' ? scrapeableFixtureIds : changedFixtureIds;

    const recomputeResults = [] as Array<Record<string, unknown>>;
    for (const fixtureId of fixtureIdsToRecompute) {
      recomputeResults.push((await this.scoringService.recomputeFixture(fixtureId)) as Record<string, unknown>);
    }

    const leaderboardRefresh = fixtureIdsToRecompute.length
      ? await this.leaderboardsService.materializeForMatchday(matchdayId)
      : null;

    return {
      mode: 'manual_matchday_scrape',
      actor: actor?.email ?? null,
      reason: dto.reason ?? 'admin_manual_matchday_scrape',
      matchdayId,
      recomputeMode,
      scrapeableFixtures: scrapeableFixtureIds.length,
      changedFixtures: changedFixtureIds.length,
      recomputedFixtures: fixtureIdsToRecompute.length,
      recomputedFixtureIds: fixtureIdsToRecompute,
      recomputeResults,
      leaderboardRefresh,
      result,
    };
  }

  private isEgyptianPremierLeagueMatchday(fixtures: FixtureEntity[]) {
    return fixtures.every((fixture) => {
      const competitionKey = fixture.tournament?.competitionKey ?? null;
      const externalLeagueId = fixture.tournament?.externalLeagueId ?? null;

      return competitionKey === ADMIN_DASHBOARD_COMPETITION_KEY || externalLeagueId === EGYPTIAN_PREMIER_LEAGUE_EXTERNAL_ID;
    });
  }

  private extractSofaScoreTeamId(sofaScoreUrl: string): number | null {
    const value = sofaScoreUrl.trim();
    if (!value) {
      return null;
    }

    const patterns = [
      /#id:(\d+)/i,
      /\/team\/[^/]+\/[^/]+\/(\d+)(?:[/?#]|$)/i,
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

  private normalizeLookup(value: string | null | undefined) {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private buildSofaShortName(fullName: string, provided?: string | null) {
    const normalizedProvided = provided?.trim();
    if (normalizedProvided) {
      return normalizedProvided.slice(0, 80);
    }

    const segments = fullName.split(' ').filter(Boolean);
    if (segments.length <= 1) {
      return fullName.slice(0, 80);
    }

    return `${segments[0][0]}. ${segments[segments.length - 1]}`.slice(0, 80);
  }

  private mapSofaRosterPosition(position?: string | null): PlayerPosition {
    switch ((position ?? '').toUpperCase()) {
      case 'G':
      case 'GK':
      case 'GOALKEEPER':
        return PlayerPosition.GOALKEEPER;
      case 'D':
      case 'DEF':
      case 'DEFENDER':
        return PlayerPosition.DEFENDER;
      case 'M':
      case 'MID':
      case 'MIDFIELDER':
        return PlayerPosition.MIDFIELDER;
      case 'F':
      case 'FW':
      case 'FWD':
      case 'FORWARD':
      case 'ATT':
      case 'ATTACKER':
        return PlayerPosition.FORWARD;
      default:
        return PlayerPosition.MIDFIELDER;
    }
  }

  private resolveChangedFixtureIds(
    scrapeResult: Record<string, unknown>,
    fallbackFixtureIds: string[],
  ): string[] {
    const fixtureIdsValue = scrapeResult.fixtureIds;
    if (Array.isArray(fixtureIdsValue)) {
      const ids = fixtureIdsValue.filter((id): id is string => typeof id === 'string' && id.length > 0);
      return Array.from(new Set(ids));
    }

    const updatedFixtures = scrapeResult.updatedFixtures;
    if (typeof updatedFixtures === 'number' && updatedFixtures > 0) {
      return fallbackFixtureIds;
    }

    return [];
  }

  async ingestPayload(dto: IngestFeedPayloadDto) {
    const payload = await this.rawFeedPayloadsRepository.save(
      this.rawFeedPayloadsRepository.create({
        provider: dto.provider,
        entityType: dto.entityType,
        eventType: dto.eventType ?? null,
        externalEntityId: dto.externalEntityId ?? null,
        payload: dto.payload,
        status: FeedProcessingStatus.PENDING,
        processedAt: null,
        errorMessage: null,
      }),
    );

    return {
      payloadId: payload.id,
      status: payload.status,
      payload,
    };
  }

  async syncApiFootballWorldCup(syncEvents = true) {
    const baseUrl = this.configService.get<string>('EXTERNAL_FEED_BASE_URL', 'https://v3.football.api-sports.io');
    const apiKey = this.configService.get<string>('EXTERNAL_FEED_API_KEY');
    const leagueId = this.configService.get<number>('EXTERNAL_FEED_LEAGUE_ID', 1);
    const season = this.configService.get<number>('EXTERNAL_FEED_SEASON', 2026);

    if (!apiKey) {
      throw new BadRequestException('EXTERNAL_FEED_API_KEY is required to sync API-Football data.');
    }

    const fixturesResponse = await fetch(`${baseUrl}/fixtures?league=${leagueId}&season=${season}`, {
      headers: {
        'x-apisports-key': apiKey,
      },
    });

    if (!fixturesResponse.ok) {
      throw new BadRequestException(`API-Football fixtures sync failed with status ${fixturesResponse.status}.`);
    }

    const fixturesPayload = await fixturesResponse.json() as {
      response?: Array<{
        fixture?: {
          id: number;
          date: string;
          venue?: { name?: string | null } | null;
          status?: { short?: string | null; elapsed?: number | null } | null;
        };
        league?: { round?: string | null } | null;
        teams?: {
          home?: { id?: number | null; name?: string | null } | null;
          away?: { id?: number | null; name?: string | null } | null;
        };
        goals?: { home?: number | null; away?: number | null } | null;
      }>;
    };

    const tournament = await this.tournamentService.getCurrentTournament();
    const apiFootballIds = new Set<number>();
    const updatedFixtureIds = new Set<string>();
    const eventSyncFixtureIds = new Set<string>();

    for (const item of fixturesPayload.response ?? []) {
      const externalFixtureId = item.fixture?.id;
      const homeExternalTeamId = item.teams?.home?.id;
      const awayExternalTeamId = item.teams?.away?.id;
      const homeProviderTeamName = item.teams?.home?.name ?? null;
      const awayProviderTeamName = item.teams?.away?.name ?? null;

      if (!externalFixtureId || !homeExternalTeamId || !awayExternalTeamId) {
        continue;
      }

      apiFootballIds.add(externalFixtureId);

      const [homeTeam, awayTeam] = await Promise.all([
        this.resolveProviderTeam({
          tournamentId: tournament.id,
          externalTeamId: homeExternalTeamId,
          providerName: homeProviderTeamName,
        }),
        this.resolveProviderTeam({
          tournamentId: tournament.id,
          externalTeamId: awayExternalTeamId,
          providerName: awayProviderTeamName,
        }),
      ]);

      if (!homeTeam || !awayTeam) {
        continue;
      }

      const kickoffAt = item.fixture?.date ? new Date(item.fixture.date) : null;
      if (!kickoffAt) {
        continue;
      }

      const parsedRound = this.parseProviderRound({
        round: item.league?.round,
        fallbackPhase: tournament.currentPhase,
        fallbackMatchdayNumber: tournament.currentMatchdayNumber,
      });
      const matchday = await this.resolveOrCreateMatchday({
        tournament,
        phase: parsedRound.phase,
        number: parsedRound.matchdayNumber,
        kickoffAt,
      });
      const group = this.resolveFixtureGroup({
        parsedPhase: parsedRound.phase,
        homeTeam,
        awayTeam,
      });

      let fixture = await this.fixturesRepository.findOne({
        where: {
          tournament: { id: tournament.id },
          externalProviderId: String(externalFixtureId),
        },
        relations: {
          tournament: true,
          homeTeam: true,
          awayTeam: true,
          matchday: true,
          group: true,
        },
      });

      if (!fixture) {
        fixture = await this.fixturesRepository.findOne({
          where: {
            tournament: { id: tournament.id },
            homeTeam: { id: homeTeam.id },
            awayTeam: { id: awayTeam.id },
          },
          relations: {
            tournament: true,
            homeTeam: true,
            awayTeam: true,
            matchday: true,
            group: true,
          },
        });
      }

      if (!fixture) {
        fixture = this.fixturesRepository.create({
          tournament,
          matchday,
          group,
          phase: parsedRound.phase,
          status: FixtureStatus.SCHEDULED,
          kickoffAt,
          venue: item.fixture?.venue?.name ?? `${homeTeam.shortName} vs ${awayTeam.shortName}`,
          homeScore: null,
          awayScore: null,
          currentMinute: null,
          externalProviderId: String(externalFixtureId),
          homeTeam,
          awayTeam,
        });
      }

      fixture.matchday = matchday;
      fixture.group = group;
      fixture.phase = parsedRound.phase;
      fixture.kickoffAt = kickoffAt;
      fixture.venue = item.fixture?.venue?.name ?? fixture.venue;
      fixture.homeScore = item.goals?.home ?? fixture.homeScore;
      fixture.awayScore = item.goals?.away ?? fixture.awayScore;
      fixture.currentMinute = item.fixture?.status?.elapsed ?? null;
      fixture.status = this.mapApiFootballFixtureStatus(item.fixture?.status?.short);
      fixture.externalProviderId = String(externalFixtureId);
      fixture = await this.fixturesRepository.save(fixture);
      updatedFixtureIds.add(fixture.id);

      if ([FixtureStatus.LIVE, FixtureStatus.HALF_TIME, FixtureStatus.FULL_TIME].includes(fixture.status)) {
        eventSyncFixtureIds.add(fixture.id);
      }
    }

    const liveFixtures = await this.fixturesRepository.find({
      where: [
        { status: FixtureStatus.LIVE },
        { status: FixtureStatus.HALF_TIME },
      ],
      relations: { matchday: true },
      order: { kickoffAt: 'ASC' },
    });

    const eventSync = syncEvents
      ? await this.syncTrackedFixtureEvents(Array.from(eventSyncFixtureIds))
      : null;

    // Broadcast live updates via WebSocket
    if (liveFixtures.length > 0) {
      this.realtimeEventsService.emitLiveMatchTick({
        liveCount: liveFixtures.length,
        fixtures: liveFixtures.map((f) => ({
          fixtureId: f.id,
          status: f.status,
          homeScore: f.homeScore,
          awayScore: f.awayScore,
          currentMinute: f.currentMinute,
        })),
      });
    }

    if (updatedFixtureIds.size > 0) {
      this.realtimeEventsService.emitFixtureUpdated({
        updatedFixtureIds: Array.from(updatedFixtureIds),
      });
    }

    return {
      provider: 'api-football',
      leagueId,
      season,
      updatedFixtures: updatedFixtureIds.size,
      trackedFixtures: apiFootballIds.size,
      updatedFixtureIds: Array.from(updatedFixtureIds),
      liveFixtures: liveFixtures.filter((fixture) => fixture.status === FixtureStatus.LIVE || fixture.status === FixtureStatus.HALF_TIME).map((fixture) => ({
        fixtureId: fixture.id,
        status: fixture.status,
        currentMinute: fixture.currentMinute,
      })),
      eventSync,
    };
  }

  /**
   * Sync ALL tournaments that have an external league mapping.
   * This is the main entry point for the auto-sync service.
   */
  async syncAllTournaments(syncEvents = true) {
    const tournaments = await this.tournamentsRepository.find({
      order: { createdAt: 'DESC' },
    });

    const results: Array<Record<string, unknown>> = [];
    let totalUpdated = 0;

    for (const tournament of tournaments) {
      if (tournament.competitionKey === 'egyptian-premier-league-current') {
        results.push({
          tournamentId: tournament.id,
          name: tournament.name,
          skipped: true,
          reason: 'Egyptian Premier League is managed exclusively by scraping sync.',
        });
        continue;
      }

      const mapping = this.resolveApiFootballMapping(tournament);
      if (!mapping) continue;

      try {
        const result = await this.syncApiFootballForTournament(
          tournament,
          mapping.leagueId,
          mapping.season,
          undefined,
          undefined,
          syncEvents,
        );
        totalUpdated += result.updatedFixtures;
        results.push({
          tournamentId: tournament.id,
          name: tournament.name,
          leagueId: mapping.leagueId,
          ...result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected sync failure.';
        this.logger.error(`syncAllTournaments: ${tournament.name} failed: ${message}`);
        results.push({
          tournamentId: tournament.id,
          name: tournament.name,
          error: message,
        });
      }
    }

    return { tournaments: results, totalUpdated };
  }

  async syncTournamentById(tournamentId: string, syncEvents = true) {
    const existingSync = this.inFlightTournamentSyncs.get(tournamentId);
    if (existingSync) {
      return existingSync;
    }

    const syncPromise = this.syncTournamentByIdInternal(tournamentId, syncEvents).finally(() => {
      this.inFlightTournamentSyncs.delete(tournamentId);
    });

    this.inFlightTournamentSyncs.set(tournamentId, syncPromise);
    return syncPromise;
  }

  private async syncTournamentByIdInternal(tournamentId: string, syncEvents = true) {
    const tournament = await this.tournamentsRepository.findOne({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new NotFoundException(`Tournament ${tournamentId} not found.`);
    }

    if (tournament.competitionKey === 'egyptian-premier-league-current') {
      return {
        tournamentId: tournament.id,
        name: tournament.name,
        skipped: true,
        reason: 'Egyptian Premier League is managed exclusively by scraping sync.',
      };
    }

    const mapping = this.resolveApiFootballMapping(tournament);
    if (!mapping) {
      return {
        tournamentId: tournament.id,
        name: tournament.name,
        skipped: true,
        reason: 'No external league mapping configured for this tournament.',
      };
    }

    let effectiveMapping = mapping;

    if (tournament.format === 'league') {
      effectiveMapping = await this.resolveLeagueMappingWithSeasonFallback(tournament, mapping);
    }

    let result: Awaited<ReturnType<FeedService['syncApiFootballForTournament']>>;
    try {
      result = await this.syncApiFootballForTournament(
        tournament,
        effectiveMapping.leagueId,
        effectiveMapping.season,
        undefined,
        undefined,
        syncEvents,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown provider sync error.';
      this.logger.error(
        `syncTournamentById failed for tournament=${tournament.id}, league=${effectiveMapping.leagueId}, season=${effectiveMapping.season}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        tournamentId: tournament.id,
        name: tournament.name,
        leagueId: effectiveMapping.leagueId,
        season: effectiveMapping.season,
        failed: true,
        reason: message,
      };
    }

    if (tournament.externalLeagueId !== effectiveMapping.leagueId || tournament.externalSeason !== effectiveMapping.season) {
      tournament.externalLeagueId = effectiveMapping.leagueId;
      tournament.externalSeason = effectiveMapping.season;
      await this.tournamentsRepository.save(tournament);
    }

    return {
      tournamentId: tournament.id,
      name: tournament.name,
      leagueId: effectiveMapping.leagueId,
      season: effectiveMapping.season,
      ...result,
    };
  }

  private async resolveLeagueMappingWithSeasonFallback(
    tournament: TournamentEntity,
    mapping: { leagueId: number; season: number },
  ): Promise<{ leagueId: number; season: number }> {
    const nowYear = new Date().getUTCFullYear();
    const candidateSeasons = Array.from(new Set([
      mapping.season,
      nowYear,
      nowYear - 1,
      nowYear + 1,
    ]));

    let bestSeason = mapping.season;
    let bestCount = -1;

    for (const season of candidateSeasons) {
      try {
        const { fixtures } = await this.providerRouter.fetchFixtures(mapping.leagueId, season);
        if (fixtures.length > bestCount) {
          bestCount = fixtures.length;
          bestSeason = season;
        }
      } catch {
        continue;
      }
    }

    return { leagueId: mapping.leagueId, season: bestSeason };
  }

  /**
   * Sync a specific tournament via the ProviderRouter (with auto-fallback).
   */
  async syncApiFootballForTournament(
    tournament: TournamentEntity,
    leagueId: number,
    season: number,
    _baseUrl?: string,
    _apiKey?: string,
    syncEvents = true,
  ) {
    const { provider: usedProvider, fixtures: providerFixtures } =
      await this.providerRouter.fetchFixtures(leagueId, season);

    this.logger.debug(`syncApiFootballForTournament: ${tournament.name} via ${usedProvider}, ${providerFixtures.length} fixtures`);

    const updatedFixtureIds = new Set<string>();
    const eventSyncFixtureIds = new Set<string>();
    const liveStatFixtureIds = new Set<string>();

    for (const pf of providerFixtures) {
      const [homeTeam, awayTeam] = await Promise.all([
        this.resolveProviderTeam({ tournamentId: tournament.id, externalTeamId: pf.homeTeam.externalId, providerName: pf.homeTeam.name }),
        this.resolveProviderTeam({ tournamentId: tournament.id, externalTeamId: pf.awayTeam.externalId, providerName: pf.awayTeam.name }),
      ]);

      if (!homeTeam || !awayTeam) continue;

      const kickoffAt = pf.date ? new Date(pf.date) : null;
      if (!kickoffAt) continue;

      const isLeagueFormat = tournament.format === 'league';
      const parsedRound = isLeagueFormat
        ? this.parseLeagueRound(pf.round, tournament.currentMatchdayNumber)
        : {
            ...this.parseProviderRound({
              round: pf.round,
              fallbackPhase: tournament.currentPhase,
              fallbackMatchdayNumber: tournament.currentMatchdayNumber,
            }),
            groupCode: null,
            groupLabel: null,
          };
      const matchday = await this.resolveOrCreateMatchday({ tournament, phase: parsedRound.phase, number: parsedRound.matchdayNumber, kickoffAt });
      const group = isLeagueFormat
        ? await this.resolveOrCreateLeagueGroup(tournament, parsedRound.groupCode, parsedRound.groupLabel)
        : this.resolveFixtureGroup({ parsedPhase: parsedRound.phase, homeTeam, awayTeam });

      let fixture = await this.fixturesRepository.findOne({
        where: { tournament: { id: tournament.id }, externalProviderId: pf.externalId },
        relations: { tournament: true, homeTeam: true, awayTeam: true, matchday: true, group: true },
      });

      if (!fixture) {
        fixture = await this.fixturesRepository.findOne({
          where: { tournament: { id: tournament.id }, homeTeam: { id: homeTeam.id }, awayTeam: { id: awayTeam.id } },
          relations: { tournament: true, homeTeam: true, awayTeam: true, matchday: true, group: true },
        });
      }

      const previousStatus = fixture?.status;
      const previousHomeScore = fixture?.homeScore;
      const previousAwayScore = fixture?.awayScore;

      if (!fixture) {
        fixture = this.fixturesRepository.create({
          tournament, matchday, group, phase: parsedRound.phase,
          status: FixtureStatus.SCHEDULED, kickoffAt,
          venue: pf.venue ?? `${homeTeam.shortName} vs ${awayTeam.shortName}`,
          homeScore: null, awayScore: null, currentMinute: null,
          externalProviderId: pf.externalId,
          homeTeam, awayTeam,
          statistics: null, lineups: null,
        });
      }

      fixture.matchday = matchday;
      fixture.group = group;
      fixture.phase = parsedRound.phase;
      fixture.kickoffAt = kickoffAt;
      fixture.venue = pf.venue ?? fixture.venue;
      const providerHomeScore = pf.goalsHome ?? fixture.homeScore;
      const providerAwayScore = pf.goalsAway ?? fixture.awayScore;
      fixture.homeScore = providerHomeScore;
      fixture.awayScore = providerAwayScore;
      fixture.currentMinute = pf.elapsed ?? null;
      fixture.status = this.mapApiFootballFixtureStatus(pf.statusShort);
      fixture.externalProviderId = pf.externalId;
      fixture = await this.fixturesRepository.save(fixture);
      updatedFixtureIds.add(fixture.id);

      if ([FixtureStatus.LIVE, FixtureStatus.HALF_TIME, FixtureStatus.FULL_TIME].includes(fixture.status)) {
        eventSyncFixtureIds.add(fixture.id);
      }

      if ([FixtureStatus.LIVE, FixtureStatus.HALF_TIME].includes(fixture.status)) {
        liveStatFixtureIds.add(fixture.id);
      }

      if (previousHomeScore !== fixture.homeScore || previousAwayScore !== fixture.awayScore || previousStatus !== fixture.status) {
        this.realtimeEventsService.emitFixtureUpdated({
          fixtureId: fixture.id,
          tournamentId: tournament.id,
          status: fixture.status,
          homeScore: fixture.homeScore,
          awayScore: fixture.awayScore,
          currentMinute: fixture.currentMinute,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
        });
      }
    }

    const eventSync = syncEvents
      ? await this.syncTrackedFixtureEvents(Array.from(eventSyncFixtureIds))
      : null;

    await this.syncFixtureStatisticsAndLineupsViaRouter(Array.from(liveStatFixtureIds));

    return {
      provider: usedProvider,
      updatedFixtures: updatedFixtureIds.size,
      updatedFixtureIds: Array.from(updatedFixtureIds),
      eventSync,
    };
  }

  /**
   * Parse league round strings like "Regular Season - 15" into phase + matchday number.
   */
  private parseLeagueRound(round?: string | null, fallbackMatchday = 1): {
    phase: TournamentPhase;
    matchdayNumber: number;
    groupCode: string | null;
    groupLabel: string | null;
  } {
    const normalized = String(round ?? '').toLowerCase();
    const matchdayMatch = normalized.match(/(?:regular\s*season\s*-?\s*|championship\s*round\s*-?\s*|relegation\s*round\s*-?\s*|round\s*|matchday\s*|week\s*)(\d+)/i);

    const containsChampionship = normalized.includes('championship');
    const containsRelegation = normalized.includes('relegation');

    const groupCode = containsChampionship ? 'TOP' : containsRelegation ? 'REL' : null;
    const groupLabel = containsChampionship
      ? 'Championship Group'
      : containsRelegation
        ? 'Relegation Group'
        : null;

    if (matchdayMatch) {
      return {
        phase: TournamentPhase.REGULAR_SEASON,
        matchdayNumber: Number(matchdayMatch[1]),
        groupCode,
        groupLabel,
      };
    }

    return {
      phase: TournamentPhase.REGULAR_SEASON,
      matchdayNumber: fallbackMatchday,
      groupCode,
      groupLabel,
    };
  }

  private async resolveOrCreateLeagueGroup(
    tournament: TournamentEntity,
    groupCode: string | null,
    groupLabel: string | null,
  ): Promise<GroupEntity | null> {
    if (!groupCode || !groupLabel) {
      return null;
    }

    let group = await this.groupsRepository.findOne({
      where: {
        tournament: { id: tournament.id },
        code: groupCode,
      },
      relations: { tournament: true },
    });

    if (!group) {
      group = this.groupsRepository.create({
        tournament,
        code: groupCode,
        label: groupLabel,
        displayOrder: groupCode === 'TOP' ? 1 : 2,
      });
    } else {
      group.label = groupLabel;
      if (!group.displayOrder || group.displayOrder <= 0) {
        group.displayOrder = groupCode === 'TOP' ? 1 : 2;
      }
    }

    return this.groupsRepository.save(group);
  }

  /**
   * Resolve the API-Football league mapping for a tournament.
   */
  private resolveApiFootballMapping(tournament: TournamentEntity): { leagueId: number; season: number } | null {
    // First check explicit columns on the tournament
    if (tournament.externalLeagueId && tournament.externalSeason) {
      return { leagueId: tournament.externalLeagueId, season: tournament.externalSeason };
    }

    // Fallback to competition key mapping
    const mapping = resolveLeagueId(tournament.competitionKey);
    if (mapping) return mapping;

    // Fallback to env config (backwards compatible)
    const envLeagueId = this.configService.get<number>('EXTERNAL_FEED_LEAGUE_ID');
    const envSeason = this.configService.get<number>('EXTERNAL_FEED_SEASON');
    if (envLeagueId && envSeason) return { leagueId: envLeagueId, season: envSeason };

    return null;
  }

  /**
   * Fetch and store match statistics and lineups for live fixtures via ProviderRouter.
   */
  async syncFixtureStatisticsAndLineupsViaRouter(fixtureIds: string[]) {
    if (fixtureIds.length === 0) return;

    const fixtures = await this.fixturesRepository.find({
      where: fixtureIds.map((id) => ({ id })),
    });

    for (const fixture of fixtures) {
      if (!fixture.externalProviderId) continue;

      try {
        const { detail } = await this.providerRouter.fetchFixtureDetail(fixture.externalProviderId);
        if (!detail) continue;

        if (detail.statistics) {
          const normalizedStats = this.normalizeProviderStatistics(detail.statistics);
          if (normalizedStats) fixture.statistics = normalizedStats;
        }

        if (detail.lineups) {
          const normalizedLineups = this.normalizeProviderLineups(detail.lineups);
          if (normalizedLineups) fixture.lineups = normalizedLineups;
        }

        await this.fixturesRepository.save(fixture);
      } catch (error) {
        this.logger.warn(`Failed to fetch stats/lineups for fixture ${fixture.id}: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
  }

  private normalizeMatchStatistics(
    response: Array<{
      team?: { id?: number; name?: string };
      statistics?: Array<{ type?: string; value?: number | string | null }>;
    }>,
  ): Record<string, unknown> | null {
    if (response.length < 2) return null;

    const homeRaw = response[0];
    const awayRaw = response[1];

    const extractStat = (stats: typeof homeRaw.statistics, key: string) => {
      const entry = stats?.find((s) => s.type === key);
      if (!entry) return null;
      const val = entry.value;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const numeric = parseFloat(val.replace('%', ''));
        return Number.isFinite(numeric) ? numeric : null;
      }
      return null;
    };

    const statKeys = [
      'Ball Possession', 'Total Shots', 'Shots on Goal', 'Shots off Goal',
      'Corner Kicks', 'Offsides', 'Fouls', 'Yellow Cards', 'Red Cards',
      'Total passes', 'Passes accurate', 'Passes %',
      'expected_goals', 'Goalkeeper Saves',
    ];

    const home: Record<string, number | null> = {};
    const away: Record<string, number | null> = {};

    for (const key of statKeys) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      home[normalizedKey] = extractStat(homeRaw.statistics, key);
      away[normalizedKey] = extractStat(awayRaw.statistics, key);
    }

    return {
      home: { teamId: homeRaw.team?.id, teamName: homeRaw.team?.name, ...home },
      away: { teamId: awayRaw.team?.id, teamName: awayRaw.team?.name, ...away },
    };
  }

  private normalizeMatchLineups(
    response: Array<{
      team?: { id?: number; name?: string; colors?: Record<string, unknown> };
      formation?: string | null;
      startXI?: Array<{ player?: { id?: number; name?: string; number?: number; pos?: string } }>;
      substitutes?: Array<{ player?: { id?: number; name?: string; number?: number; pos?: string } }>;
      coach?: { id?: number; name?: string };
    }>,
  ): Record<string, unknown> | null {
    if (response.length < 2) return null;

    const mapLineup = (entry: typeof response[0]) => ({
      teamId: entry.team?.id,
      teamName: entry.team?.name,
      formation: entry.formation ?? null,
      coach: entry.coach?.name ?? null,
      startingXI: (entry.startXI ?? []).map((p) => ({
        id: p.player?.id,
        name: p.player?.name,
        number: p.player?.number,
        position: p.player?.pos,
      })),
      substitutes: (entry.substitutes ?? []).map((p) => ({
        id: p.player?.id,
        name: p.player?.name,
        number: p.player?.number,
        position: p.player?.pos,
      })),
    });

    return {
      home: mapLineup(response[0]),
      away: mapLineup(response[1]),
    };
  }

  private normalizeProviderStatistics(
    stats: [ProviderTeamStats, ProviderTeamStats],
  ): Record<string, unknown> | null {
    const extractStat = (entries: ProviderStatEntry[], key: string) => {
      const entry = entries.find((s) => s.type === key);
      if (!entry) return null;
      const val = entry.value;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const numeric = parseFloat(val.replace('%', ''));
        return Number.isFinite(numeric) ? numeric : null;
      }
      return null;
    };

    const statKeys = [
      'Ball Possession', 'Total Shots', 'Shots on Goal', 'Shots off Goal',
      'Corner Kicks', 'Offsides', 'Fouls', 'Yellow Cards', 'Red Cards',
      'Total passes', 'Passes accurate', 'Passes %',
      'expected_goals', 'Goalkeeper Saves',
    ];

    const home: Record<string, number | null> = {};
    const away: Record<string, number | null> = {};

    for (const key of statKeys) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      home[normalizedKey] = extractStat(stats[0].statistics, key);
      away[normalizedKey] = extractStat(stats[1].statistics, key);
    }

    return {
      home: { teamId: stats[0].teamExternalId, teamName: stats[0].teamName, ...home },
      away: { teamId: stats[1].teamExternalId, teamName: stats[1].teamName, ...away },
    };
  }

  private normalizeProviderLineups(
    lineups: [ProviderTeamLineup, ProviderTeamLineup],
  ): Record<string, unknown> | null {
    const mapLineup = (entry: ProviderTeamLineup) => ({
      teamId: entry.teamExternalId,
      teamName: entry.teamName,
      formation: entry.formation,
      coach: entry.coachName,
      startingXI: entry.startingXI.map((p) => ({
        id: p.id,
        name: p.name,
        number: p.number,
        position: p.pos,
      })),
      substitutes: entry.substitutes.map((p) => ({
        id: p.id,
        name: p.name,
        number: p.number,
        position: p.pos,
      })),
    });

    return {
      home: mapLineup(lineups[0]),
      away: mapLineup(lineups[1]),
    };
  }

  private parseProviderRound(input: {
    round?: string | null;
    fallbackPhase: TournamentPhase;
    fallbackMatchdayNumber: number;
  }) {
    const normalizedRound = String(input.round ?? '').toLowerCase();
    const groupStageMatch = normalizedRound.match(/group\s*stage\s*-\s*([123])/i)
      ?? normalizedRound.match(/group\s*([123])/i);

    if (groupStageMatch) {
      const matchdayNumber = Number(groupStageMatch[1]);
      return {
        phase: this.mapGroupStagePhase(matchdayNumber),
        matchdayNumber,
      };
    }

    if (normalizedRound.includes('round of 32')) {
      return { phase: TournamentPhase.ROUND_OF_32, matchdayNumber: 4 };
    }

    if (normalizedRound.includes('round of 16')) {
      return { phase: TournamentPhase.ROUND_OF_16, matchdayNumber: 5 };
    }

    if (normalizedRound.includes('quarter')) {
      return { phase: TournamentPhase.QUARTER_FINALS, matchdayNumber: 6 };
    }

    if (normalizedRound.includes('semi')) {
      return { phase: TournamentPhase.SEMI_FINALS, matchdayNumber: 7 };
    }

    if (normalizedRound.includes('third')) {
      return { phase: TournamentPhase.THIRD_PLACE, matchdayNumber: 8 };
    }

    if (normalizedRound.includes('final')) {
      return { phase: TournamentPhase.FINAL, matchdayNumber: 9 };
    }

    return {
      phase: input.fallbackPhase,
      matchdayNumber: input.fallbackMatchdayNumber,
    };
  }

  private mapGroupStagePhase(matchdayNumber: number) {
    switch (matchdayNumber) {
      case 2:
        return TournamentPhase.GROUP_STAGE_MD2;
      case 3:
        return TournamentPhase.GROUP_STAGE_MD3;
      case 1:
      default:
        return TournamentPhase.GROUP_STAGE_MD1;
    }
  }

  private resolveFixtureGroup(input: {
    parsedPhase: TournamentPhase;
    homeTeam: TeamEntity;
    awayTeam: TeamEntity;
  }) {
    if (!input.parsedPhase.startsWith('group_stage')) {
      return null;
    }

    if (!input.homeTeam.group?.id || input.homeTeam.group.id !== input.awayTeam.group?.id) {
      return null;
    }

    return input.homeTeam.group;
  }

  private async resolveOrCreateMatchday(input: {
    tournament: Awaited<ReturnType<TournamentService['getCurrentTournament']>>;
    phase: TournamentPhase;
    number: number;
    kickoffAt: Date;
  }) {
    let matchday = await this.matchdaysRepository.findOne({
      where: {
        tournament: { id: input.tournament.id },
        number: input.number,
      },
      relations: { tournament: true },
    });

    const candidateDeadlineAt = new Date(input.kickoffAt.getTime() - 60 * 60 * 1000);
    const candidateOpensAt = new Date(candidateDeadlineAt.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (!matchday) {
      matchday = this.matchdaysRepository.create({
        tournament: input.tournament,
        number: input.number,
        phase: input.phase,
        status: MatchdayStatus.OPEN,
        opensAt: candidateOpensAt,
        deadlineAt: candidateDeadlineAt,
        locksAt: candidateDeadlineAt,
      });

      return this.matchdaysRepository.save(matchday);
    }

    matchday.phase = input.phase;
    matchday.opensAt = !matchday.opensAt || matchday.opensAt > candidateOpensAt ? candidateOpensAt : matchday.opensAt;
    matchday.deadlineAt = matchday.deadlineAt > candidateDeadlineAt ? candidateDeadlineAt : matchday.deadlineAt;
    matchday.locksAt = !matchday.locksAt || matchday.locksAt > candidateDeadlineAt ? candidateDeadlineAt : matchday.locksAt;

    return this.matchdaysRepository.save(matchday);
  }

  async syncTrackedFixtureEvents(fixtureIds?: string[]) {
    if (!fixtureIds || fixtureIds.length === 0) {
      return {
        processedFixtures: 0,
        successfulFixtures: 0,
        failedFixtures: 0,
        results: [],
      };
    }

    const fixtures = await this.fixturesRepository.find({
      where: fixtureIds.map((id) => ({ id })),
      relations: { tournament: true, homeTeam: true, awayTeam: true, matchday: true },
      order: { kickoffAt: 'ASC' },
    });

    const results: Array<Record<string, unknown>> = [];

    for (const fixture of fixtures) {
      if (!fixture.externalProviderId) {
        continue;
      }

      try {
        results.push(await this.ingestApiFootballFixtureEvents(fixture.id));
      } catch (error) {
        results.push({
          fixtureId: fixture.id,
          externalFixtureId: fixture.externalProviderId,
          error: error instanceof Error ? error.message : 'Unexpected fixture event sync failure.',
        });
      }
    }

    const failedFixtures = results.filter((result) => 'error' in result).length;

    return {
      processedFixtures: results.length,
      successfulFixtures: results.length - failedFixtures,
      failedFixtures,
      results,
    };
  }

  async ingestApiFootballFixtureEvents(fixtureId: string) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: { tournament: true, homeTeam: true, awayTeam: true, matchday: true },
    });

    if (!fixture?.externalProviderId) {
      throw new NotFoundException('Fixture is not linked to an external provider id yet.');
    }

    const { events: providerEvents } = await this.providerRouter.fetchFixtureEvents(fixture.externalProviderId);

    const processedPayloads: Array<{ payloadId: string; processed: unknown }> = [];
    const processedEventKeys = new Set<string>();

    for (const event of providerEvents) {
      const normalizedEvents = await this.normalizeProviderEvent(fixture, event);

      for (const normalized of normalizedEvents) {
        const dedupeKey = `${fixture.id}:${normalized.playerId}:${normalized.type}:${normalized.minute}`;
        if (processedEventKeys.has(dedupeKey)) {
          continue;
        }

        const existingEvent = await this.scoringService.getExistingFixtureEvent(
          fixture.id,
          normalized.playerId,
          normalized.type,
          normalized.minute,
        );

        if (existingEvent) {
          processedEventKeys.add(dedupeKey);
          continue;
        }

        const payload = await this.ingestPayload({
          provider: 'provider-router',
          entityType: 'fixture_event',
          eventType: normalized.type,
          externalEntityId: fixture.id,
          payload: normalized,
        });

        processedPayloads.push({
          payloadId: payload.payloadId,
          processed: await this.processPayload(payload.payloadId),
        });
        processedEventKeys.add(dedupeKey);
      }
    }

    if (processedPayloads.length > 0) {
      const correctedFixture = await this.scoringService.applyFixtureCorrection({
        fixtureId: fixture.id,
        homeScore: null,
        awayScore: null,
        currentMinute: fixture.currentMinute,
      })

      fixture.homeScore = correctedFixture.homeScore
      fixture.awayScore = correctedFixture.awayScore
    }

    return {
      fixtureId: fixture.id,
      externalFixtureId: fixture.externalProviderId,
      processedEvents: processedPayloads.length,
      results: processedPayloads,
    };
  }

  async processPayload(payloadId: string) {
    const payload = await this.rawFeedPayloadsRepository.findOne({
      where: { id: payloadId },
    });

    if (!payload) {
      throw new NotFoundException('Feed payload not found.');
    }

    try {
      const normalizedEvent = this.normalizeFixtureEventPayload(payload);
      const processingResult = await this.scoringService.scoreFixtureEvent(normalizedEvent);

      payload.status = FeedProcessingStatus.PROCESSED;
      payload.processedAt = new Date();
      payload.errorMessage = null;

      await this.rawFeedPayloadsRepository.save(payload);

      return {
        payload,
        processingResult,
      };
    } catch (error) {
      payload.status = FeedProcessingStatus.FAILED;
      payload.processedAt = new Date();
      payload.errorMessage =
        error instanceof Error ? error.message : 'Unexpected feed processing failure.';

      await this.rawFeedPayloadsRepository.save(payload);

      throw error;
    }
  }

  private normalizeFixtureEventPayload(payload: RawFeedPayloadEntity) {
    if (!['fixture_event', 'player_event', 'scoring_event'].includes(payload.entityType)) {
      throw new BadRequestException(`Unsupported feed entity type: ${payload.entityType}`);
    }

    const fixtureId = this.readString(payload.payload.fixtureId) ?? payload.externalEntityId;
    const playerId = this.readString(payload.payload.playerId);
    const type = this.readString(payload.payload.type) ?? payload.eventType;
    const minute = this.readNumber(payload.payload.minute);
    const points = this.readNumber(payload.payload.points);

    if (!fixtureId || !playerId || !type || minute === null || points === null) {
      throw new BadRequestException('Feed payload cannot be mapped to a scoring event.');
    }

    return {
      fixtureId,
      playerId,
      type,
      minute,
      points,
      details: this.readRecord(payload.payload.details) ?? payload.payload,
    };
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private readNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private readRecord(value: unknown) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return null;
  }

  private mapApiFootballFixtureStatus(status?: string | null) {
    switch (status) {
      case '1H':
      case '2H':
      case 'ET':
      case 'P':
      case 'BT':
      case 'LIVE':
        return FixtureStatus.LIVE;
      case 'HT':
        return FixtureStatus.HALF_TIME;
      case 'FT':
      case 'AET':
      case 'PEN':
        return FixtureStatus.FULL_TIME;
      case 'PST':
      case 'CANC':
      case 'ABD':
      case 'AWD':
      case 'WO':
        return FixtureStatus.POSTPONED;
      default:
        return FixtureStatus.SCHEDULED;
    }
  }

  private async normalizeProviderEvent(
    fixture: FixtureEntity,
    event: ProviderFixtureEvent,
  ) {
    const elapsed = event.elapsed ?? null;

    if (!elapsed) {
      return [];
    }

    const mappedType = this.mapApiFootballEventType(event.type, event.detail);
    if (!mappedType) {
      return [];
    }

    const normalizedEvents: Array<{
      fixtureId: string;
      playerId: string;
      type: string;
      minute: number;
      details: Record<string, unknown>;
      points: number;
    }> = [];

    const primaryEvent = await this.buildNormalizedFixtureEvent({
      fixture,
      playerExternalId: event.playerExternalId,
      playerName: event.playerName,
      type: mappedType,
      minute: elapsed,
      teamExternalId: event.teamExternalId,
      teamName: event.teamName,
      sourceEvent: event,
    });

    if (primaryEvent) {
      normalizedEvents.push(primaryEvent);
    }

    const isAssistableGoal = mappedType === 'goal' || mappedType === 'penalty_scored';
    if (isAssistableGoal && event.assistExternalId) {
      const assistEvent = await this.buildNormalizedFixtureEvent({
        fixture,
        playerExternalId: event.assistExternalId,
        playerName: event.assistName,
        type: 'assist',
        minute: elapsed,
        teamExternalId: event.teamExternalId,
        teamName: event.teamName,
        sourceEvent: event,
      });

      if (assistEvent) {
        normalizedEvents.push({
          ...assistEvent,
          details: {
            ...assistEvent.details,
            relatedPlayerExternalId: event.playerExternalId ?? null,
            relatedPlayerId: primaryEvent?.playerId ?? null,
          },
        });
      }
    }

    return normalizedEvents;
  }

  private async buildNormalizedFixtureEvent(input: {
    fixture: FixtureEntity;
    playerExternalId: number | null;
    playerName: string | null;
    type: string;
    minute: number;
    teamExternalId: number | null;
    teamName: string | null;
    sourceEvent: ProviderFixtureEvent;
  }) {
    if (!input.playerExternalId) {
      return null;
    }

    const player = await this.resolveProviderPlayer({
      tournamentId: input.fixture.tournament.id,
      playerExternalId: input.playerExternalId,
      playerName: input.playerName,
      teamExternalId: input.teamExternalId,
      teamName: input.teamName,
    });

    if (!player) {
      return null;
    }

    return {
      fixtureId: input.fixture.id,
      playerId: player.id,
      type: input.type,
      minute: input.minute,
      details: {
        provider: 'provider-router',
        eventType: input.sourceEvent.type,
        eventDetail: input.sourceEvent.detail,
        eventComments: input.sourceEvent.comments,
        assistExternalId: input.sourceEvent.assistExternalId ?? null,
        teamExternalId: input.sourceEvent.teamExternalId ?? null,
      },
      points: this.resolveDefaultEventPoints(input.type, player.position),
    };
  }

  private mapApiFootballEventType(type?: string | null, detail?: string | null) {
    if (type === 'Goal') {
      if (detail === 'Own Goal') {
        return 'own_goal';
      }

      if (detail === 'Missed Penalty') {
        return 'penalty_missed';
      }

      if (detail === 'Penalty') {
        return 'penalty_scored';
      }

      return 'goal';
    }

    if (type === 'Card') {
      if (detail === 'Yellow Card') {
        return 'yellow_card';
      }

      if (detail === 'Red Card' || detail === 'Second Yellow card') {
        return 'red_card';
      }
    }

    if (type === 'subst') {
      return 'substitution';
    }

    if (type === 'Var') {
      return 'var_review';
    }

    return null;
  }

  private async resolveProviderTeam(input: {
    tournamentId: string;
    externalTeamId: number;
    providerName: string | null;
  }) {
    const externalProviderId = String(input.externalTeamId);

    let team = await this.teamsRepository.findOne({
      where: {
        externalProviderId,
        tournament: { id: input.tournamentId },
      },
      relations: { tournament: true, group: true },
    });

    if (team) {
      return team;
    }

    if (!input.providerName) {
      return null;
    }

    const normalizedProviderName = this.normalizeProviderText(input.providerName);
    const teams = await this.teamsRepository.find({
      where: { tournament: { id: input.tournamentId } },
      relations: { tournament: true, group: true },
    });

    team = teams.find((candidate) => {
      const candidateNames = [candidate.name, candidate.shortName, candidate.code]
        .map((value) => this.normalizeProviderText(value))
        .filter((value) => value.length > 0);

      return candidateNames.includes(normalizedProviderName);
    }) ?? null;

    if (!team) {
      return null;
    }

    if (team.externalProviderId !== externalProviderId) {
      team.externalProviderId = externalProviderId;
      team = await this.teamsRepository.save(team);
    }

    return team;
  }

  private async resolveProviderPlayer(input: {
    tournamentId: string;
    playerExternalId: number;
    playerName: string | null;
    teamExternalId: number | null;
    teamName: string | null;
  }) {
    const externalProviderId = String(input.playerExternalId);

    let player = await this.playersRepository.findOne({
      where: { externalProviderId },
      relations: { team: true },
    });

    if (player) {
      return player;
    }

    if (!input.playerName) {
      return null;
    }

    const team = input.teamExternalId
      ? await this.resolveProviderTeam({
          tournamentId: input.tournamentId,
          externalTeamId: input.teamExternalId,
          providerName: input.teamName,
        })
      : null;

    if (!team) {
      return null;
    }

    const normalizedPlayerName = this.normalizeProviderText(input.playerName);
    const players = await this.playersRepository.find({
      where: { team: { id: team.id } },
      relations: { team: true },
    });

    player = players.find((candidate) => {
      const candidateNames = [candidate.name, candidate.shortName]
        .map((value) => this.normalizeProviderText(value))
        .filter((value) => value.length > 0);

      return candidateNames.includes(normalizedPlayerName);
    }) ?? null;

    if (!player) {
      return null;
    }

    if (player.externalProviderId !== externalProviderId) {
      player.externalProviderId = externalProviderId;
      player = await this.playersRepository.save(player);
    }

    return player;
  }

  private normalizeProviderText(value: string | null | undefined) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toLowerCase();
  }

  private resolveDefaultEventPoints(type: string, position: PlayerEntity['position']) {
    if (type === 'goal' || type === 'penalty_scored') {
      if (position === 'GK' || position === 'DEF') {
        return 6;
      }

      if (position === 'MID') {
        return 5;
      }

      return 4;
    }

    if (type === 'assist') {
      return 3;
    }

    if (type === 'own_goal') {
      return -2;
    }

    if (type === 'penalty_missed') {
      return -2;
    }

    if (type === 'yellow_card') {
      return -1;
    }

    if (type === 'red_card') {
      return -3;
    }

    return 0;
  }
}
