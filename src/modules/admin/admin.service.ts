import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FixtureStatus, TournamentPhase } from '../../common/database';
import { PlayerEntity } from '../catalog/entities/player.entity';
import { TeamEntity } from '../catalog/entities/team.entity';
import { DeadlineLockService } from '../fantasy/deadline-lock.service';
import { LockMatchdayDto } from '../fantasy/dto/lock-matchday.dto';
import { MatchdayLockEntity } from '../fantasy/entities/matchday-lock.entity';
import { FantasyPickEntity } from '../fantasy/entities/fantasy-pick.entity';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { TransferEntity } from '../fantasy/entities/transfer.entity';
import { CreateFixtureAdminDto } from './dto/create-fixture-admin.dto';
import { CreateFixtureEventAdminDto } from './dto/create-fixture-event-admin.dto';
import { CreateMatchdayAdminDto } from './dto/create-matchday-admin.dto';
import { MoreScreenSyncDto } from './dto/more-screen-sync.dto';
import { UpsertScoringRulesDto } from '../scoring/dto/upsert-scoring-rules.dto';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { LeaderboardEntryEntity } from '../leaderboards/entities/leaderboard-entry.entity';
import { LeagueMembershipEntity, LeagueMembershipRole } from '../leagues/entities/league-membership.entity';
import { LeagueEntity } from '../leagues/entities/league.entity';
import { LeaguesService } from '../leagues/leagues.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEntity } from '../notifications/entities/notification.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { PlayerScoreEventEntity } from '../scoring/entities/player-score-event.entity';
import { PlayerScoreLogEntity } from '../scoring/entities/player-score-log.entity';
import { ScoringService } from '../scoring/scoring.service';
import { FixtureEntity } from '../tournament/entities/fixture.entity';
import { GroupEntity } from '../tournament/entities/group.entity';
import { MatchdayEntity, MatchdayStatus } from '../tournament/entities/matchday.entity';
import { TournamentEntity, TournamentStatus } from '../tournament/entities/tournament.entity';
import { UserEntity } from '../users/entities/user.entity';
import { CreateFixtureCorrectionDto } from './dto/create-fixture-correction.dto';
import { CreateNotificationAdminDto } from './dto/create-notification-admin.dto';
import { CreateManualScoringAdjustmentDto } from './dto/create-manual-scoring-adjustment.dto';
import { AdminNotificationActionDto } from './dto/admin-notification-action.dto';
import { AuditLogAdminQueryDto } from './dto/audit-log-admin-query.dto';
import { DeleteFixtureAdminDto } from './dto/delete-fixture-admin.dto';
import { DeleteAllFixtureEventsAdminDto } from './dto/delete-all-fixture-events-admin.dto';
import { DeleteFixtureEventAdminDto } from './dto/delete-fixture-event-admin.dto';
import { DeleteMatchdayAdminDto } from './dto/delete-matchday-admin.dto';
import { LeagueAdminQueryDto } from './dto/league-admin-query.dto';
import { RecomputeScoringAdminDto } from './dto/recompute-scoring-admin.dto';
import { NotificationAdminQueryDto } from './dto/notification-admin-query.dto';
import { CompletePostDeadlineUpdateDto } from './dto/complete-post-deadline-update.dto';
import { ScoringLogQueryDto } from './dto/scoring-log-query.dto';
import { ScoringRunQueryDto } from './dto/scoring-run-query.dto';
import { UpdateFixtureEventAdminDto } from './dto/update-fixture-event-admin.dto';
import { UpdateFixtureAdminDto } from './dto/update-fixture-admin.dto';
import { UpdateLeagueAdminDto } from './dto/update-league-admin.dto';
import { UpdateLeagueMembershipAdminDto } from './dto/update-league-membership-admin.dto';
import { UpdateMatchdayAdminDto } from './dto/update-matchday-admin.dto';
import { UpdateTournamentOpsDto } from './dto/update-tournament-ops.dto';
import { UnlockMatchdayAdminDto } from './dto/unlock-matchday-admin.dto';
import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';
import { FixtureCorrectionEntity } from './entities/fixture-correction.entity';
import { ManualScoringAdjustmentEntity } from './entities/manual-scoring-adjustment.entity';
import { ChipActivationEntity } from '../fantasy/entities/chip-activation.entity';

const ADMIN_DASHBOARD_COMPETITION_KEY = 'world-cup-2026';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(AdminAuditLogEntity)
    private readonly adminAuditLogsRepository: Repository<AdminAuditLogEntity>,
    @InjectRepository(ManualScoringAdjustmentEntity)
    private readonly manualScoringAdjustmentsRepository: Repository<ManualScoringAdjustmentEntity>,
    @InjectRepository(FixtureCorrectionEntity)
    private readonly fixtureCorrectionsRepository: Repository<FixtureCorrectionEntity>,
    @InjectRepository(TournamentEntity)
    private readonly tournamentsRepository: Repository<TournamentEntity>,
    @InjectRepository(MatchdayEntity)
    private readonly matchdaysRepository: Repository<MatchdayEntity>,
    @InjectRepository(FixtureEntity)
    private readonly fixturesRepository: Repository<FixtureEntity>,
    @InjectRepository(GroupEntity)
    private readonly groupsRepository: Repository<GroupEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamsRepository: Repository<TeamEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playersRepository: Repository<PlayerEntity>,
    @InjectRepository(TransferEntity)
    private readonly transfersRepository: Repository<TransferEntity>,
    @InjectRepository(PlayerScoreEventEntity)
    private readonly playerScoreEventsRepository: Repository<PlayerScoreEventEntity>,
    @InjectRepository(PlayerScoreLogEntity)
    private readonly playerScoreLogsRepository: Repository<PlayerScoreLogEntity>,
    @InjectRepository(LeagueEntity)
    private readonly leaguesRepository: Repository<LeagueEntity>,
    @InjectRepository(LeagueMembershipEntity)
    private readonly leagueMembershipsRepository: Repository<LeagueMembershipEntity>,
    @InjectRepository(LeaderboardEntryEntity)
    private readonly leaderboardEntriesRepository: Repository<LeaderboardEntryEntity>,
    @InjectRepository(FantasyTeamEntity)
    private readonly fantasyTeamsRepository: Repository<FantasyTeamEntity>,
    @InjectRepository(FantasyPickEntity)
    private readonly fantasyPicksRepository: Repository<FantasyPickEntity>,
    @InjectRepository(ChipActivationEntity)
    private readonly chipActivationsRepository: Repository<ChipActivationEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepository: Repository<NotificationEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(MatchdayLockEntity)
    private readonly matchdayLocksRepository: Repository<MatchdayLockEntity>,
    private readonly scoringService: ScoringService,
    private readonly leaguesService: LeaguesService,
    private readonly leaderboardsService: LeaderboardsService,
    private readonly deadlineLockService: DeadlineLockService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeEventsService: RealtimeEventsService,
  ) {}

  getStatus() {
    return {
      module: 'admin',
      status: 'recompute-ready',
      capabilities: ['pricing', 'overrides', 'recompute', 'fixture-corrections', 'scoring-rules'],
      endpoints: [
        'POST /api/admin/recompute/leaderboards',
        'POST /api/admin/recompute/fixtures/:fixtureId',
        'GET /api/admin/scoring/rules',
        'PUT /api/admin/scoring/rules',
        'GET /api/admin/deadlines/status',
        'POST /api/admin/deadlines/lock',
        'POST /api/admin/scoring/manual-adjustments',
        'POST /api/admin/fixtures/corrections',
        'GET /api/admin/audit-logs',
        'GET /api/admin/scoring/overview',
        'GET /api/admin/scoring/logs',
        'GET /api/admin/scoring/runs',
        'POST /api/admin/scoring/recompute',
        'GET /api/admin/notifications/overview',
        'GET /api/admin/notifications',
        'POST /api/admin/notifications',
        'POST /api/admin/notifications/:notificationId/resend',
        'PATCH /api/admin/notifications/:notificationId/suppress',
        'GET /api/admin/audit/overview',
        'GET /api/admin/audit/logs',
        'GET /api/admin/leagues/overview',
        'GET /api/admin/leagues/:leagueId/leaderboard',
        'PATCH /api/admin/leagues/:leagueId',
        'PATCH /api/admin/leagues/memberships/:membershipId',
        'POST /api/admin/leagues/:leagueId/recompute',
        'GET /api/admin/fixtures/:fixtureId/events',
        'POST /api/admin/fixtures/:fixtureId/events',
        'POST /api/admin/fixtures/events/:eventId/delete',
        'GET /api/admin/ops/overview',
        'POST /api/admin/ops/matchdays',
        'PATCH /api/admin/ops/tournament',
        'PATCH /api/admin/ops/matchdays/:matchdayId',
        'POST /api/admin/ops/fixtures',
        'PATCH /api/admin/ops/fixtures/:fixtureId',
        'POST /api/admin/deadlines/unlock',
      ],
    };
  }

  async getNotificationsOverview() {
    const [recentNotifications, unreadCount, suppressedCount] = await Promise.all([
      this.notificationsRepository.find({
        relations: { user: { profile: true } },
        order: { createdAt: 'DESC' },
        take: 30,
      }),
      this.notificationsRepository
        .createQueryBuilder('notification')
        .where('notification.readAt IS NULL')
        .getCount(),
      this.notificationsRepository.count({ where: { type: 'suppressed' } }),
    ]);

    const readNotifications = recentNotifications.filter((notification) => notification.readAt !== null).length;

    return {
      recentNotifications,
      summary: {
        totalVisible: recentNotifications.length,
        unread: unreadCount,
        read: readNotifications,
        suppressed: suppressedCount,
      },
    };
  }

  private async getLatestTournamentOrThrow() {
    const tournaments = await this.tournamentsRepository.find({
      where: { competitionKey: ADMIN_DASHBOARD_COMPETITION_KEY },
      order: { year: 'DESC', createdAt: 'DESC' },
      take: 1,
    });

    const tournament = tournaments[0] ?? null;
    if (!tournament) {
      throw new NotFoundException('World Cup tournament not found.');
    }

    return tournament;
  }

  async getNotificationsAdmin(query: NotificationAdminQueryDto) {
    const queryBuilder = this.notificationsRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .orderBy('notification.createdAt', 'DESC')
      .take(120);

    if (query.type) {
      queryBuilder.andWhere('notification.type = :type', { type: query.type });
    }

    if (query.userId) {
      queryBuilder.andWhere('user.id = :userId', { userId: query.userId });
    }

    if (query.status === 'read') {
      queryBuilder.andWhere('notification.readAt IS NOT NULL');
    }

    if (query.status === 'unread') {
      queryBuilder.andWhere('notification.readAt IS NULL');
    }

    return queryBuilder.getMany();
  }

  async createNotificationAdmin(dto: CreateNotificationAdminDto) {
    const actor = dto.createdByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.createdByUserId } })
      : null;

    const notification = await this.notificationsService.createNotificationForUser({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      payload: dto.payload ?? null,
    });

    await this.recordAuditLog({
      actionType: 'notification_create',
      targetType: 'notification',
      targetId: notification.id,
      reason: dto.reason ?? 'notification_create',
      actor,
      beforeState: null,
      afterState: {
        type: notification.type,
        title: notification.title,
        userId: dto.userId,
      },
    });

    return notification;
  }

  async resendNotificationAdmin(notificationId: string, dto: AdminNotificationActionDto) {
    const notification = await this.notificationsRepository.findOne({
      where: { id: notificationId },
      relations: { user: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    const actor = dto.actorUserId
      ? await this.usersRepository.findOne({ where: { id: dto.actorUserId } })
      : null;

    const resentNotification = await this.notificationsService.createNotificationForUser({
      userId: notification.user.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      payload: {
        ...(notification.payload ?? {}),
        resentFromNotificationId: notification.id,
      },
    });

    await this.recordAuditLog({
      actionType: 'notification_resend',
      targetType: 'notification',
      targetId: notification.id,
      reason: dto.reason ?? 'notification_resend',
      actor,
      beforeState: {
        resentFrom: notification.id,
      },
      afterState: {
        resentNotificationId: resentNotification.id,
        userId: notification.user.id,
      },
    });

    return resentNotification;
  }

  async suppressNotificationAdmin(notificationId: string, dto: AdminNotificationActionDto) {
    const notification = await this.notificationsRepository.findOne({
      where: { id: notificationId },
      relations: { user: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    const actor = dto.actorUserId
      ? await this.usersRepository.findOne({ where: { id: dto.actorUserId } })
      : null;

    const beforeState = {
      type: notification.type,
      readAt: notification.readAt,
    };

    notification.type = 'suppressed';
    notification.readAt = notification.readAt ?? new Date();
    const updatedNotification = await this.notificationsRepository.save(notification);

    await this.recordAuditLog({
      actionType: 'notification_suppress',
      targetType: 'notification',
      targetId: notification.id,
      reason: dto.reason ?? 'notification_suppress',
      actor,
      beforeState,
      afterState: {
        type: updatedNotification.type,
        readAt: updatedNotification.readAt,
      },
    });

    return updatedNotification;
  }

  async getLeaguesOverview(query: LeagueAdminQueryDto) {
    const tournament = query.tournamentId
      ? await this.tournamentsRepository.findOne({ where: { id: query.tournamentId } })
      : await this.getLatestTournamentOrThrow();

    if (!tournament) {
      throw new NotFoundException('Egyptian Premier League tournament not found.');
    }

    const where = { tournament: { id: tournament.id } };

    const leagues = await this.leaguesRepository.find({
      where,
      relations: {
        owner: { profile: true },
        tournament: true,
        memberships: { user: { profile: true } },
      },
      order: { createdAt: 'DESC' },
    });

    const leagueIds = leagues.map((league) => league.id);
    const leaderboardEntries = leagueIds.length
      ? await this.leaderboardEntriesRepository
          .createQueryBuilder('entry')
          .leftJoinAndSelect('entry.fantasyTeam', 'fantasyTeam')
          .leftJoinAndSelect('fantasyTeam.user', 'user')
          .leftJoinAndSelect('user.profile', 'profile')
          .leftJoinAndSelect('entry.league', 'league')
          .where('league.id IN (:...leagueIds)', { leagueIds })
          .andWhere('entry.matchday_id IS NULL')
          .orderBy('entry.rank', 'ASC')
          .getMany()
      : [];

    const entriesByLeagueId = new Map<string, LeaderboardEntryEntity[]>();
    for (const entry of leaderboardEntries) {
      if (!entry.league) {
        continue;
      }
      const current = entriesByLeagueId.get(entry.league.id) ?? [];
      current.push(entry);
      entriesByLeagueId.set(entry.league.id, current);
    }

    return {
      leagues: leagues.map((league) => ({
        ...league,
        leaderboard: entriesByLeagueId.get(league.id) ?? [],
      })),
      summary: {
        totalLeagues: leagues.length,
        publicLeagues: leagues.filter((league) => league.isPublic).length,
        archivedLeagues: leagues.filter((league) => league.isArchived).length,
        totalMemberships: leagues.reduce((sum, league) => sum + league.memberships.length, 0),
      },
    };
  }

  async getLeagueAdminLeaderboard(leagueId: string, matchdayId?: string) {
    const league = await this.leaguesRepository.findOne({
      where: { id: leagueId },
      relations: { owner: { profile: true }, tournament: true },
    });

    if (!league) {
      throw new NotFoundException('League not found.');
    }

    const entriesQuery = this.leaderboardEntriesRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.fantasyTeam', 'fantasyTeam')
      .leftJoinAndSelect('fantasyTeam.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('fantasyTeam.tournament', 'tournament')
      .leftJoinAndSelect('entry.league', 'entryLeague')
      .leftJoinAndSelect('entry.matchday', 'matchday')
      .where('entryLeague.id = :leagueId', { leagueId })
      .orderBy('entry.rank', 'ASC');

    if (matchdayId) {
      entriesQuery.andWhere('matchday.id = :matchdayId', { matchdayId });
    } else {
      entriesQuery.andWhere('entry.matchday_id IS NULL');
    }

    const entries = await entriesQuery.getMany();

    return {
      league,
      entries,
    };
  }

  async updateLeagueAdmin(leagueId: string, dto: UpdateLeagueAdminDto) {
    const league = await this.leaguesRepository.findOne({
      where: { id: leagueId },
      relations: { owner: true, tournament: true },
    });

    if (!league) {
      throw new NotFoundException('League not found.');
    }

    const actor = dto.updatedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.updatedByUserId } })
      : null;

    const beforeState = {
      name: league.name,
      isPublic: league.isPublic,
      isArchived: league.isArchived,
      maxMembers: league.maxMembers,
      ownerUserId: league.owner?.id ?? null,
      tournamentId: league.tournament?.id ?? null,
    };

    if (dto.name !== undefined) {
      league.name = dto.name.trim();
      league.slug = dto.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    if (dto.isPublic !== undefined) {
      league.isPublic = dto.isPublic;
    }

    if (dto.isArchived !== undefined) {
      league.isArchived = dto.isArchived;
    }

    if (dto.maxMembers !== undefined) {
      league.maxMembers = dto.maxMembers;
    }

    if (dto.ownerUserId !== undefined) {
      if (!dto.ownerUserId) {
        league.owner = null;
      } else {
        const owner = await this.usersRepository.findOne({ where: { id: dto.ownerUserId } });
        if (!owner) {
          throw new NotFoundException('Owner user not found.');
        }
        league.owner = owner;
      }
    }

    if (dto.tournamentId !== undefined) {
      if (!dto.tournamentId) {
        league.tournament = null;
      } else {
        const tournament = await this.tournamentsRepository.findOne({ where: { id: dto.tournamentId } });
        if (!tournament) {
          throw new NotFoundException('Tournament not found.');
        }
        league.tournament = tournament;
      }
    }

    const updatedLeague = await this.leaguesRepository.save(league);

    await this.recordAuditLog({
      actionType: 'league_admin_update',
      targetType: 'league',
      targetId: updatedLeague.id,
      reason: dto.reason ?? 'league_admin_update',
      actor,
      beforeState,
      afterState: {
        name: updatedLeague.name,
        isPublic: updatedLeague.isPublic,
        isArchived: updatedLeague.isArchived,
        maxMembers: updatedLeague.maxMembers,
        ownerUserId: updatedLeague.owner?.id ?? null,
        tournamentId: updatedLeague.tournament?.id ?? null,
      },
    });

    return this.leaguesRepository.findOne({
      where: { id: updatedLeague.id },
      relations: { owner: { profile: true }, tournament: true, memberships: { user: { profile: true } } },
    });
  }

  async updateLeagueMembershipAdmin(membershipId: string, dto: UpdateLeagueMembershipAdminDto) {
    const membership = await this.leagueMembershipsRepository.findOne({
      where: { id: membershipId },
      relations: { league: true, user: { profile: true } },
    });

    if (!membership) {
      throw new NotFoundException('League membership not found.');
    }

    const actor = dto.updatedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.updatedByUserId } })
      : null;

    const beforeState = {
      role: membership.role,
      leagueId: membership.league.id,
      userId: membership.user.id,
    };

    if (dto.role !== undefined) {
      membership.role = dto.role;
    }

    const updatedMembership = await this.leagueMembershipsRepository.save(membership);

    await this.recordAuditLog({
      actionType: 'league_membership_update',
      targetType: 'league_membership',
      targetId: updatedMembership.id,
      reason: dto.reason ?? 'league_membership_update',
      actor,
      beforeState,
      afterState: {
        role: updatedMembership.role,
        leagueId: updatedMembership.league.id,
        userId: updatedMembership.user.id,
      },
    });

    return updatedMembership;
  }

  async recomputeLeagueLeaderboard(leagueId: string, matchdayId?: string, requestedByUserId?: string) {
    const league = await this.leaguesRepository.findOne({ where: { id: leagueId } });

    if (!league) {
      throw new NotFoundException('League not found.');
    }

    const actor = requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: requestedByUserId } })
      : null;

    const result = await this.leaderboardsService.materializeForMatchday(matchdayId);

    await this.recordAuditLog({
      actionType: 'league_leaderboard_recompute',
      targetType: 'league',
      targetId: leagueId,
      reason: 'league_leaderboard_recompute',
      actor,
      beforeState: {
        leagueId,
        matchdayId: matchdayId ?? null,
      },
      afterState: {
        leagueId,
        matchdayId: matchdayId ?? null,
        result: result as Record<string, unknown>,
      },
    });

    return {
      leagueId,
      matchdayId: matchdayId ?? null,
      result,
    };
  }

  async getScoringOverview(tournamentId?: string) {
    const tournament = tournamentId
      ? await this.tournamentsRepository.findOne({ where: { id: tournamentId } })
      : await this.getLatestTournamentOrThrow();

    if (!tournament) {
      throw new NotFoundException('Tournament not found.');
    }

    const [ruleSets, fixtures, adjustments, auditLogs] = await Promise.all([
      this.scoringService.getScoringRules(),
      this.fixturesRepository.find({
        where: { tournament: { id: tournament.id } },
        relations: { tournament: true, matchday: true, homeTeam: true, awayTeam: true },
        order: { kickoffAt: 'DESC' },
        take: 12,
      }),
      this.manualScoringAdjustmentsRepository.find({
        relations: { fixture: true, player: true, createdBy: true },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
      this.adminAuditLogsRepository.find({
        where: [
          { actionType: 'manual_scoring_adjustment' },
          { actionType: 'fixture_correction' },
        ],
        relations: { actor: true },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    const fixtureIds = fixtures.map((fixture) => fixture.id);

    const scoringRuns = fixtureIds.length
      ? await this.scoringService.getScoringRunsForFixtures(fixtureIds)
      : [];

    const logs = fixtureIds.length
      ? await this.scoringService.getScoringLogsByFixtures(fixtureIds)
      : [];

    const activeRuleSet = Array.isArray(ruleSets)
      ? ruleSets.find((entry) => entry.ruleSet.isActive) ?? ruleSets[0] ?? null
      : ruleSets;

    return {
      tournament,
      activeRuleSet,
      ruleSets,
      recentFixtures: fixtures,
      recentRuns: scoringRuns,
      recentLogs: logs,
      recentManualAdjustments: adjustments,
      recentAuditLogs: auditLogs,
      summary: {
        totalRuleSets: Array.isArray(ruleSets) ? ruleSets.length : 1,
        activeRulesCount: activeRuleSet?.rules?.filter((rule: { isEnabled: boolean }) => rule.isEnabled).length ?? 0,
        recentRunsCount: scoringRuns.length,
        recentLogsCount: logs.length,
        recentAdjustmentsCount: adjustments.length,
      },
    };
  }

  async getScoringLogs(query: ScoringLogQueryDto) {
    if (query.fixtureId) {
      return this.scoringService.getFixtureScoringLogs(query.fixtureId);
    }

    return this.scoringService.getScoringLogsByFilters(query);
  }

  async getScoringRuns(query: ScoringRunQueryDto) {
    return this.scoringService.getScoringRunsByFilters(query);
  }

  async recomputeScoring(dto: RecomputeScoringAdminDto) {
    const actor = dto.requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
      : null;

    if (!dto.fixtureId && !dto.matchdayId) {
      throw new BadRequestException('fixtureId or matchdayId is required.');
    }

    if (dto.fixtureId) {
      const result = await this.scoringService.recomputeFixture(dto.fixtureId);

      await this.recordAuditLog({
        actionType: 'scoring_recompute_fixture',
        targetType: 'fixture',
        targetId: dto.fixtureId,
        reason: dto.reason ?? 'scoring_recompute_fixture',
        actor,
        beforeState: null,
        afterState: result as Record<string, unknown>,
      });

      return {
        mode: 'fixture',
        result,
      };
    }

    const matchdayId = dto.matchdayId;

    if (!matchdayId) {
      throw new BadRequestException('matchdayId is required for matchday recompute.');
    }

    const fixtures = await this.fixturesRepository.find({
      where: { matchday: { id: matchdayId } },
      relations: { matchday: true, homeTeam: true, awayTeam: true },
      order: { kickoffAt: 'ASC' },
    });

    if (fixtures.length === 0) {
      throw new NotFoundException('No fixtures found for this matchday.');
    }

    const recomputeResults = [] as Array<Record<string, unknown>>;
    for (const fixture of fixtures) {
      recomputeResults.push((await this.scoringService.recomputeFixture(fixture.id)) as Record<string, unknown>);
    }

    const leaderboardRefresh = await this.leaderboardsService.materializeForMatchday(matchdayId);

    await this.recordAuditLog({
      actionType: 'scoring_recompute_matchday',
      targetType: 'matchday',
      targetId: matchdayId,
      reason: dto.reason ?? 'scoring_recompute_matchday',
      actor,
      beforeState: null,
      afterState: {
        fixturesProcessed: fixtures.length,
        leaderboardRefresh,
      },
    });

    return {
      mode: 'matchday',
      fixturesProcessed: fixtures.length,
      recomputeResults,
      leaderboardRefresh,
    };
  }

  async getOperationsOverview(tournamentId?: string) {
    const tournament = tournamentId
      ? await this.tournamentsRepository.findOne({ where: { id: tournamentId } })
      : await this.getLatestTournamentOrThrow();

    if (!tournament) {
      throw new NotFoundException('Tournament not found.');
    }

    const [matchdays, fixtures, groups, teams, auditLogs] = await Promise.all([
      this.matchdaysRepository.find({
        where: { tournament: { id: tournament.id } },
        relations: { tournament: true },
        order: { number: 'ASC' },
      }),
      this.fixturesRepository.find({
        where: { tournament: { id: tournament.id } },
        relations: { tournament: true, matchday: true, homeTeam: true, awayTeam: true, group: true },
        order: { kickoffAt: 'ASC' },
      }),
      this.groupsRepository.find({
        where: { tournament: { id: tournament.id } },
        order: { displayOrder: 'ASC', code: 'ASC' },
      }),
      this.teamsRepository.find({
        where: { tournament: { id: tournament.id } },
        relations: { tournament: true },
        order: { name: 'ASC' },
      }),
      this.adminAuditLogsRepository.find({
        relations: { actor: true },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const locks = await this.matchdayLocksRepository.find({
      where: { matchday: { tournament: { id: tournament.id } }, isActive: true },
      relations: { matchday: true, lockedBy: true },
      order: { lockedAt: 'DESC' },
    });

    const activeLocksByMatchdayId = new Map(locks.map((lock) => [lock.matchday.id, lock]));

    const matchdaysWithLocks = matchdays.map((matchday) => ({
      id: matchday.id,
      createdAt: matchday.createdAt,
      updatedAt: matchday.updatedAt,
      deletedAt: matchday.deletedAt,
      number: matchday.number,
      phase: matchday.phase,
      status: matchday.status,
      opensAt: matchday.opensAt,
      deadlineAt: matchday.deadlineAt,
      locksAt: matchday.locksAt,
      tournament: matchday.tournament,
      activeLock: activeLocksByMatchdayId.get(matchday.id) ?? null,
    }));

    return {
      tournament,
      groups,
      teams,
      matchdays: matchdaysWithLocks,
      fixtures,
      summary: {
        totalMatchdays: matchdays.length,
        totalFixtures: fixtures.length,
        scheduledFixtures: fixtures.filter((fixture) => fixture.status === FixtureStatus.SCHEDULED).length,
        liveFixtures: fixtures.filter((fixture) => fixture.status === FixtureStatus.LIVE).length,
        finalizedFixtures: fixtures.filter((fixture) => fixture.status === FixtureStatus.FULL_TIME).length,
        activeLocks: locks.length,
      },
      recentAuditLogs: auditLogs,
    };
  }

  async syncMoreScreen(dto: MoreScreenSyncDto) {
    const tournament = await this.tournamentsRepository.findOne({
      where: { id: dto.tournamentId },
    });

    if (!tournament) {
      throw new NotFoundException('Tournament not found for More sync.');
    }

    const actor = dto.requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
      : null;

    const matchdays = await this.matchdaysRepository
      .createQueryBuilder('matchday')
      .leftJoin('matchday.tournament', 'tournament')
      .where('tournament.id = :tournamentId', { tournamentId: tournament.id })
      .orderBy('matchday.number', 'ASC')
      .getMany();

    if (matchdays.length === 0) {
      throw new NotFoundException('No matchdays found for the selected tournament.');
    }

    const selectedMatchday = dto.activeMatchdayId
      ? matchdays.find((matchday) => matchday.id === dto.activeMatchdayId) ?? null
      : matchdays.find((matchday) => matchday.number === tournament.currentMatchdayNumber) ?? matchdays[0] ?? null;

    if (!selectedMatchday) {
      throw new BadRequestException('Active matchday selection is invalid for More sync.');
    }

    const beforeState = {
      currentMatchdayNumber: tournament.currentMatchdayNumber,
      currentPhase: tournament.currentPhase,
    };

    const fixtureIds = (await this.fixturesRepository
      .createQueryBuilder('fixture')
      .select('fixture.id', 'id')
      .where('fixture.tournament_id = :tournamentId', { tournamentId: tournament.id })
      .getRawMany<{ id: string }>()).map((row) => row.id);

    const fantasyTeamIds = (await this.fantasyTeamsRepository
      .createQueryBuilder('fantasyTeam')
      .select('fantasyTeam.id', 'id')
      .where('fantasyTeam.tournament_id = :tournamentId', { tournamentId: tournament.id })
      .getRawMany<{ id: string }>()).map((row) => row.id);

    const matchdayIds = matchdays.map((matchday) => matchday.id);

    const deletedScoreEvents = fixtureIds.length > 0
      ? await this.playerScoreEventsRepository.createQueryBuilder().delete().where('fixture_id IN (:...fixtureIds)', { fixtureIds }).execute()
      : { affected: 0 };

    const deletedScoreLogs = fixtureIds.length > 0
      ? await this.playerScoreLogsRepository.createQueryBuilder().delete().where('fixture_id IN (:...fixtureIds)', { fixtureIds }).execute()
      : { affected: 0 };

    const deletedTransfers = matchdayIds.length > 0
      ? await this.transfersRepository.createQueryBuilder().delete().where('matchday_id IN (:...matchdayIds)', { matchdayIds }).execute()
      : { affected: 0 };

    const deletedLeaderboardEntries = fantasyTeamIds.length > 0
      ? await this.leaderboardEntriesRepository.createQueryBuilder().delete().where('fantasy_team_id IN (:...fantasyTeamIds)', { fantasyTeamIds }).execute()
      : { affected: 0 };

    tournament.currentMatchdayNumber = selectedMatchday.number;
    tournament.currentPhase = selectedMatchday.phase as TournamentPhase;
    await this.tournamentsRepository.save(tournament);

    const pointsRefresh = await this.recalculateTournamentPointsFromScoreLogs(tournament.id);
    const leaderboardRefresh = await this.leaderboardsService.materializeForMatchday(selectedMatchday.id);

    await this.recordAuditLog({
      actionType: 'more_screen_sync',
      targetType: 'tournament',
      targetId: tournament.id,
      reason: dto.reason ?? 'admin_more_screen_sync',
      actor,
      beforeState,
      afterState: {
        currentMatchdayNumber: tournament.currentMatchdayNumber,
        currentPhase: tournament.currentPhase,
        deletedScoreEvents: deletedScoreEvents.affected ?? 0,
        deletedScoreLogs: deletedScoreLogs.affected ?? 0,
        deletedTransfers: deletedTransfers.affected ?? 0,
        deletedLeaderboardEntries: deletedLeaderboardEntries.affected ?? 0,
        recalculatedPlayers: pointsRefresh.recalculatedPlayers,
        recalculatedFantasyTeams: pointsRefresh.recalculatedFantasyTeams,
        rebuiltMatchdayId: selectedMatchday.id,
      },
    });

    return {
      tournamentId: tournament.id,
      activeMatchdayId: selectedMatchday.id,
      activeMatchdayNumber: selectedMatchday.number,
      deletedScoreEvents: deletedScoreEvents.affected ?? 0,
      deletedScoreLogs: deletedScoreLogs.affected ?? 0,
      deletedTransfers: deletedTransfers.affected ?? 0,
      deletedLeaderboardEntries: deletedLeaderboardEntries.affected ?? 0,
      recalculatedPlayers: pointsRefresh.recalculatedPlayers,
      recalculatedFantasyTeams: pointsRefresh.recalculatedFantasyTeams,
      leaderboardRefresh,
    };
  }

  async recomputeLeaderboards(matchday?: string, requestedByUserId?: string) {
    try {
      const tournamentId = await this.resolveTournamentIdForLeaderboardRefresh(matchday);
      const pointsRefresh = await this.recalculateTournamentPointsFromScoreLogs(tournamentId);
      const result = await this.leaderboardsService.materializeForMatchday(matchday);
      const actor = requestedByUserId
        ? await this.usersRepository.findOne({ where: { id: requestedByUserId } })
        : null;

      await this.recordAuditLog({
        actionType: 'leaderboards_recompute',
        targetType: 'matchday',
        targetId: matchday ?? 'all',
        reason: 'leaderboards_recompute',
        actor,
        beforeState: {
          matchdayId: matchday ?? null,
        },
        afterState: {
          matchdayId: matchday ?? null,
          recalculatedPlayers: pointsRefresh.recalculatedPlayers,
          recalculatedFantasyTeams: pointsRefresh.recalculatedFantasyTeams,
          result: result as Record<string, unknown>,
        },
      });

      return {
        ...result,
        recalculatedPlayers: pointsRefresh.recalculatedPlayers,
        recalculatedFantasyTeams: pointsRefresh.recalculatedFantasyTeams,
      };
    } catch (error) {
      this.logger.error(JSON.stringify({
        alertType: 'leaderboard_recompute_failed',
        severity: 'critical',
        matchdayId: matchday ?? null,
        requestedByUserId: requestedByUserId ?? null,
        message: error instanceof Error ? error.message : 'Unknown recompute failure',
        timestamp: new Date().toISOString(),
      }));
      throw error;
    }
  }

  async createMatchdayOps(dto: CreateMatchdayAdminDto) {
    const tournament = dto.tournamentId
      ? await this.tournamentsRepository.findOne({ where: { id: dto.tournamentId } })
      : await this.getLatestTournamentOrThrow();

    if (!tournament) {
      throw new NotFoundException('Tournament not found.');
    }

    const existingMatchday = await this.matchdaysRepository.findOne({
      where: { tournament: { id: tournament.id }, number: dto.number },
    });

    if (existingMatchday) {
      throw new BadRequestException(`Matchday ${dto.number} already exists for this tournament.`);
    }

    const actor = dto.createdByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.createdByUserId } })
      : null;

    const matchday = await this.matchdaysRepository.save(
      this.matchdaysRepository.create({
        tournament,
        number: dto.number,
        phase: dto.phase,
        status: dto.status ?? MatchdayStatus.OPEN,
        opensAt: dto.opensAt ? new Date(dto.opensAt) : null,
        deadlineAt: new Date(dto.deadlineAt),
        locksAt: dto.locksAt ? new Date(dto.locksAt) : null,
      }),
    );

    await this.recordAuditLog({
      actionType: 'matchday_ops_create',
      targetType: 'matchday',
      targetId: matchday.id,
      reason: dto.reason ?? 'matchday_ops_create',
      actor,
      beforeState: null,
      afterState: {
        tournamentId: tournament.id,
        number: matchday.number,
        phase: matchday.phase,
        status: matchday.status,
        opensAt: matchday.opensAt,
        deadlineAt: matchday.deadlineAt,
        locksAt: matchday.locksAt,
      },
    });

    return this.matchdaysRepository.findOne({
      where: { id: matchday.id },
      relations: { tournament: true },
    });
  }

  async createFixtureOps(dto: CreateFixtureAdminDto) {
    const tournament = dto.tournamentId
      ? await this.tournamentsRepository.findOne({ where: { id: dto.tournamentId } })
      : await this.getLatestTournamentOrThrow();

    if (!tournament) {
      throw new NotFoundException('Tournament not found.');
    }

    if (dto.homeTeamId === dto.awayTeamId) {
      throw new BadRequestException('Home team and away team must be different.');
    }

    const [homeTeam, awayTeam, matchday, group] = await Promise.all([
      this.teamsRepository.findOne({ where: { id: dto.homeTeamId }, relations: { tournament: true } }),
      this.teamsRepository.findOne({ where: { id: dto.awayTeamId }, relations: { tournament: true } }),
      dto.matchdayId
        ? this.matchdaysRepository.findOne({ where: { id: dto.matchdayId }, relations: { tournament: true } })
        : Promise.resolve(null),
      dto.groupId
        ? this.groupsRepository.findOne({ where: { id: dto.groupId }, relations: { tournament: true } })
        : Promise.resolve(null),
    ]);

    if (!homeTeam) {
      throw new NotFoundException('Home team not found.');
    }

    if (!awayTeam) {
      throw new NotFoundException('Away team not found.');
    }

    if (homeTeam.tournament.id !== tournament.id || awayTeam.tournament.id !== tournament.id) {
      throw new BadRequestException('Fixture teams must belong to the selected tournament.');
    }

    if (matchday && matchday.tournament.id !== tournament.id) {
      throw new BadRequestException('Selected matchday does not belong to the tournament.');
    }

    if (group && group.tournament.id !== tournament.id) {
      throw new BadRequestException('Selected group does not belong to the tournament.');
    }

    const actor = dto.createdByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.createdByUserId } })
      : null;

    const fixture = await this.fixturesRepository.save(
      this.fixturesRepository.create({
        tournament,
        matchday: matchday ?? null,
        group: group ?? null,
        homeTeam,
        awayTeam,
        phase: dto.phase,
        status: dto.status ?? FixtureStatus.SCHEDULED,
        kickoffAt: new Date(dto.kickoffAt),
        venue: dto.venue.trim(),
        homeScore: dto.homeScore ?? null,
        awayScore: dto.awayScore ?? null,
        currentMinute: dto.currentMinute ?? null,
        externalProviderId: dto.externalProviderId?.trim() || null,
        statistics: null,
        lineups: null,
      }),
    );

    await this.recordAuditLog({
      actionType: 'fixture_ops_create',
      targetType: 'fixture',
      targetId: fixture.id,
      reason: dto.reason ?? 'fixture_ops_create',
      actor,
      beforeState: null,
      afterState: {
        tournamentId: tournament.id,
        matchdayId: matchday?.id ?? null,
        groupId: group?.id ?? null,
        phase: fixture.phase,
        status: fixture.status,
        kickoffAt: fixture.kickoffAt,
        venue: fixture.venue,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        currentMinute: fixture.currentMinute,
        externalProviderId: fixture.externalProviderId,
      },
    });

    this.realtimeEventsService.emitFixtureUpdated({
      fixtureId: fixture.id,
      status: fixture.status,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      currentMinute: fixture.currentMinute,
    });

    return this.fixturesRepository.findOne({
      where: { id: fixture.id },
      relations: { tournament: true, matchday: true, homeTeam: true, awayTeam: true, group: true },
    });
  }

  async recomputeFixtureScoring(fixtureId: string, requestedByUserId?: string) {
    try {
      const result = await this.scoringService.recomputeFixture(fixtureId);
      const actor = requestedByUserId
        ? await this.usersRepository.findOne({ where: { id: requestedByUserId } })
        : null;

      await this.recordAuditLog({
        actionType: 'scoring_recompute_fixture_legacy',
        targetType: 'fixture',
        targetId: fixtureId,
        reason: 'scoring_recompute_fixture_legacy',
        actor,
        beforeState: null,
        afterState: result as Record<string, unknown>,
      });

      return result;
    } catch (error) {
      this.logger.error(JSON.stringify({
        alertType: 'fixture_recompute_failed',
        severity: 'critical',
        fixtureId,
        requestedByUserId: requestedByUserId ?? null,
        message: error instanceof Error ? error.message : 'Unknown recompute failure',
        timestamp: new Date().toISOString(),
      }));
      throw error;
    }
  }

  getScoringRules(code?: string, activeOnly = false) {
    return this.scoringService.getScoringRules(code, activeOnly);
  }

  async upsertScoringRules(dto: UpsertScoringRulesDto, requestedByUserId?: string) {
    const beforeState = await this.scoringService.getScoringRules(dto.ruleSet.code);
    const result = await this.scoringService.upsertScoringRules(dto);
    const actor = requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: requestedByUserId } })
      : null;

    await this.recordAuditLog({
      actionType: 'scoring_rules_upsert',
      targetType: 'scoring_rule_set',
      targetId: dto.ruleSet.code,
      reason: 'scoring_rules_upsert',
      actor,
      beforeState: {
        ruleSetCode: dto.ruleSet.code,
        existing: beforeState as unknown as Record<string, unknown>,
      },
      afterState: {
        ruleSetCode: dto.ruleSet.code,
        name: dto.ruleSet.name,
        isActive: dto.ruleSet.isActive,
        rulesCount: dto.rules.length,
        updated: result as Record<string, unknown>,
      },
    });

    return result;
  }

  getDeadlineStatus(matchdayId?: string) {
    return this.deadlineLockService.getMatchdayLockStatus(matchdayId);
  }

  async lockMatchday(dto: LockMatchdayDto) {
    const beforeStatus = await this.deadlineLockService.getMatchdayLockStatus(dto.matchdayId);
    const lockResult = await this.deadlineLockService.lockMatchday(dto.matchdayId, {
      reason: dto.reason,
      lockedByUserId: dto.lockedByUserId,
    });

    const actor = dto.lockedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.lockedByUserId } })
      : null;

    await this.recordAuditLog({
      actionType: 'matchday_lock',
      targetType: 'matchday',
      targetId: lockResult.matchdayId,
      reason: dto.reason ?? 'manual_or_deadline_lock',
      actor,
      beforeState: {
        matchdayId: beforeStatus.matchdayId,
        isLocked: beforeStatus.isLocked,
        lockId: beforeStatus.lock?.id ?? null,
        snapshotsCount: beforeStatus.snapshotsCount,
      },
      afterState: {
        matchdayId: lockResult.matchdayId,
        isLocked: true,
        lockId: lockResult.lock?.id ?? null,
        snapshotsCreated: lockResult.snapshotsCreated,
      },
    });

    return lockResult;
  }

  async createManualScoringAdjustment(dto: CreateManualScoringAdjustmentDto) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: dto.fixtureId },
      relations: { matchday: true, tournament: true },
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

    const actor = dto.createdByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.createdByUserId } })
      : null;

    const adjustment = await this.manualScoringAdjustmentsRepository.save(
      this.manualScoringAdjustmentsRepository.create({
        fixture,
        player,
        eventType: dto.eventType,
        minute: dto.minute,
        points: dto.points,
        reason: dto.reason,
        details: dto.details ?? {},
        createdBy: actor ?? null,
      }),
    );

    const scoringResult = await this.scoringService.scoreFixtureEvent({
      fixtureId: fixture.id,
      playerId: player.id,
      type: dto.eventType,
      minute: dto.minute,
      points: dto.points,
      details: {
        ...(dto.details ?? {}),
        source: 'admin_manual_adjustment',
        adjustmentId: adjustment.id,
      },
    });

    await this.recordAuditLog({
      actionType: 'manual_scoring_adjustment',
      targetType: 'fixture',
      targetId: fixture.id,
      reason: dto.reason,
      actor,
      beforeState: {
        fixtureId: fixture.id,
        playerId: player.id,
        eventType: dto.eventType,
        existingScoreLogTotal: scoringResult.scoreLog.totalPoints - dto.points,
      },
      afterState: {
        adjustmentId: adjustment.id,
        fixtureId: fixture.id,
        playerId: player.id,
        eventType: dto.eventType,
        points: dto.points,
        scoreLogTotal: scoringResult.scoreLog.totalPoints,
      },
    });

    this.realtimeEventsService.emitAdminCorrection({
      type: 'manual_scoring_adjustment',
      fixtureId: fixture.id,
      playerId: player.id,
      adjustmentId: adjustment.id,
    });

    await this.notifyAllUsers({
      type: 'manual_scoring_adjustment',
      title: 'Manual scoring adjustment applied',
      body: `Admin applied a scoring adjustment for ${player.shortName} in ${fixture.venue}.`,
      payload: {
        fixtureId: fixture.id,
        playerId: player.id,
        adjustmentId: adjustment.id,
        eventType: dto.eventType,
        points: dto.points,
        reason: dto.reason,
      },
    });

    return {
      adjustment,
      scoringResult,
    };
  }

  getFixtureEvents(fixtureId: string) {
    return this.scoringService.getFixtureEvents(fixtureId);
  }

  async createFixtureEvent(fixtureId: string, dto: CreateFixtureEventAdminDto) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: { homeTeam: true, awayTeam: true, matchday: true, tournament: true },
    });

    if (!fixture) {
      throw new NotFoundException('Fixture not found.');
    }

    const actor = dto.createdByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.createdByUserId } })
      : null;

    const scoringResult = await this.scoringService.scoreFixtureEvent({
      fixtureId,
      playerId: dto.playerId,
      type: dto.eventType,
      minute: dto.minute,
      points: dto.points,
      details: {
        source: 'admin_fixture_event',
        relatedPlayerId: dto.relatedPlayerId ?? null,
        relatedPlayerName: dto.relatedPlayerName ?? null,
        teamSide: dto.teamSide ?? null,
        reason: dto.reason ?? null,
      },
    });

    await this.recordAuditLog({
      actionType: 'fixture_event_create',
      targetType: 'fixture_event',
      targetId: scoringResult.scoreEvent.id,
      reason: dto.reason ?? 'fixture_event_create',
      actor,
      beforeState: null,
      afterState: {
        fixtureId,
        playerId: dto.playerId,
        eventType: dto.eventType,
        minute: dto.minute,
        points: scoringResult.scoreEvent.points,
        relatedPlayerId: dto.relatedPlayerId ?? null,
        relatedPlayerName: dto.relatedPlayerName ?? null,
        teamSide: dto.teamSide ?? null,
      },
    });

    this.realtimeEventsService.emitAdminCorrection({
      type: 'fixture_event_create',
      fixtureId,
      eventId: scoringResult.scoreEvent.id,
      playerId: dto.playerId,
    });

    return scoringResult;
  }

  async updateFixtureEvent(eventId: string, dto: UpdateFixtureEventAdminDto) {
    const existingEvents = await this.scoringService.getFixtureEventsByIds([eventId]);
    const existingEvent = existingEvents[0] ?? null;

    if (!existingEvent) {
      throw new NotFoundException('Fixture event not found.');
    }

    const actor = dto.updatedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.updatedByUserId } })
      : null;

    const beforeState = {
      id: existingEvent.id,
      fixtureId: existingEvent.fixture.id,
      playerId: existingEvent.player.id,
      eventType: existingEvent.type,
      minute: existingEvent.minute,
      points: existingEvent.points,
      details: existingEvent.details,
    };

    await this.scoringService.deleteFixtureEvent(eventId);

    const scoringResult = await this.scoringService.scoreFixtureEvent({
      fixtureId: existingEvent.fixture.id,
      playerId: dto.playerId,
      type: dto.eventType,
      minute: dto.minute,
      points: dto.points,
      details: {
        source: 'admin_fixture_event_update',
        replacedEventId: eventId,
        relatedPlayerId: dto.relatedPlayerId ?? null,
        relatedPlayerName: dto.relatedPlayerName ?? null,
        teamSide: dto.teamSide ?? null,
        reason: dto.reason ?? null,
      },
    });

    await this.recordAuditLog({
      actionType: 'fixture_event_update',
      targetType: 'fixture_event',
      targetId: scoringResult.scoreEvent.id,
      reason: dto.reason ?? 'fixture_event_update',
      actor,
      beforeState,
      afterState: {
        id: scoringResult.scoreEvent.id,
        fixtureId: scoringResult.fixtureId,
        playerId: dto.playerId,
        eventType: dto.eventType,
        minute: dto.minute,
        points: scoringResult.scoreEvent.points,
        relatedPlayerId: dto.relatedPlayerId ?? null,
        relatedPlayerName: dto.relatedPlayerName ?? null,
        teamSide: dto.teamSide ?? null,
      },
    });

    this.realtimeEventsService.emitAdminCorrection({
      type: 'fixture_event_update',
      fixtureId: scoringResult.fixtureId,
      eventId: scoringResult.scoreEvent.id,
      replacedEventId: eventId,
      playerId: dto.playerId,
    });

    return scoringResult;
  }

  async deleteFixtureEvent(eventId: string, dto: DeleteFixtureEventAdminDto) {
    const actor = dto.deletedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.deletedByUserId } })
      : null;

    const result = await this.scoringService.deleteFixtureEvent(eventId);

    await this.recordAuditLog({
      actionType: 'fixture_event_delete',
      targetType: 'fixture_event',
      targetId: eventId,
      reason: dto.reason ?? 'fixture_event_delete',
      actor,
      beforeState: result.deletedEvent,
      afterState: {
        fixtureId: result.fixtureId,
        playerId: result.playerId,
        deleted: true,
      },
    });

    this.realtimeEventsService.emitAdminCorrection({
      type: 'fixture_event_delete',
      fixtureId: result.fixtureId,
      eventId,
      playerId: result.playerId,
    });

    return result;
  }

  async deleteAllFixtureEvents(fixtureId: string, dto: DeleteAllFixtureEventsAdminDto) {
    const actor = dto.deletedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.deletedByUserId } })
      : null;

    const result = await this.scoringService.deleteAllFixtureEvents(fixtureId);

    await this.recordAuditLog({
      actionType: 'fixture_events_delete_all',
      targetType: 'fixture',
      targetId: fixtureId,
      reason: dto.reason ?? 'fixture_events_delete_all',
      actor,
      beforeState: {
        deletedEvents: result.deletedEvents,
      },
      afterState: {
        fixtureId,
        deletedEventsCount: result.deletedEventsCount,
      },
    });

    this.realtimeEventsService.emitAdminCorrection({
      type: 'fixture_events_delete_all',
      fixtureId,
      eventId: 'all',
      playerId: 'bulk',
    });

    return result;
  }

  async createFixtureCorrection(dto: CreateFixtureCorrectionDto) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: dto.fixtureId },
      relations: { homeTeam: true, awayTeam: true, matchday: true, tournament: true },
    });

    if (!fixture) {
      throw new NotFoundException('Fixture not found.');
    }

    const actor = dto.createdByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.createdByUserId } })
      : null;

    const beforeState = {
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      currentMinute: fixture.currentMinute,
      status: fixture.status,
    };

    const correction = await this.fixtureCorrectionsRepository.save(
      this.fixtureCorrectionsRepository.create({
        fixture,
        reason: dto.reason,
        homeScore: dto.homeScore ?? null,
        awayScore: dto.awayScore ?? null,
        currentMinute: dto.currentMinute ?? null,
        status: dto.status ?? null,
        notes: dto.notes ?? null,
        createdBy: actor ?? null,
      }),
    );

    const updatedFixture = await this.scoringService.applyFixtureCorrection({
      fixtureId: fixture.id,
      homeScore: dto.homeScore,
      awayScore: dto.awayScore,
      currentMinute: dto.currentMinute,
      status: dto.status as FixtureStatus | undefined,
    });

    await this.recordAuditLog({
      actionType: 'fixture_correction',
      targetType: 'fixture',
      targetId: fixture.id,
      reason: dto.reason,
      actor,
      beforeState,
      afterState: {
        correctionId: correction.id,
        homeScore: updatedFixture.homeScore,
        awayScore: updatedFixture.awayScore,
        currentMinute: updatedFixture.currentMinute,
        status: updatedFixture.status,
      },
    });

    this.realtimeEventsService.emitAdminCorrection({
      type: 'fixture_correction',
      fixtureId: fixture.id,
      correctionId: correction.id,
      status: updatedFixture.status,
    });

    await this.notifyAllUsers({
      type: 'fixture_correction',
      title: 'Fixture corrected',
      body: `Admin corrected the fixture at ${fixture.venue}.`,
      payload: {
        fixtureId: fixture.id,
        correctionId: correction.id,
        homeScore: updatedFixture.homeScore,
        awayScore: updatedFixture.awayScore,
        status: updatedFixture.status,
      },
    });

    return {
      correction,
      fixture: updatedFixture,
    };
  }

  getAuditLogs() {
    return this.adminAuditLogsRepository.find({
      relations: { actor: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getAuditOverview() {
    const [recentLogs, totalLogs, actionBreakdown, targetBreakdown, actorRows] = await Promise.all([
      this.adminAuditLogsRepository.find({
        relations: { actor: true },
        order: { createdAt: 'DESC' },
        take: 25,
      }),
      this.adminAuditLogsRepository.count(),
      this.adminAuditLogsRepository
        .createQueryBuilder('log')
        .select('log.actionType', 'actionType')
        .addSelect('COUNT(log.id)', 'count')
        .groupBy('log.actionType')
        .orderBy('COUNT(log.id)', 'DESC')
        .limit(12)
        .getRawMany<{ actionType: string; count: string }>(),
      this.adminAuditLogsRepository
        .createQueryBuilder('log')
        .select('log.targetType', 'targetType')
        .addSelect('COUNT(log.id)', 'count')
        .groupBy('log.targetType')
        .orderBy('COUNT(log.id)', 'DESC')
        .limit(12)
        .getRawMany<{ targetType: string; count: string }>(),
      this.adminAuditLogsRepository
        .createQueryBuilder('log')
        .leftJoin('log.actor', 'actor')
        .select('actor.id', 'id')
        .addSelect('actor.email', 'email')
        .addSelect('COUNT(log.id)', 'count')
        .where('actor.id IS NOT NULL')
        .groupBy('actor.id')
        .addGroupBy('actor.email')
        .orderBy('COUNT(log.id)', 'DESC')
        .limit(12)
        .getRawMany<{ id: string; email: string | null; count: string }>(),
    ]);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const logsToday = recentLogs.filter((log) => log.createdAt >= startOfToday).length;

    return {
      summary: {
        totalLogs,
        logsToday,
        uniqueActionTypes: actionBreakdown.length,
        uniqueTargetTypes: targetBreakdown.length,
        uniqueActors: actorRows.length,
      },
      recentLogs,
      actionBreakdown: actionBreakdown.map((entry) => ({
        actionType: entry.actionType,
        count: Number(entry.count),
      })),
      targetBreakdown: targetBreakdown.map((entry) => ({
        targetType: entry.targetType,
        count: Number(entry.count),
      })),
      actors: actorRows.map((entry) => ({
        id: entry.id,
        email: entry.email,
        count: Number(entry.count),
      })),
    };
  }

  async getAuditLogsAdmin(query: AuditLogAdminQueryDto) {
    const queryBuilder = this.adminAuditLogsRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.actor', 'actor')
      .orderBy('log.createdAt', 'DESC')
      .take(query.limit ?? 120);

    if (query.actionType) {
      queryBuilder.andWhere('log.actionType = :actionType', { actionType: query.actionType });
    }

    if (query.targetType) {
      queryBuilder.andWhere('log.targetType = :targetType', { targetType: query.targetType });
    }

    if (query.actorUserId) {
      queryBuilder.andWhere('actor.id = :actorUserId', { actorUserId: query.actorUserId });
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      queryBuilder.andWhere(
        `(
          LOWER(log.actionType) LIKE :search OR
          LOWER(log.targetType) LIKE :search OR
          LOWER(log.targetId) LIKE :search OR
          LOWER(log.reason) LIKE :search OR
          LOWER(COALESCE(actor.email, '')) LIKE :search
        )`,
        { search },
      );
    }

    return queryBuilder.getMany();
  }

  async updateTournamentOps(dto: UpdateTournamentOpsDto) {
    const tournament = await this.getLatestTournamentOrThrow();

    if (!tournament) {
      throw new NotFoundException('Tournament not found.');
    }

    const actor = dto.updatedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.updatedByUserId } })
      : null;

    const beforeState = {
      status: tournament.status,
      currentPhase: tournament.currentPhase,
      currentMatchdayNumber: tournament.currentMatchdayNumber,
      visibleTeamMatchdayNumber: tournament.visibleTeamMatchdayNumber,
      visibleLivePointsMatchdayNumber: tournament.visibleLivePointsMatchdayNumber,
      startsAt: tournament.startsAt,
      endsAt: tournament.endsAt,
    };

    if (dto.status !== undefined) {
      tournament.status = dto.status;
    }

    if (dto.currentPhase !== undefined) {
      tournament.currentPhase = dto.currentPhase;
    }

    if (dto.currentMatchdayNumber !== undefined) {
      tournament.currentMatchdayNumber = dto.currentMatchdayNumber;
    }

    if (dto.visibleTeamMatchdayNumber !== undefined) {
      tournament.visibleTeamMatchdayNumber = dto.visibleTeamMatchdayNumber ?? null;
    }

    if (dto.visibleLivePointsMatchdayNumber !== undefined) {
      tournament.visibleLivePointsMatchdayNumber = dto.visibleLivePointsMatchdayNumber ?? null;
    }

    if (dto.startsAt !== undefined) {
      tournament.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    }

    if (dto.endsAt !== undefined) {
      tournament.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    }

    const updatedTournament = await this.tournamentsRepository.save(tournament);


    await this.recordAuditLog({
      actionType: 'tournament_ops_update',
      targetType: 'tournament',
      targetId: updatedTournament.id,
      reason: dto.reason ?? 'tournament_ops_update',
      actor,
      beforeState,
      afterState: {
        status: updatedTournament.status,
        currentPhase: updatedTournament.currentPhase,
        currentMatchdayNumber: updatedTournament.currentMatchdayNumber,
        visibleTeamMatchdayNumber: updatedTournament.visibleTeamMatchdayNumber,
        visibleLivePointsMatchdayNumber: updatedTournament.visibleLivePointsMatchdayNumber,
        startsAt: updatedTournament.startsAt,
        endsAt: updatedTournament.endsAt,
      },
    });

    return updatedTournament;
  }

  async updateMatchdayOps(matchdayId: string, dto: UpdateMatchdayAdminDto) {
    const matchday = await this.matchdaysRepository.findOne({
      where: { id: matchdayId },
      relations: { tournament: true },
    });

    if (!matchday) {
      throw new NotFoundException('Matchday not found.');
    }

    const actor = dto.updatedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.updatedByUserId } })
      : null;

    const beforeState = {
      number: matchday.number,
      phase: matchday.phase,
      status: matchday.status,
      opensAt: matchday.opensAt,
      deadlineAt: matchday.deadlineAt,
      locksAt: matchday.locksAt,
    };

    if (dto.number !== undefined) {
      matchday.number = dto.number;
    }

    if (dto.phase !== undefined) {
      matchday.phase = dto.phase;
    }

    if (dto.status !== undefined) {
      matchday.status = dto.status;
    }

    if (dto.opensAt !== undefined) {
      matchday.opensAt = dto.opensAt ? new Date(dto.opensAt) : null;
    }

    if (dto.deadlineAt !== undefined) {
      matchday.deadlineAt = new Date(dto.deadlineAt);
    }

    if (dto.locksAt !== undefined) {
      matchday.locksAt = dto.locksAt ? new Date(dto.locksAt) : null;
    }

    const updatedMatchday = await this.matchdaysRepository.save(matchday);

    await this.recordAuditLog({
      actionType: 'matchday_ops_update',
      targetType: 'matchday',
      targetId: updatedMatchday.id,
      reason: dto.reason ?? 'matchday_ops_update',
      actor,
      beforeState,
      afterState: {
        number: updatedMatchday.number,
        phase: updatedMatchday.phase,
        status: updatedMatchday.status,
        opensAt: updatedMatchday.opensAt,
        deadlineAt: updatedMatchday.deadlineAt,
        locksAt: updatedMatchday.locksAt,
      },
    });

    return updatedMatchday;
  }

  async deleteMatchdayOps(matchdayId: string, dto: DeleteMatchdayAdminDto) {
    const matchday = await this.matchdaysRepository.findOne({
      where: { id: matchdayId },
      relations: { tournament: true, fixtures: true },
    });

    if (!matchday) {
      throw new NotFoundException('Matchday not found.');
    }

    const actor = dto.deletedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.deletedByUserId } })
      : null;

    const fixtureIds = matchday.fixtures.map((fixture) => fixture.id);
    const affectedPlayerIds = await this.collectAffectedPlayerIdsByFixtureIds(fixtureIds);
    const deletedScoreEvents = fixtureIds.length > 0
      ? await this.playerScoreEventsRepository.createQueryBuilder().delete().where('fixture_id IN (:...fixtureIds)', { fixtureIds }).execute()
      : { affected: 0 };
    const deletedScoreLogs = fixtureIds.length > 0
      ? await this.playerScoreLogsRepository.createQueryBuilder().delete().where('fixture_id IN (:...fixtureIds)', { fixtureIds }).execute()
      : { affected: 0 };
    const deletedTransfers = await this.transfersRepository.createQueryBuilder().delete().where('matchday_id = :matchdayId', { matchdayId }).execute();
    const deletedChipActivations = await this.chipActivationsRepository.createQueryBuilder().delete().where('matchday_id = :matchdayId', { matchdayId }).execute();
    const deletedLeaderboardEntries = await this.leaderboardEntriesRepository.createQueryBuilder().delete().where('matchday_id = :matchdayId', { matchdayId }).execute();
    const deletedLocks = await this.matchdayLocksRepository.createQueryBuilder().delete().where('matchday_id = :matchdayId', { matchdayId }).execute();
    const deletedFixtures = fixtureIds.length > 0
      ? await this.fixturesRepository.createQueryBuilder().delete().where('id IN (:...fixtureIds)', { fixtureIds }).execute()
      : { affected: 0 };

    await this.matchdaysRepository.delete(matchdayId);
    const pointsRefresh = await this.recalculatePointsAfterFixtureDataDeletion({
      affectedPlayerIds,
      tournamentId: matchday.tournament.id,
      preferredMatchdayId: null,
    });

    await this.recordAuditLog({
      actionType: 'matchday_ops_delete',
      targetType: 'matchday',
      targetId: matchdayId,
      reason: dto.reason ?? 'matchday_ops_delete',
      actor,
      beforeState: {
        number: matchday.number,
        fixtureIds,
      },
      afterState: {
        deletedFixtures: deletedFixtures.affected ?? 0,
        deletedScoreEvents: deletedScoreEvents.affected ?? 0,
        deletedScoreLogs: deletedScoreLogs.affected ?? 0,
        deletedTransfers: deletedTransfers.affected ?? 0,
        deletedChipActivations: deletedChipActivations.affected ?? 0,
        deletedLeaderboardEntries: deletedLeaderboardEntries.affected ?? 0,
        deletedLocks: deletedLocks.affected ?? 0,
        recalculatedPlayers: pointsRefresh.recalculatedPlayers,
        recalculatedFantasyTeams: pointsRefresh.recalculatedFantasyTeams,
        leaderboardRebuiltForMatchdayId: pointsRefresh.leaderboardMatchdayId,
      },
    });

    return {
      success: true,
      deletedMatchdayId: matchdayId,
      deletedFixtures: deletedFixtures.affected ?? 0,
      deletedScoreEvents: deletedScoreEvents.affected ?? 0,
      deletedScoreLogs: deletedScoreLogs.affected ?? 0,
      deletedTransfers: deletedTransfers.affected ?? 0,
      deletedChipActivations: deletedChipActivations.affected ?? 0,
      deletedLeaderboardEntries: deletedLeaderboardEntries.affected ?? 0,
      deletedLocks: deletedLocks.affected ?? 0,
      recalculatedPlayers: pointsRefresh.recalculatedPlayers,
      recalculatedFantasyTeams: pointsRefresh.recalculatedFantasyTeams,
      leaderboardRebuiltForMatchdayId: pointsRefresh.leaderboardMatchdayId,
    };
  }

  async updateFixtureOps(fixtureId: string, dto: UpdateFixtureAdminDto) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: { tournament: true, matchday: true, homeTeam: true, awayTeam: true, group: true },
    });

    if (!fixture) {
      throw new NotFoundException('Fixture not found.');
    }

    const actor = dto.updatedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.updatedByUserId } })
      : null;

    const beforeState = {
      phase: fixture.phase,
      status: fixture.status,
      kickoffAt: fixture.kickoffAt,
      venue: fixture.venue,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      currentMinute: fixture.currentMinute,
      matchdayId: fixture.matchday?.id ?? null,
      groupId: fixture.group?.id ?? null,
      homeTeamId: fixture.homeTeam.id,
      awayTeamId: fixture.awayTeam.id,
      externalProviderId: fixture.externalProviderId,
    };

    if (dto.homeTeamId && dto.awayTeamId && dto.homeTeamId === dto.awayTeamId) {
      throw new BadRequestException('Home team and away team must be different.');
    }

    if (dto.matchdayId !== undefined) {
      if (dto.matchdayId === null || dto.matchdayId === '') {
        fixture.matchday = null;
      } else {
        const matchday = await this.matchdaysRepository.findOne({ where: { id: dto.matchdayId } });
        if (!matchday) {
          throw new NotFoundException('Matchday not found.');
        }
        fixture.matchday = matchday;
      }
    }

    if (dto.groupId !== undefined) {
      if (dto.groupId === null || dto.groupId === '') {
        fixture.group = null;
      } else {
        const group = await this.groupsRepository.findOne({ where: { id: dto.groupId } });
        if (!group) {
          throw new NotFoundException('Group not found.');
        }
        fixture.group = group;
      }
    }

    if (dto.homeTeamId) {
      const homeTeam = await this.teamsRepository.findOne({ where: { id: dto.homeTeamId } });
      if (!homeTeam) {
        throw new NotFoundException('Home team not found.');
      }
      fixture.homeTeam = homeTeam;
    }

    if (dto.awayTeamId) {
      const awayTeam = await this.teamsRepository.findOne({ where: { id: dto.awayTeamId } });
      if (!awayTeam) {
        throw new NotFoundException('Away team not found.');
      }
      fixture.awayTeam = awayTeam;
    }

    if (dto.phase !== undefined) {
      fixture.phase = dto.phase;
    }

    if (dto.status !== undefined) {
      fixture.status = dto.status;
    }

    if (dto.kickoffAt !== undefined) {
      fixture.kickoffAt = new Date(dto.kickoffAt);
    }

    if (dto.venue !== undefined) {
      fixture.venue = dto.venue.trim();
    }

    if (dto.homeScore !== undefined) {
      fixture.homeScore = dto.homeScore;
    }

    if (dto.awayScore !== undefined) {
      fixture.awayScore = dto.awayScore;
    }

    if (dto.currentMinute !== undefined) {
      fixture.currentMinute = dto.currentMinute;
    }

    if (dto.externalProviderId !== undefined) {
      fixture.externalProviderId = dto.externalProviderId?.trim() || null;
    }

    const updatedFixture = await this.fixturesRepository.save(fixture);

    await this.recordAuditLog({
      actionType: 'fixture_ops_update',
      targetType: 'fixture',
      targetId: updatedFixture.id,
      reason: dto.reason ?? 'fixture_ops_update',
      actor,
      beforeState,
      afterState: {
        phase: updatedFixture.phase,
        status: updatedFixture.status,
        kickoffAt: updatedFixture.kickoffAt,
        venue: updatedFixture.venue,
        homeScore: updatedFixture.homeScore,
        awayScore: updatedFixture.awayScore,
        currentMinute: updatedFixture.currentMinute,
        matchdayId: updatedFixture.matchday?.id ?? null,
        groupId: updatedFixture.group?.id ?? null,
        homeTeamId: updatedFixture.homeTeam.id,
        awayTeamId: updatedFixture.awayTeam.id,
        externalProviderId: updatedFixture.externalProviderId,
      },
    });

    return this.fixturesRepository.findOne({
      where: { id: updatedFixture.id },
      relations: { tournament: true, matchday: true, homeTeam: true, awayTeam: true, group: true },
    });
  }

  async deleteFixtureOps(fixtureId: string, dto: DeleteFixtureAdminDto) {
    const fixture = await this.fixturesRepository.findOne({
      where: { id: fixtureId },
      relations: { tournament: true, matchday: true, homeTeam: true, awayTeam: true, group: true },
    });

    if (!fixture) {
      throw new NotFoundException('Fixture not found.');
    }

    const actor = dto.deletedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.deletedByUserId } })
      : null;

    const affectedPlayerIds = await this.collectAffectedPlayerIdsByFixtureIds([fixtureId]);
    const deletedScoreEvents = await this.playerScoreEventsRepository.createQueryBuilder().delete().where('fixture_id = :fixtureId', { fixtureId }).execute();
    const deletedScoreLogs = await this.playerScoreLogsRepository.createQueryBuilder().delete().where('fixture_id = :fixtureId', { fixtureId }).execute();
    const deletedLeaderboardEntries = fixture.matchday
      ? await this.leaderboardEntriesRepository.createQueryBuilder().delete().where('matchday_id = :matchdayId', { matchdayId: fixture.matchday.id }).execute()
      : { affected: 0 };
    const deletedFixture = await this.fixturesRepository.delete(fixtureId);
    const pointsRefresh = await this.recalculatePointsAfterFixtureDataDeletion({
      affectedPlayerIds,
      tournamentId: fixture.tournament.id,
      preferredMatchdayId: fixture.matchday?.id ?? null,
    });

    await this.recordAuditLog({
      actionType: 'fixture_ops_delete',
      targetType: 'fixture',
      targetId: fixtureId,
      reason: dto.reason ?? 'fixture_ops_delete',
      actor,
      beforeState: {
        matchdayId: fixture.matchday?.id ?? null,
        homeTeamId: fixture.homeTeam.id,
        awayTeamId: fixture.awayTeam.id,
      },
      afterState: {
        deletedFixture: deletedFixture.affected ?? 0,
        deletedScoreEvents: deletedScoreEvents.affected ?? 0,
        deletedScoreLogs: deletedScoreLogs.affected ?? 0,
        deletedLeaderboardEntries: deletedLeaderboardEntries.affected ?? 0,
        recalculatedPlayers: pointsRefresh.recalculatedPlayers,
        recalculatedFantasyTeams: pointsRefresh.recalculatedFantasyTeams,
        leaderboardRebuiltForMatchdayId: pointsRefresh.leaderboardMatchdayId,
      },
    });

    return {
      success: true,
      deletedFixtureId: fixtureId,
      deletedFixture: deletedFixture.affected ?? 0,
      deletedScoreEvents: deletedScoreEvents.affected ?? 0,
      deletedScoreLogs: deletedScoreLogs.affected ?? 0,
      deletedLeaderboardEntries: deletedLeaderboardEntries.affected ?? 0,
      recalculatedPlayers: pointsRefresh.recalculatedPlayers,
      recalculatedFantasyTeams: pointsRefresh.recalculatedFantasyTeams,
      leaderboardRebuiltForMatchdayId: pointsRefresh.leaderboardMatchdayId,
    };
  }

  private async collectAffectedPlayerIdsByFixtureIds(fixtureIds: string[]) {
    if (fixtureIds.length === 0) {
      return [] as string[];
    }

    const [scoreLogPlayerRows, scoreEventPlayerRows] = await Promise.all([
      this.playerScoreLogsRepository
        .createQueryBuilder('scoreLog')
        .select('DISTINCT scoreLog.player_id', 'playerId')
        .where('scoreLog.fixture_id IN (:...fixtureIds)', { fixtureIds })
        .getRawMany<{ playerId: string | null }>(),
      this.playerScoreEventsRepository
        .createQueryBuilder('scoreEvent')
        .select('DISTINCT scoreEvent.player_id', 'playerId')
        .where('scoreEvent.fixture_id IN (:...fixtureIds)', { fixtureIds })
        .getRawMany<{ playerId: string | null }>(),
    ]);

    return Array.from(new Set(
      [...scoreLogPlayerRows, ...scoreEventPlayerRows]
        .map((row) => row.playerId)
        .filter((playerId): playerId is string => typeof playerId === 'string' && playerId.length > 0),
    ));
  }

  private async recalculatePointsAfterFixtureDataDeletion(input: {
    affectedPlayerIds: string[];
    tournamentId: string;
    preferredMatchdayId?: string | null;
  }) {
    const pointsRefresh = await this.recalculateTournamentPointsFromScoreLogs(input.tournamentId);

    const leaderboardMatchdayId = await this.resolveLeaderboardMatchdayForTournament(
      input.tournamentId,
      input.preferredMatchdayId ?? undefined,
    );

    if (leaderboardMatchdayId) {
      await this.leaderboardsService.materializeForMatchday(leaderboardMatchdayId);
    } else {
      const fantasyTeamIds = (await this.fantasyTeamsRepository
        .createQueryBuilder('fantasyTeam')
        .select('fantasyTeam.id', 'id')
        .where('fantasyTeam.tournament_id = :tournamentId', { tournamentId: input.tournamentId })
        .getRawMany<{ id: string }>()).map((row) => row.id);

      if (fantasyTeamIds.length > 0) {
        await this.leaderboardEntriesRepository
          .createQueryBuilder()
          .delete()
          .where('fantasy_team_id IN (:...fantasyTeamIds)', { fantasyTeamIds })
          .execute();
      }
    }

    return {
      recalculatedPlayers: pointsRefresh.recalculatedPlayers,
      recalculatedFantasyTeams: pointsRefresh.recalculatedFantasyTeams,
      leaderboardMatchdayId,
    };
  }

  private async recalculateTournamentPointsFromScoreLogs(tournamentId: string) {
    const tournamentPlayers = await this.playersRepository
      .createQueryBuilder('player')
      .leftJoin('player.team', 'team')
      .where('team.tournament_id = :tournamentId', { tournamentId })
      .getMany();

    const playerPointRows = await this.playerScoreLogsRepository
      .createQueryBuilder('scoreLog')
      .select('scoreLog.player_id', 'playerId')
      .addSelect('COALESCE(SUM(scoreLog.total_points), 0)', 'totalPoints')
      .innerJoin('scoreLog.fixture', 'fixture')
      .where('fixture.tournament_id = :tournamentId', { tournamentId })
      .groupBy('scoreLog.player_id')
      .getRawMany<{ playerId: string; totalPoints: string }>();

    const pointsByPlayerId = new Map(
      playerPointRows.map((row) => [row.playerId, Number(row.totalPoints) || 0]),
    );

    for (const player of tournamentPlayers) {
      player.totalPoints = pointsByPlayerId.get(player.id) ?? 0;
    }
    if (tournamentPlayers.length > 0) {
      await this.playersRepository.save(tournamentPlayers);
    }

    const fantasyTeams = await this.fantasyTeamsRepository.find({
      where: { tournament: { id: tournamentId } },
      relations: { picks: true },
    });

    const allPicks = fantasyTeams.flatMap((team) => team.picks);
    for (const pick of allPicks) {
      pick.livePoints = pointsByPlayerId.get(pick.playerId) ?? 0;
    }
    if (allPicks.length > 0) {
      await this.fantasyPicksRepository.save(allPicks);
    }

    for (const fantasyTeam of fantasyTeams) {
      fantasyTeam.totalPoints = fantasyTeam.picks.reduce((sum, pick) => {
        if (pick.isBenched) {
          return sum;
        }

        return sum + (pick.livePoints ?? 0) * Math.max(pick.multiplier ?? 1, 1);
      }, 0);
    }
    if (fantasyTeams.length > 0) {
      await this.fantasyTeamsRepository.save(fantasyTeams);
    }

    return {
      recalculatedPlayers: tournamentPlayers.length,
      recalculatedFantasyTeams: fantasyTeams.length,
    };
  }

  private async resolveTournamentIdForLeaderboardRefresh(matchdayId?: string) {
    if (matchdayId) {
      const matchday = await this.matchdaysRepository.findOne({
        where: { id: matchdayId },
        relations: { tournament: true },
      });

      if (!matchday) {
        throw new NotFoundException('Matchday not found for leaderboard refresh.');
      }

      return matchday.tournament.id;
    }

    const tournament = await this.getLatestTournamentOrThrow();
    return tournament.id;
  }

  private async resolveLeaderboardMatchdayForTournament(tournamentId: string, preferredMatchdayId?: string) {
    if (preferredMatchdayId) {
      const preferredMatchday = await this.matchdaysRepository.findOne({
        where: { id: preferredMatchdayId, tournament: { id: tournamentId } },
        relations: { tournament: true },
      });

      if (preferredMatchday) {
        return preferredMatchday.id;
      }
    }

    const [latestMatchday] = await this.matchdaysRepository.find({
      where: { tournament: { id: tournamentId } },
      relations: { tournament: true },
      order: { number: 'DESC', createdAt: 'DESC' },
      take: 1,
    });

    return latestMatchday?.id ?? null;
  }

  async unlockMatchday(dto: UnlockMatchdayAdminDto) {
    const status = await this.deadlineLockService.getMatchdayLockStatus(dto.matchdayId);
    if (!status.isLocked || !status.lock) {
      throw new BadRequestException('Matchday is not locked.');
    }

    const matchday = await this.matchdaysRepository.findOne({
      where: { id: status.matchdayId },
      relations: { tournament: true },
    });

    if (!matchday) {
      throw new NotFoundException('Matchday not found.');
    }

    const actor = dto.unlockedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.unlockedByUserId } })
      : null;

    status.lock.unlockedAt = new Date();
    status.lock.isActive = false;
    await this.matchdayLocksRepository.save(status.lock);

    matchday.status = MatchdayStatus.OPEN;
    matchday.locksAt = null;
    await this.matchdaysRepository.save(matchday);

    const tournament = await this.tournamentsRepository.findOne({ where: { id: matchday.tournament.id } });
    if (tournament && tournament.status === TournamentStatus.DEADLINE_LOCKED) {
      tournament.status = TournamentStatus.MATCHDAY_OPEN;
      if (tournament.currentMatchdayNumber === matchday.number) {
        tournament.currentPhase = matchday.phase as TournamentPhase;
      }
      await this.tournamentsRepository.save(tournament);
    }

    await this.recordAuditLog({
      actionType: 'matchday_unlock',
      targetType: 'matchday',
      targetId: matchday.id,
      reason: dto.reason ?? 'manual_unlock',
      actor,
      beforeState: {
        lockId: status.lock.id,
        lockReason: status.lock.reason,
        matchdayStatus: MatchdayStatus.LOCKED,
      },
      afterState: {
        lockId: status.lock.id,
        unlockedAt: status.lock.unlockedAt,
        matchdayStatus: matchday.status,
      },
    });

    return {
      message: 'Matchday unlocked successfully.',
      matchday,
      lock: status.lock,
    };
  }

  async completePostDeadlineUpdate(dto: CompletePostDeadlineUpdateDto) {
    const status = await this.deadlineLockService.getMatchdayLockStatus(dto.matchdayId);
    if (!status.isLocked || !status.lock) {
      throw new BadRequestException('Matchday must be locked before completing post-deadline update.');
    }

    const matchday = await this.matchdaysRepository.findOne({
      where: { id: status.matchdayId },
      relations: { tournament: true },
    });

    if (!matchday) {
      throw new NotFoundException('Matchday not found.');
    }

    const updateEndsAtMs = new Date(matchday.deadlineAt).getTime() + 60 * 60 * 1000;
    const nowMs = Date.now();
    if (!dto.force && nowMs < updateEndsAtMs) {
      const minutesRemaining = Math.max(1, Math.ceil((updateEndsAtMs - nowMs) / 60_000));
      throw new BadRequestException(`Post-deadline update window is still active for ${minutesRemaining} minute(s).`);
    }

    const actor = dto.requestedByUserId
      ? await this.usersRepository.findOne({ where: { id: dto.requestedByUserId } })
      : null;

    const tournament = await this.tournamentsRepository.findOne({ where: { id: matchday.tournament.id } });
    if (!tournament) {
      throw new NotFoundException('Tournament not found.');
    }

    const beforeState = {
      matchdayId: matchday.id,
      matchdayNumber: matchday.number,
      matchdayStatus: matchday.status,
      tournamentStatus: tournament.status,
      tournamentCurrentMatchdayNumber: tournament.currentMatchdayNumber,
      tournamentCurrentPhase: tournament.currentPhase,
    };

    matchday.status = MatchdayStatus.LIVE;
    await this.matchdaysRepository.save(matchday);

    const nextMatchday = await this.matchdaysRepository.findOne({
      where: {
        tournament: { id: tournament.id },
        number: matchday.number + 1,
      },
      relations: { tournament: true },
    });

    if (nextMatchday) {
      if (nextMatchday.status === MatchdayStatus.LOCKED) {
        nextMatchday.status = MatchdayStatus.OPEN;
      }

      if (!nextMatchday.opensAt) {
        nextMatchday.opensAt = new Date();
      }

      await this.matchdaysRepository.save(nextMatchday);

      tournament.currentMatchdayNumber = nextMatchday.number;
      tournament.currentPhase = nextMatchday.phase as TournamentPhase;
      tournament.status = TournamentStatus.MATCHDAY_OPEN;
    } else {
      tournament.status = TournamentStatus.LIVE_SCORING;
    }

    const updatedTournament = await this.tournamentsRepository.save(tournament);

    await this.leaguesService.finalizeCupProgressionForMatchday(matchday.id);

    await this.recordAuditLog({
      actionType: 'deadline_post_update_complete',
      targetType: 'matchday',
      targetId: matchday.id,
      reason: dto.reason ?? 'deadline_post_update_complete',
      actor,
      beforeState,
      afterState: {
        matchdayStatus: matchday.status,
        tournamentStatus: updatedTournament.status,
        tournamentCurrentMatchdayNumber: updatedTournament.currentMatchdayNumber,
        tournamentCurrentPhase: updatedTournament.currentPhase,
        nextMatchdayId: nextMatchday?.id ?? null,
        nextMatchdayNumber: nextMatchday?.number ?? null,
      },
    });

    this.realtimeEventsService.emitScoringUpdated({
      type: 'deadline_post_update_complete',
      matchdayId: matchday.id,
      matchdayNumber: matchday.number,
      nextMatchdayId: nextMatchday?.id ?? null,
      nextMatchdayNumber: nextMatchday?.number ?? null,
      tournamentStatus: updatedTournament.status,
      tournamentCurrentMatchdayNumber: updatedTournament.currentMatchdayNumber,
    });

    return {
      success: true,
      message: nextMatchday
        ? `Post-deadline update completed. Matchday ${matchday.number} is live and planning moved to Matchday ${nextMatchday.number}.`
        : `Post-deadline update completed. Matchday ${matchday.number} is live.`,
      matchday,
      nextMatchday,
      tournament: updatedTournament,
      loginWindow: {
        availableAt: new Date(updateEndsAtMs).toISOString(),
        forced: Boolean(dto.force),
      },
    };
  }

  private async recordAuditLog(input: {
    actionType: string;
    targetType: string;
    targetId: string;
    reason: string;
    actor: UserEntity | null;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
  }) {
    return this.adminAuditLogsRepository.save(
      this.adminAuditLogsRepository.create({
        actionType: input.actionType,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        actor: input.actor,
        beforeState: input.beforeState,
        afterState: input.afterState,
      }),
    );
  }

  private async notifyAllUsers(input: {
    type: string;
    title: string;
    body: string;
    payload: Record<string, unknown>;
  }) {
    const users = await this.usersRepository.find();
    if (users.length === 0) {
      return [];
    }

    return this.notificationsService.createNotificationsForUsers(
      users.map((user) => ({
        userId: user.id,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload,
      })),
    );
  }
}
