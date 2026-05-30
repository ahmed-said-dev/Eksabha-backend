import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';

import { CreateLeagueDto } from './dto/create-league.dto';
import { JoinLeagueDto } from './dto/join-league.dto';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { LeaderboardEntryEntity } from '../leaderboards/entities/leaderboard-entry.entity';
import { MatchdayEntity, MatchdayStatus } from '../tournament/entities/matchday.entity';
import { TournamentEntity } from '../tournament/entities/tournament.entity';
import { UserEntity } from '../users/entities/user.entity';
import { CupEntryEntity } from './entities/cup-entry.entity';
import { CupFixtureEntity } from './entities/cup-fixture.entity';
import { CupRoundEntity } from './entities/cup-round.entity';
import { CupEntity } from './entities/cup.entity';
import { LeagueHeadToHeadFixtureEntity } from './entities/league-head-to-head-fixture.entity';
import {
  LeagueJoinSource,
  LeagueMembershipEntity,
  LeagueMembershipRole,
  LeagueMembershipStatus,
} from './entities/league-membership.entity';
import { LeaguePendingEntryEntity, LeaguePendingEntryStatus } from './entities/league-pending-entry.entity';
import {
  LeagueCategory,
  LeagueEntity,
  LeagueScoringMode,
  LeagueStatus,
  LeagueType,
} from './entities/league.entity';

const PRIVATE_JOIN_LIMIT = 25;
const PUBLIC_JOIN_LIMIT = 5;

type LeagueMovement = 'up' | 'down' | 'same';

@Injectable()
export class LeaguesService {
  constructor(
    @InjectRepository(LeagueEntity)
    private readonly leaguesRepository: Repository<LeagueEntity>,
    @InjectRepository(LeagueMembershipEntity)
    private readonly leagueMembershipsRepository: Repository<LeagueMembershipEntity>,
    @InjectRepository(LeaguePendingEntryEntity)
    private readonly leaguePendingEntriesRepository: Repository<LeaguePendingEntryEntity>,
    @InjectRepository(LeagueHeadToHeadFixtureEntity)
    private readonly leagueHeadToHeadFixturesRepository: Repository<LeagueHeadToHeadFixtureEntity>,
    @InjectRepository(CupEntity)
    private readonly cupsRepository: Repository<CupEntity>,
    @InjectRepository(CupEntryEntity)
    private readonly cupEntriesRepository: Repository<CupEntryEntity>,
    @InjectRepository(CupRoundEntity)
    private readonly cupRoundsRepository: Repository<CupRoundEntity>,
    @InjectRepository(CupFixtureEntity)
    private readonly cupFixturesRepository: Repository<CupFixtureEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(TournamentEntity)
    private readonly tournamentsRepository: Repository<TournamentEntity>,
    @InjectRepository(FantasyTeamEntity)
    private readonly fantasyTeamsRepository: Repository<FantasyTeamEntity>,
    @InjectRepository(MatchdayEntity)
    private readonly matchdaysRepository: Repository<MatchdayEntity>,
    @InjectRepository(LeaderboardEntryEntity)
    private readonly leaderboardEntriesRepository: Repository<LeaderboardEntryEntity>,
  ) {}

  async getLeaguesOverviewForUser(userId: string, tournamentId?: string) {
    const user = await this.resolveUserOrThrow(userId);
    const tournament = await this.resolveTournament(tournamentId);
    const leagues = await this.loadLeaguesForTournament(tournament?.id ?? null);
    const memberships = await this.loadMembershipsForUser(userId, leagues.map((league) => league.id));
    const memberLeagueIds = new Set(memberships.map((membership) => membership.league.id));
    const fantasyTeam = await this.resolveFantasyTeamForUser(userId, tournament?.id ?? null);
    const currentMatchday = tournament ? await this.resolveCurrentMatchday(tournament.id) : null;
    const countsByLeagueId = await this.loadLeagueMemberCounts(leagues.map((league) => league.id));
    const overallEntriesByLeagueId = fantasyTeam
      ? await this.loadUserLeagueEntriesByLeagueId(fantasyTeam.id, leagues.map((league) => league.id))
      : new Map<string, LeaderboardEntryEntity>();
    const matchdayEntriesByLeagueId = fantasyTeam && currentMatchday
      ? await this.loadUserLeagueEntriesByLeagueId(fantasyTeam.id, leagues.map((league) => league.id), currentMatchday.id)
      : new Map<string, LeaderboardEntryEntity>();

    const visibleLeagues = leagues.filter((league) => {
      if (memberLeagueIds.has(league.id)) {
        return true;
      }

      return [LeagueType.GLOBAL, LeagueType.COUNTRY, LeagueType.SYSTEM].includes(league.type)
        || league.category !== LeagueCategory.CUSTOM;
    });

    const cards = visibleLeagues.map((league) => this.buildLeagueOverviewCard({
      league,
      currentMatchday,
      countsByLeagueId,
      overallEntry: overallEntriesByLeagueId.get(league.id) ?? null,
      matchdayEntry: matchdayEntriesByLeagueId.get(league.id) ?? null,
      isMember: memberLeagueIds.has(league.id),
    }));

    const classicLeagues = cards.filter((card) =>
      card.scoringMode === LeagueScoringMode.CLASSIC
      && card.category === LeagueCategory.CUSTOM,
    );
    const headToHeadLeagues = cards.filter((card) => card.scoringMode === LeagueScoringMode.HEAD_TO_HEAD);
    const generalLeagues = cards.filter((card) =>
      card.category !== LeagueCategory.CUSTOM
      || [LeagueType.GLOBAL, LeagueType.COUNTRY, LeagueType.SYSTEM, LeagueType.PUBLIC].includes(card.type),
    );

    return {
      user: {
        id: user.id,
        displayName: user.profile?.displayName ?? null,
        teamName: user.profile?.teamName ?? null,
      },
      tournament,
      currentMatchday: currentMatchday
        ? {
            id: currentMatchday.id,
            number: currentMatchday.number,
            status: currentMatchday.status,
          }
        : null,
      limits: {
        privateLeagueLimit: PRIVATE_JOIN_LIMIT,
        publicLeagueLimit: PUBLIC_JOIN_LIMIT,
        joinedPrivateLeagues: memberships.filter((membership) => membership.league.type === LeagueType.PRIVATE).length,
        joinedPublicLeagues: memberships.filter((membership) => membership.league.type === LeagueType.PUBLIC).length,
      },
      sections: {
        classicLeagues,
        headToHeadLeagues,
        generalLeagues,
      },
    };
  }

  async getCupsOverviewForUser(userId: string, tournamentId?: string) {
    const tournament = await this.resolveTournament(tournamentId);
    const cupsQuery = this.cupsRepository
      .createQueryBuilder('cup')
      .leftJoinAndSelect('cup.league', 'league')
      .orderBy('cup.createdAt', 'DESC');

    if (tournament) {
      cupsQuery.where('(cup.tournament_id = :tournamentId OR cup.tournament_id IS NULL)', {
        tournamentId: tournament.id,
      });
    }

    const cups = await cupsQuery.getMany();

    const userEntries = await this.cupEntriesRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.cup', 'cup')
      .leftJoinAndSelect('cup.league', 'league')
      .leftJoinAndSelect('entry.membership', 'membership')
      .where('membership.user_id = :userId', { userId })
      .getMany();

    const memberCupIds = new Set(userEntries.map((entry) => entry.cup.id));

    const leagueCups = cups
      .filter((cup) => cup.league && memberCupIds.has(cup.id))
      .map((cup) => this.buildCupOverviewCard(cup));
    const generalCups = cups
      .filter((cup) => !cup.league)
      .map((cup) => this.buildCupOverviewCard(cup));

    return {
      tournament,
      sections: {
        leagueCups,
        generalCups,
      },
    };
  }

  async getCreateJoinOptionsForUser(userId: string, tournamentId?: string) {
    const tournament = await this.resolveTournament(tournamentId);
    const leagues = await this.loadLeaguesForTournament(tournament?.id ?? null);
    const memberships = await this.loadMembershipsForUser(userId, leagues.map((league) => league.id));
    const memberLeagueIds = new Set(memberships.map((membership) => membership.league.id));
    const countsByLeagueId = await this.loadLeagueMemberCounts(leagues.map((league) => league.id));

    const publicLeagues = leagues
      .filter((league) => league.type === LeagueType.PUBLIC && !memberLeagueIds.has(league.id) && !league.isJoinLocked)
      .map((league) => ({
        id: league.id,
        name: league.name,
        memberCount: countsByLeagueId.get(league.id) ?? 0,
        scoringMode: league.scoringMode,
      }));

    const appLeague = leagues.find((league) => league.category === LeagueCategory.APP || league.systemKey === 'app-owned-league') ?? null;

    return {
      tournament,
      limits: {
        privateLeagueLimit: PRIVATE_JOIN_LIMIT,
        publicLeagueLimit: PUBLIC_JOIN_LIMIT,
        joinedPrivateLeagues: memberships.filter((membership) => membership.league.type === LeagueType.PRIVATE).length,
        joinedPublicLeagues: memberships.filter((membership) => membership.league.type === LeagueType.PUBLIC).length,
      },
      joinOptions: {
        privateLeague: {
          enabled: true,
          label: 'Join Private League',
        },
        publicLeagues,
        appLeague: appLeague
          ? {
              id: appLeague.id,
              name: appLeague.name,
            }
          : null,
      },
      createOptions: [
        {
          scoringMode: LeagueScoringMode.CLASSIC,
          label: 'Create Classic League',
          description: 'Teams are ranked by total points and users can keep joining throughout the season.',
        },
        {
          scoringMode: LeagueScoringMode.HEAD_TO_HEAD,
          label: 'Create Head-to-head League',
          description: 'Teams face each other each matchday and the league locks once fixtures are generated.',
        },
      ],
    };
  }

  async getLeaguesForFantasyTeam(fantasyTeamId: string) {
    const fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: { id: fantasyTeamId },
      relations: { tournament: true },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found.');
    }

    const currentMatchday = fantasyTeam.tournament ? await this.resolveCurrentMatchday(fantasyTeam.tournament.id) : null;
    const leagues = await this.loadLeaguesForTournament(fantasyTeam.tournament?.id ?? null);
    const leagueIds = leagues.map((league) => league.id);
    const countsByLeagueId = await this.loadLeagueMemberCounts(leagueIds);
    const memberships = leagueIds.length === 0
      ? []
      : await this.leagueMembershipsRepository
        .createQueryBuilder('membership')
        .leftJoinAndSelect('membership.league', 'league')
        .leftJoinAndSelect('membership.fantasyTeam', 'fantasyTeam')
        .where('membership.fantasy_team_id = :fantasyTeamId', { fantasyTeamId })
        .andWhere('membership.league_id IN (:...leagueIds)', { leagueIds })
        .andWhere('membership.status = :status', { status: LeagueMembershipStatus.ACTIVE })
        .getMany();
    const memberLeagueIds = new Set(memberships.map((membership) => membership.league.id));
    const entriesByLeagueId = await this.loadUserLeagueEntriesByLeagueId(fantasyTeamId, leagueIds, currentMatchday?.id);
    const overallEntriesByLeagueId = await this.loadUserLeagueEntriesByLeagueId(fantasyTeamId, leagueIds);

    return leagues
      .filter((league) => memberLeagueIds.has(league.id))
      .map((league) => this.buildLeagueOverviewCard({
        league,
        currentMatchday,
        countsByLeagueId,
        overallEntry: overallEntriesByLeagueId.get(league.id) ?? null,
        matchdayEntry: entriesByLeagueId.get(league.id) ?? null,
        isMember: true,
      }));
  }

  async getLeagues() {
    return this.leaguesRepository.find({
      relations: { owner: { profile: true }, tournament: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getLeagueById(leagueId: string) {
    const league = await this.leaguesRepository.findOne({
      where: { id: leagueId },
      relations: { owner: { profile: true }, tournament: true, memberships: { user: { profile: true }, fantasyTeam: true } },
    });

    if (!league) {
      throw new NotFoundException('League not found.');
    }

    return league;
  }

  async getLeagueMemberships(leagueId: string) {
    const league = await this.leaguesRepository.findOne({ where: { id: leagueId } });
    if (!league) {
      throw new NotFoundException('League not found.');
    }

    return this.leagueMembershipsRepository.find({
      where: { league: { id: leagueId } },
      relations: { user: { profile: true }, league: true, fantasyTeam: true },
      order: { joinedAt: 'ASC' },
    });
  }

  async getLeagueDetailForUser(userId: string, leagueId: string, scopeKey?: string) {
    const league = await this.getLeagueById(leagueId);
    const user = await this.resolveUserOrThrow(userId);
    const selectedScopeKey = scopeKey?.trim() || 'overall';

    const standingsQuery = this.leaderboardEntriesRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.fantasyTeam', 'fantasyTeam')
      .leftJoinAndSelect('fantasyTeam.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('entry.league_id = :leagueId', { leagueId })
      .andWhere('entry.scope = :scope', { scope: 'league' })
      .andWhere('entry.matchday_id IS NULL');

    if (selectedScopeKey === 'overall') {
      standingsQuery.andWhere('(entry.scope_key IS NULL OR entry.scope_key = :overallScopeKey)', { overallScopeKey: 'overall' });
    } else {
      standingsQuery.andWhere('entry.scope_key = :scopeKey', { scopeKey: selectedScopeKey });
    }

    const standings = await standingsQuery.orderBy('entry.rank', 'ASC').getMany();

    const pendingEntries = await this.leaguePendingEntriesRepository.find({
      where: { league: { id: leagueId }, status: LeaguePendingEntryStatus.PENDING },
      relations: { membership: { user: { profile: true }, fantasyTeam: true }, activationMatchday: true },
      order: { createdAt: 'ASC' },
    });

    const linkedCups = await this.cupsRepository.find({
      where: { league: { id: leagueId } },
      relations: { rounds: true },
      order: { createdAt: 'ASC' },
    });

    const h2hFixtures = league.scoringMode === LeagueScoringMode.HEAD_TO_HEAD
      ? await this.leagueHeadToHeadFixturesRepository.find({
          where: { league: { id: leagueId } },
          relations: {
            homeMembership: { user: { profile: true }, fantasyTeam: true },
            awayMembership: { user: { profile: true }, fantasyTeam: true },
            winnerMembership: { user: { profile: true }, fantasyTeam: true },
            matchday: true,
          },
          order: { roundNumber: 'ASC', matchdayNumber: 'ASC' },
          take: 12,
        })
      : [];

    const monthlyScopeKeys = Array.from(
      new Set(
        standings
          .map((entry) => entry.scopeKey)
          .filter((value): value is string => typeof value === 'string' && value.length > 0 && value !== 'overall'),
      ),
    );

    if (league.monthlyScopeKey && !monthlyScopeKeys.includes(league.monthlyScopeKey)) {
      monthlyScopeKeys.push(league.monthlyScopeKey);
    }

    const scopeOptions = [
      { key: 'overall', label: 'Overall' },
      ...monthlyScopeKeys.map((key) => ({ key, label: this.formatScopeLabel(key) })),
    ];

    return {
      user: {
        id: user.id,
      },
      league: {
        id: league.id,
        displayId: this.buildLeagueDisplayId(league),
        name: league.name,
        scoringMode: league.scoringMode,
        type: league.type,
        status: league.status,
        category: league.category,
        joinCode: league.joinCode,
        badgeLabel: league.badgeLabel,
        badgeColor: league.badgeColor,
        memberCount: league.memberships.filter((membership) => membership.status !== LeagueMembershipStatus.LEFT).length,
        description: league.description,
      },
      tabs: {
        standingsCount: standings.length,
        newEntriesCount: pendingEntries.length,
      },
      filters: {
        selectedScopeKey,
        options: scopeOptions,
      },
      standings: standings.map((entry) => ({
        rank: entry.rank,
        previousRank: entry.previousRank,
        movement: this.buildMovement(entry.rank, entry.previousRank),
        gameweekPoints: entry.matchdayPoints,
        totalPoints: entry.totalPoints,
        teamName: entry.fantasyTeam.name,
        managerName: entry.fantasyTeam.user.profile?.displayName ?? entry.fantasyTeam.user.email ?? 'Manager',
        fantasyTeamId: entry.fantasyTeam.id,
        userId: entry.fantasyTeam.user.id,
        isCurrentUser: entry.fantasyTeam.user.id === user.id,
        sharedPlayers: [],
        differentialPlayers: [],
        captainName: null,
        liveSwing: 0,
        projectedOutcome: 'level' as const,
      })),
      newEntries: pendingEntries.map((pendingEntry) => ({
        id: pendingEntry.id,
        teamName: pendingEntry.membership.fantasyTeam?.name ?? pendingEntry.membership.entryNameSnapshot,
        managerName: pendingEntry.membership.user.profile?.displayName ?? pendingEntry.membership.managerNameSnapshot,
        activationMatchdayNumber: pendingEntry.activationMatchdayNumber,
        reason: pendingEntry.reason,
      })),
      cups: linkedCups.map((cup) => this.buildCupOverviewCard(cup)),
      headToHeadFixtures: h2hFixtures.map((fixture) => ({
        id: fixture.id,
        roundNumber: fixture.roundNumber,
        matchdayNumber: fixture.matchdayNumber,
        status: fixture.status,
        homeTeamName: fixture.homeMembership?.fantasyTeam?.name ?? fixture.homeMembership?.entryNameSnapshot ?? null,
        awayTeamName: fixture.awayMembership?.fantasyTeam?.name ?? fixture.awayMembership?.entryNameSnapshot ?? null,
        homePoints: fixture.homePoints,
        awayPoints: fixture.awayPoints,
        winnerMembershipId: fixture.winnerMembership?.id ?? null,
      })),
    };
  }

  async createLeagueForUser(userId: string, dto: CreateLeagueDto) {
    const owner = await this.resolveUserOrThrow(userId);
    const tournament = await this.resolveTournament(dto.tournamentId);
    const fantasyTeam = await this.resolveFantasyTeamForUser(userId, tournament?.id ?? null);
    const scoringMode = dto.scoringMode ?? LeagueScoringMode.CLASSIC;

    const league = await this.leaguesRepository.save(
      this.leaguesRepository.create({
        name: dto.name.trim(),
        slug: dto.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        type: dto.isPublic ? LeagueType.PUBLIC : LeagueType.PRIVATE,
        scoringMode,
        status: LeagueStatus.OPEN,
        category: LeagueCategory.CUSTOM,
        joinCode: randomUUID().slice(0, 8).toUpperCase(),
        isPublic: dto.isPublic ?? false,
        isArchived: false,
        maxMembers: dto.maxMembers ?? 50,
        description: dto.description?.trim() || null,
        startsFromMatchdayNumber: dto.startsFromMatchdayNumber ?? null,
        allowAutoJoin: dto.isPublic ?? false,
        owner,
        tournament,
      }),
    );

    await this.leagueMembershipsRepository.save(
      this.leagueMembershipsRepository.create({
        league,
        user: owner,
        role: LeagueMembershipRole.OWNER,
        status: LeagueMembershipStatus.ACTIVE,
        joinSource: LeagueJoinSource.OWNER_CREATE,
        joinedAt: new Date(),
        leftAt: null,
        fantasyTeam,
        entryNameSnapshot: fantasyTeam?.name ?? owner.profile?.teamName ?? null,
        managerNameSnapshot: owner.profile?.displayName ?? owner.email ?? null,
        seedNumber: 1,
        isPendingNewEntry: false,
      }),
    );

    return this.getLeagueById(league.id);
  }

  async joinLeagueForUser(userId: string, dto: JoinLeagueDto) {
    const league = await this.leaguesRepository.findOne({
      where: { joinCode: dto.joinCode.trim().toUpperCase() },
      relations: { tournament: true, owner: { profile: true } },
    });

    if (!league) {
      throw new NotFoundException('League not found for the provided join code.');
    }

    return this.joinLeagueEntityForUser(userId, league, LeagueJoinSource.PRIVATE_CODE);
  }

  async joinPublicLeagueForUser(userId: string, leagueId: string) {
    const league = await this.leaguesRepository.findOne({
      where: { id: leagueId },
      relations: { tournament: true, owner: { profile: true } },
    });

    if (!league) {
      throw new NotFoundException('League not found.');
    }

    if (league.type !== LeagueType.PUBLIC && league.type !== LeagueType.SYSTEM) {
      throw new BadRequestException('This league is not open for public joining.');
    }

    return this.joinLeagueEntityForUser(userId, league, LeagueJoinSource.PUBLIC_AUTO);
  }

  private async joinLeagueEntityForUser(userId: string, league: LeagueEntity, joinSource: LeagueJoinSource) {
    const user = await this.resolveUserOrThrow(userId);

    if (league.isArchived || league.status === LeagueStatus.ARCHIVED) {
      throw new BadRequestException('This league is archived and cannot be joined.');
    }

    if (league.isJoinLocked || league.status === LeagueStatus.LOCKED) {
      throw new BadRequestException('This league is locked and cannot accept new entries.');
    }

    const existingMembership = await this.leagueMembershipsRepository.findOne({
      where: { league: { id: league.id }, user: { id: user.id } },
      relations: { league: true, user: true },
    });

    if (existingMembership && existingMembership.status !== LeagueMembershipStatus.LEFT) {
      return this.getLeagueById(league.id);
    }

    const activeMembershipCount = await this.leagueMembershipsRepository.count({
      where: [
        { league: { id: league.id }, status: LeagueMembershipStatus.ACTIVE },
        { league: { id: league.id }, status: LeagueMembershipStatus.PENDING },
      ],
    });

    if (activeMembershipCount >= league.maxMembers) {
      throw new ConflictException('This league has reached its maximum member limit.');
    }

    const tournament = league.tournament ?? await this.resolveTournament(null);
    const fantasyTeam = await this.resolveFantasyTeamForUser(userId, tournament?.id ?? null);
    const currentMatchday = tournament ? await this.resolveCurrentMatchday(tournament.id) : null;
    const nextMatchday = currentMatchday
      ? await this.matchdaysRepository.findOne({
          where: {
            tournament: { id: tournament?.id },
            number: currentMatchday.number + 1,
          },
        })
      : null;
    const activationMatchdayNumber = nextMatchday?.number ?? currentMatchday?.number ?? 1;
    const shouldPendEntry = true;

    const membership = await this.leagueMembershipsRepository.save(
      this.leagueMembershipsRepository.create({
        league,
        user,
        role: LeagueMembershipRole.MEMBER,
        status: shouldPendEntry ? LeagueMembershipStatus.PENDING : LeagueMembershipStatus.ACTIVE,
        joinSource,
        joinedAt: new Date(),
        leftAt: null,
        fantasyTeam,
        entryNameSnapshot: fantasyTeam?.name ?? user.profile?.teamName ?? null,
        managerNameSnapshot: user.profile?.displayName ?? user.email ?? null,
        seedNumber: null,
        isPendingNewEntry: shouldPendEntry,
      }),
    );

    if (shouldPendEntry) {
      await this.leaguePendingEntriesRepository.save(
        this.leaguePendingEntriesRepository.create({
          league,
          membership,
          status: LeaguePendingEntryStatus.PENDING,
          activationMatchdayNumber,
          activationMatchday: nextMatchday ?? null,
          sourceScopeKey: league.monthlyScopeKey,
          reason: 'Joined league successfully; entry is recorded in New Entries first and will move into standings on activation.',
        }),
      );
    }

    return this.getLeagueById(league.id);
  }

  private async resolveUserOrThrow(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId }, relations: { profile: true } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  private async resolveTournament(tournamentId?: string | null) {
    if (tournamentId) {
      const tournament = await this.tournamentsRepository.findOne({ where: { id: tournamentId } });
      if (!tournament) {
        throw new NotFoundException('Tournament not found.');
      }

      return tournament;
    }

    const [latestTournament] = await this.tournamentsRepository.find({
      order: { createdAt: 'DESC', year: 'DESC' },
      take: 1,
    });

    return latestTournament ?? null;
  }

  private async resolveFantasyTeamForUser(userId: string, tournamentId?: string | null) {
    if (!tournamentId) {
      return null;
    }

    return this.fantasyTeamsRepository.findOne({
      where: { user: { id: userId }, tournament: { id: tournamentId } },
      relations: { user: { profile: true }, tournament: true },
    });
  }

  private async resolveCurrentMatchday(tournamentId: string) {
    const [currentMatchday] = await this.matchdaysRepository.find({
      where: { tournament: { id: tournamentId } },
      order: { number: 'DESC', createdAt: 'DESC' },
      take: 1,
    });

    return currentMatchday ?? null;
  }

  private async loadLeaguesForTournament(tournamentId: string | null) {
    const query = this.leaguesRepository
      .createQueryBuilder('league')
      .leftJoinAndSelect('league.owner', 'owner')
      .leftJoinAndSelect('owner.profile', 'ownerProfile')
      .leftJoinAndSelect('league.tournament', 'tournament')
      .where('league.deleted_at IS NULL');

    if (tournamentId) {
      query.andWhere('(league.tournament_id = :tournamentId OR league.tournament_id IS NULL)', { tournamentId });
    }

    return query.orderBy('league.createdAt', 'DESC').getMany();
  }

  private async loadMembershipsForUser(userId: string, leagueIds: string[]) {
    if (leagueIds.length === 0) {
      return [];
    }

    return this.leagueMembershipsRepository
      .createQueryBuilder('membership')
      .leftJoinAndSelect('membership.league', 'league')
      .leftJoinAndSelect('membership.fantasyTeam', 'fantasyTeam')
      .leftJoinAndSelect('membership.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('membership.user_id = :userId', { userId })
      .andWhere('membership.league_id IN (:...leagueIds)', { leagueIds })
      .andWhere('membership.status IN (:...statuses)', {
        statuses: [LeagueMembershipStatus.ACTIVE, LeagueMembershipStatus.PENDING],
      })
      .getMany();
  }

  private async loadLeagueMemberCounts(leagueIds: string[]) {
    const counts = new Map<string, number>();

    if (leagueIds.length === 0) {
      return counts;
    }

    const rows = await this.leagueMembershipsRepository
      .createQueryBuilder('membership')
      .select('membership.league_id', 'leagueId')
      .addSelect('COUNT(*)', 'count')
      .where('membership.league_id IN (:...leagueIds)', { leagueIds })
      .andWhere('membership.status IN (:...statuses)', {
        statuses: [LeagueMembershipStatus.ACTIVE, LeagueMembershipStatus.PENDING],
      })
      .groupBy('membership.league_id')
      .getRawMany<{ leagueId: string; count: string }>();

    for (const row of rows) {
      counts.set(row.leagueId, Number.parseInt(row.count, 10) || 0);
    }

    return counts;
  }

  private async loadUserLeagueEntriesByLeagueId(
    fantasyTeamId: string,
    leagueIds: string[],
    matchdayId?: string,
  ) {
    const entries = new Map<string, LeaderboardEntryEntity>();

    if (leagueIds.length === 0) {
      return entries;
    }

    const query = this.leaderboardEntriesRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.league', 'league')
      .leftJoinAndSelect('entry.fantasyTeam', 'fantasyTeam')
      .where('entry.fantasy_team_id = :fantasyTeamId', { fantasyTeamId })
      .andWhere('entry.league_id IN (:...leagueIds)', { leagueIds })
      .andWhere('entry.scope = :scope', { scope: 'league' })
      .andWhere('entry.scope_type = :scopeType', { scopeType: 'overall' });

    if (matchdayId) {
      query.andWhere('entry.matchday_id = :matchdayId', { matchdayId });
    } else {
      query.andWhere('entry.matchday_id IS NULL');
    }

    const result = await query.getMany();
    for (const entry of result) {
      if (entry.league) {
        entries.set(entry.league.id, entry);
      }
    }

    return entries;
  }

  private buildLeagueOverviewCard(input: {
    league: LeagueEntity;
    currentMatchday: MatchdayEntity | null;
    countsByLeagueId: Map<string, number>;
    overallEntry: LeaderboardEntryEntity | null;
    matchdayEntry: LeaderboardEntryEntity | null;
    isMember: boolean;
  }) {
    return {
      id: input.league.id,
      displayId: this.buildLeagueDisplayId(input.league),
      name: input.league.name,
      type: input.league.type,
      scoringMode: input.league.scoringMode,
      category: input.league.category,
      status: input.league.status,
      memberCount: input.countsByLeagueId.get(input.league.id) ?? 0,
      rank: input.overallEntry?.rank ?? null,
      previousRank: input.overallEntry?.previousRank ?? null,
      movement: this.buildMovement(input.overallEntry?.rank ?? null, input.overallEntry?.previousRank ?? null),
      gameweekPoints: input.matchdayEntry?.matchdayPoints ?? input.overallEntry?.matchdayPoints ?? 0,
      totalPoints: input.overallEntry?.totalPoints ?? 0,
      joinCode: input.isMember ? input.league.joinCode : null,
      isMember: input.isMember,
      isJoinLocked: input.league.isJoinLocked,
      badgeLabel: input.league.badgeLabel,
      badgeColor: input.league.badgeColor,
      startsFromMatchdayNumber: input.league.startsFromMatchdayNumber,
      currentMatchdayNumber: input.currentMatchday?.number ?? null,
    };
  }

  private buildCupOverviewCard(cup: CupEntity) {
    return {
      id: cup.id,
      name: cup.name,
      type: cup.type,
      status: cup.status,
      leagueId: cup.league?.id ?? null,
      leagueName: cup.league?.name ?? null,
      badgeLabel: cup.badgeLabel,
      startMatchdayLabel: cup.startMatchdayNumber ? `GW${cup.startMatchdayNumber}` : null,
      entryCutoffMatchdayNumber: cup.entryCutoffMatchdayNumber,
    };
  }

  private buildMovement(rank: number | null, previousRank: number | null): LeagueMovement {
    if (!rank || !previousRank || rank === previousRank) {
      return 'same';
    }

    return rank < previousRank ? 'up' : 'down';
  }

  private buildLeagueDisplayId(league: LeagueEntity) {
    const numericFromCode = (league.joinCode ?? '').replace(/[^0-9]/g, '').slice(0, 6);
    if (numericFromCode.length >= 4) {
      return numericFromCode;
    }

    const fallback = Math.abs(this.hashString(league.id)).toString().slice(0, 6);
    return fallback.padStart(6, '0');
  }

  private hashString(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(index);
      hash |= 0;
    }

    return hash;
  }

  private formatScopeLabel(scopeKey: string) {
    return scopeKey
      .split(/[_-]/g)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }
}
