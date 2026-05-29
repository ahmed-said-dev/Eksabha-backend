import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChipType } from '../../common/database';
import { PlayerEntity } from '../catalog/entities/player.entity';
import { ChipActivationEntity } from '../fantasy/entities/chip-activation.entity';
import { FantasyPickEntity } from '../fantasy/entities/fantasy-pick.entity';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { TransferEntity } from '../fantasy/entities/transfer.entity';
import { LeaderboardEntryEntity } from '../leaderboards/entities/leaderboard-entry.entity';
import { NotificationEntity } from '../notifications/entities/notification.entity';
import { PlayerScoreEventEntity } from '../scoring/entities/player-score-event.entity';
import { PlayerScoreLogEntity } from '../scoring/entities/player-score-log.entity';
import { FixtureEntity } from '../tournament/entities/fixture.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { LeagueMembershipEntity } from '../leagues/entities/league-membership.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly userProfilesRepository: Repository<UserProfileEntity>,
    @InjectRepository(FantasyTeamEntity)
    private readonly fantasyTeamsRepository: Repository<FantasyTeamEntity>,
    @InjectRepository(FantasyPickEntity)
    private readonly fantasyPicksRepository: Repository<FantasyPickEntity>,
    @InjectRepository(TransferEntity)
    private readonly transfersRepository: Repository<TransferEntity>,
    @InjectRepository(ChipActivationEntity)
    private readonly chipActivationsRepository: Repository<ChipActivationEntity>,
    @InjectRepository(MatchdayEntity)
    private readonly matchdaysRepository: Repository<MatchdayEntity>,
    @InjectRepository(FixtureEntity)
    private readonly fixturesRepository: Repository<FixtureEntity>,
    @InjectRepository(LeaderboardEntryEntity)
    private readonly leaderboardEntriesRepository: Repository<LeaderboardEntryEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playersRepository: Repository<PlayerEntity>,
    @InjectRepository(PlayerScoreEventEntity)
    private readonly playerScoreEventsRepository: Repository<PlayerScoreEventEntity>,
    @InjectRepository(PlayerScoreLogEntity)
    private readonly playerScoreLogsRepository: Repository<PlayerScoreLogEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepository: Repository<NotificationEntity>,
    @InjectRepository(LeagueMembershipEntity)
    private readonly leagueMembershipsRepository: Repository<LeagueMembershipEntity>,
  ) {}

  async getUserProfile(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return this.buildUserResponse(user);
  }

  async getMoreOverview(userId: string, tournamentId?: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: tournamentId
        ? { user: { id: userId }, tournament: { id: tournamentId } }
        : { user: { id: userId } },
      relations: {
        tournament: true,
        picks: { player: { team: true } },
        chipActivations: { matchday: true },
      },
      order: { createdAt: 'DESC' },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found for this user.');
    }

    if (fantasyTeam.tournament.format !== 'world_cup') {
      throw new NotFoundException('This app only supports FIFA World Cup fantasy data.');
    }

    const currentMatchday = await this.matchdaysRepository.findOne({
      where: {
        tournament: { id: fantasyTeam.tournament.id },
        number: fantasyTeam.tournament.currentMatchdayNumber,
      },
      relations: { tournament: true },
    });

    if (!currentMatchday) {
      throw new NotFoundException('Current matchday not found.');
    }

    const [overallEntry, matchdayEntry, totalPlayers, totalTransfers, gameweekTransfers, leagueTablesEntriesCount, transfersMade, leagueMemberships] = await Promise.all([
      this.getLeaderboardEntry(fantasyTeam.id),
      this.getLeaderboardEntry(fantasyTeam.id, currentMatchday.id),
      this.fantasyTeamsRepository.count({ where: { tournament: { id: fantasyTeam.tournament.id } } }),
      this.transfersRepository.count({ where: { fantasyTeam: { id: fantasyTeam.id } } }),
      this.transfersRepository.count({ where: { fantasyTeam: { id: fantasyTeam.id }, matchday: { id: currentMatchday.id } } }),
      this.leaderboardEntriesRepository
        .createQueryBuilder('entry')
        .where('entry.scope = :scope', { scope: 'league' })
        .andWhere('entry.matchday_id = :matchdayId', { matchdayId: currentMatchday.id })
        .getCount(),
      this.transfersRepository.count({ where: { matchday: { id: currentMatchday.id } } }),
      this.leagueMembershipsRepository.find({ where: { user: { id: userId } }, relations: { league: true } }),
    ]);

    const livePointsByPlayerId = new Map<string, number>();
    for (const pick of fantasyTeam.picks) {
      if (pick.player?.id) {
        livePointsByPlayerId.set(pick.player.id, pick.livePoints ?? 0);
      }
    }

    const liveTotalPoints = fantasyTeam.picks.reduce((sum, pick) => sum + ((pick.livePoints ?? 0) * Math.max(pick.multiplier ?? 1, 1)), 0);
    const liveOverallRank = matchdayEntry?.rank ?? overallEntry?.rank ?? null;
    const rankDelta = overallEntry?.previousRank && liveOverallRank ? overallEntry.previousRank - liveOverallRank : 0;
    const primaryLeague = leagueMemberships[0]?.league ?? null;
    const liveLeagueEntry = primaryLeague ? await this.leaderboardEntriesRepository.findOne({
      where: {
        scope: 'league',
        league: { id: primaryLeague.id },
        fantasyTeam: { id: fantasyTeam.id },
        matchday: { id: currentMatchday.id },
      },
      relations: { league: true, fantasyTeam: true, matchday: true },
    }) : null;

    const pointsToNextRival = liveLeagueEntry?.rank && liveLeagueEntry.rank > 1
      ? 0
      : null;

    const biggestSwingPlayerName = fantasyTeam.picks
      .slice()
      .sort((left, right) => (right.livePoints ?? 0) - (left.livePoints ?? 0))[0]?.player?.shortName ?? null;

    const [fixtures, scoreLogs, matchdaySummaryEntries, mostSelected, mostCaptained, mostViceCaptained, gameweekHistory, topTransfersIn, topTransfersOut, topPlayersByMatchday, mostValuableTeams, bestLeagues, latestIssues, newlyAddedPlayers, recentTransfers, setPieceCandidates, teamOfTheWeek, teamOfTheTournament, wildcardCount, benchBoostCount, freeHitCount, tripleCaptainCount] = await Promise.all([
      this.fixturesRepository.find({
        where: { matchday: { id: currentMatchday.id } },
        relations: { homeTeam: true, awayTeam: true },
        order: { kickoffAt: 'ASC' },
      }),
      this.playerScoreLogsRepository
        .createQueryBuilder('scoreLog')
        .leftJoinAndSelect('scoreLog.fixture', 'fixture')
        .innerJoinAndSelect('scoreLog.player', 'player')
        .leftJoinAndSelect('player.team', 'team')
        .where('fixture.matchday_id = :matchdayId', { matchdayId: currentMatchday.id })
        .orderBy('scoreLog.totalPoints', 'DESC')
        .addOrderBy('scoreLog.createdAt', 'ASC')
        .getMany(),
      this.leaderboardEntriesRepository
        .createQueryBuilder('entry')
        .where('entry.scope = :scope', { scope: 'global' })
        .andWhere('entry.matchday_id = :matchdayId', { matchdayId: currentMatchday.id })
        .getMany(),
      this.getMostPickedPlayer(fantasyTeam.tournament.id, 'selected'),
      this.getMostPickedPlayer(fantasyTeam.tournament.id, 'captain'),
      this.getMostPickedPlayer(fantasyTeam.tournament.id, 'vice_captain'),
      this.getGameweekHistory(fantasyTeam.id),
      this.getTransferTrend(currentMatchday.id, 'in'),
      this.getTransferTrend(currentMatchday.id, 'out'),
      this.getTopPlayersByMatchday(fantasyTeam.tournament.id, currentMatchday.number),
      this.getMostValuableTeams(fantasyTeam.tournament.id),
      this.getBestLeagues(fantasyTeam.tournament.id),
      this.getLatestAvailabilityIssues(),
      this.getNewlyAddedPlayers(),
      this.getRecentTransfers(fantasyTeam.id),
      this.getSetPieceCandidates(fantasyTeam.tournament.id),
      this.getTeamOfTheWeekPlayers(currentMatchday.id),
      this.getTeamOfTheTournamentPlayers(fantasyTeam.tournament.id),
      this.countChipActivations(currentMatchday.id, ChipType.WILDCARD),
      this.countChipActivations(currentMatchday.id, ChipType.BENCH_BOOST),
      this.countChipActivations(currentMatchday.id, ChipType.FREE_HIT),
      this.countChipActivations(currentMatchday.id, ChipType.TRIPLE_CAPTAIN),
    ]);

    const chipLabels: Record<ChipType, string> = {
      [ChipType.WILDCARD]: 'Wildcard',
      [ChipType.TRIPLE_CAPTAIN]: 'Triple Captain',
      [ChipType.BENCH_BOOST]: 'Bench Boost',
      [ChipType.FREE_HIT]: 'Free Hit',
    };

    const chipStatuses = (Object.values(ChipType) as ChipType[]).map((chipType) => {
      const matchingActivations = fantasyTeam.chipActivations.filter((activation) => activation.chipType === chipType);
      const isActive = fantasyTeam.activeChipType === chipType;
      let status: 'active' | 'played' | 'available' = 'available';

      if (isActive) {
        status = 'active';
      } else if (matchingActivations.length > 0) {
        status = 'played';
      }

      return {
        type: chipType,
        label: chipLabels[chipType],
        status,
        usedOnMatchday: matchingActivations[0]?.matchday?.number ?? null,
      };
    });

    const scoreLogFixtureIds = new Set(scoreLogs.map((scoreLog) => scoreLog.fixture.id));
    const dayGroups = new Map<string, FixtureEntity[]>();
    for (const fixture of fixtures) {
      const label = this.formatDayLabel(fixture.kickoffAt);
      const currentFixtures = dayGroups.get(label) ?? [];
      currentFixtures.push(fixture);
      dayGroups.set(label, currentFixtures);
    }

    const days = Array.from(dayGroups.entries()).map(([label, dayFixtures]) => {
      const allFinished = dayFixtures.every((fixture) => ['full_time', 'postponed'].includes(fixture.status));
      const anyLive = dayFixtures.some((fixture) => ['live', 'half_time'].includes(fixture.status));
      let matchPointsStatus = 'Pending';
      let bonusPointsStatus = 'Pending';

      if (anyLive) {
        matchPointsStatus = 'Live';
        bonusPointsStatus = 'Processing';
      } else if (allFinished) {
        matchPointsStatus = 'Confirmed';
      }

      if (allFinished && dayFixtures.every((fixture) => scoreLogFixtureIds.has(fixture.id))) {
        bonusPointsStatus = 'Added';
      }

      return {
        label,
        matchPointsStatus,
        bonusPointsStatus,
      };
    });

    const highestPoints = matchdaySummaryEntries.length > 0
      ? Math.max(...matchdaySummaryEntries.map((entry) => entry.matchdayPoints))
      : 0;
    const averagePoints = matchdaySummaryEntries.length > 0
      ? Number((matchdaySummaryEntries.reduce((sum, entry) => sum + entry.matchdayPoints, 0) / matchdaySummaryEntries.length).toFixed(1))
      : 0;

    return {
      matchday: {
        id: currentMatchday.id,
        number: currentMatchday.number,
        label: `Gameweek ${currentMatchday.number}`,
        status: currentMatchday.status,
      },
      status: {
        pointsRankings: {
          gameweekPoints: matchdayEntry?.matchdayPoints ?? 0,
          overallPoints: overallEntry?.totalPoints ?? fantasyTeam.totalPoints,
          gameweekRank: matchdayEntry?.rank ?? null,
          overallRank: overallEntry?.rank ?? null,
          totalPlayers,
          teamIdLabel: this.toDisplayTeamId(fantasyTeam.id),
          liveOverallRank,
          liveLeagueRank: liveLeagueEntry?.rank ?? null,
          rankDelta,
          liveTotalPoints,
          pointsToNextRival,
          biggestSwingPlayerName,
        },
        transfersFinance: {
          gameweekTransfers,
          totalTransfers,
          squadValue: Number.parseFloat(fantasyTeam.teamValue),
          inTheBank: Number.parseFloat(fantasyTeam.budgetRemaining),
          chips: chipStatuses,
        },
        gameweekStatus: {
          days,
          leagueTablesStatus: leagueTablesEntriesCount > 0 ? 'Updated' : 'Pending',
        },
        summary: {
          highestPoints,
          averagePoints,
          mostSelectedPlayer: mostSelected,
          mostCaptained: mostCaptained,
          mostViceCaptained: mostViceCaptained,
          transfersMade,
          wildcardsPlayed: wildcardCount,
          benchBoostsPlayed: benchBoostCount,
          freeHitsPlayed: freeHitCount,
          tripleCaptainsPlayed: tripleCaptainCount,
        },
        teamOfTheWeek: {
          title: `Gameweek ${currentMatchday.number} Team of the Week`,
          players: teamOfTheWeek,
        },
        teamOfTheTournament: {
          title: `${fantasyTeam.tournament.name} Team of the Tournament`,
          players: teamOfTheTournament,
        },
      },
      tools: {
        gameweekHistory,
        topTransfersIn,
        topTransfersOut,
        topPlayersByMatchday,
        mostValuableTeams,
        bestLeagues,
        setPieceCandidates,
        latestInjuriesAndBans: latestIssues,
        newlyAddedPlayers,
        recentTransfers,
      },
    };
  }

  async getTeamShowcase(userId: string, kind: 'week' | 'tournament', tournamentId?: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: tournamentId
        ? { user: { id: userId }, tournament: { id: tournamentId } }
        : { user: { id: userId } },
      relations: { tournament: true },
      order: { createdAt: 'DESC' },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found for this user.');
    }

    if (fantasyTeam.tournament.format !== 'world_cup') {
      throw new NotFoundException('This app only supports FIFA World Cup fantasy data.');
    }

    if (kind === 'tournament') {
      return {
        kind,
        title: `${fantasyTeam.tournament.name} Team of the Tournament`,
        description: 'The highest-performing XI across the full competition based on fantasy points.',
        players: await this.getTeamOfTheTournamentPlayers(fantasyTeam.tournament.id),
      };
    }

    const currentMatchday = await this.matchdaysRepository.findOne({
      where: {
        tournament: { id: fantasyTeam.tournament.id },
        number: fantasyTeam.tournament.currentMatchdayNumber,
      },
    });

    if (!currentMatchday) {
      throw new NotFoundException('Current matchday not found.');
    }

    return {
      kind,
      title: `Gameweek ${currentMatchday.number} Team of the Week`,
      description: 'The top fantasy performers for the current gameweek.',
      players: await this.getTeamOfTheWeekPlayers(currentMatchday.id),
    };
  }

  async updateUserProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: { profile: true },
    });

    if (!user?.profile) {
      throw new NotFoundException('User profile not found.');
    }

    user.profile.displayName = dto.displayName?.trim() ?? user.profile.displayName;
    user.profile.teamName = dto.teamName?.trim() ?? user.profile.teamName;
    user.profile.avatarUrl = dto.avatarUrl ?? user.profile.avatarUrl;
    user.profile.locale = dto.locale ?? user.profile.locale;
    user.profile.timezone = dto.timezone ?? user.profile.timezone;
    user.profile.watchlistPlayerIds = dto.watchlistPlayerIds
      ? Array.from(new Set(dto.watchlistPlayerIds))
      : user.profile.watchlistPlayerIds;
    user.profile.favoritePlayerIds = dto.favoritePlayerIds
      ? Array.from(new Set(dto.favoritePlayerIds))
      : user.profile.favoritePlayerIds;

    await this.userProfilesRepository.save(user.profile);

    return this.buildUserResponse(user);
  }

  private async getLeaderboardEntry(fantasyTeamId: string, matchdayId?: string) {
    const query = this.leaderboardEntriesRepository
      .createQueryBuilder('entry')
      .where('entry.scope = :scope', { scope: 'global' })
      .andWhere('entry.fantasy_team_id = :fantasyTeamId', { fantasyTeamId });

    if (matchdayId) {
      query.andWhere('entry.matchday_id = :matchdayId', { matchdayId });
    } else {
      query.andWhere('entry.matchday_id IS NULL');
    }

    return query.getOne();
  }

  private async getGameweekHistory(fantasyTeamId: string) {
    const entries = await this.leaderboardEntriesRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.matchday', 'matchday')
      .where('entry.scope = :scope', { scope: 'global' })
      .andWhere('entry.fantasy_team_id = :fantasyTeamId', { fantasyTeamId })
      .andWhere('entry.matchday_id IS NOT NULL')
      .orderBy('matchday.number', 'DESC')
      .getMany();

    return entries
      .filter((entry) => Boolean(entry.matchday))
      .map((entry) => ({
        matchdayNumber: entry.matchday!.number,
        points: entry.matchdayPoints,
        totalPoints: entry.totalPoints,
        rank: entry.rank,
        previousRank: entry.previousRank,
        movement: this.buildMovement(entry.rank, entry.previousRank),
      }));
  }

  private buildMovement(rank: number | null, previousRank: number | null) {
    if (!rank || !previousRank || rank === previousRank) {
      return 'same' as const;
    }

    return rank < previousRank ? 'up' as const : 'down' as const;
  }

  private async getMostPickedPlayer(tournamentId: string, scope: 'selected' | 'captain' | 'vice_captain') {
    const query = this.fantasyPicksRepository
      .createQueryBuilder('pick')
      .leftJoin('pick.fantasyTeam', 'fantasyTeam')
      .leftJoin('pick.player', 'player')
      .where('fantasyTeam.tournament_id = :tournamentId', { tournamentId });

    if (scope === 'captain') {
      query.andWhere('pick.is_captain = true');
    }

    if (scope === 'vice_captain') {
      query.andWhere('pick.is_vice_captain = true');
    }

    const row = await query
      .select('player.name', 'name')
      .addSelect('COUNT(*)', 'total')
      .groupBy('player.id')
      .addGroupBy('player.name')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('player.name', 'ASC')
      .limit(1)
      .getRawOne<{ name: string }>();

    return row?.name ?? null;
  }

  private async getTransferTrend(matchdayId: string, direction: 'in' | 'out') {
    const alias = direction === 'in' ? 'playerIn' : 'playerOut';
    const rawRows = await this.transfersRepository
      .createQueryBuilder('transfer')
      .leftJoin(`transfer.${alias}`, 'player')
      .leftJoin('player.team', 'team')
      .where('transfer.matchday_id = :matchdayId', { matchdayId })
      .select('player.id', 'playerId')
      .addSelect('player.external_provider_id', 'externalProviderId')
      .addSelect('player.name', 'playerName')
      .addSelect('player.short_name', 'playerShortName')
      .addSelect('player.position', 'playerPosition')
      .addSelect('player.current_price', 'playerCurrentPrice')
      .addSelect('player.total_points', 'playerTotalPoints')
      .addSelect('player.is_injured', 'playerIsInjured')
      .addSelect('player.is_suspended', 'playerIsSuspended')
      .addSelect('team.id', 'teamId')
      .addSelect('team.external_provider_id', 'teamExternalProviderId')
      .addSelect('team.name', 'teamName')
      .addSelect('team.short_name', 'teamShortName')
      .addSelect('team.code', 'teamCode')
      .addSelect('team.flag_url', 'teamFlagUrl')
      .addSelect('COUNT(*)', 'transferCount')
      .groupBy('player.id')
      .addGroupBy('team.id')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('player.name', 'ASC')
      .limit(5)
      .getRawMany<{
        playerId: string;
        externalProviderId: string | null;
        playerName: string;
        playerShortName: string;
        playerPosition: string;
        playerCurrentPrice: string;
        playerTotalPoints: string;
        playerIsInjured: boolean;
        playerIsSuspended: boolean;
        teamId: string;
        teamExternalProviderId: string | null;
        teamName: string;
        teamShortName: string;
        teamCode: string;
        teamFlagUrl: string | null;
        transferCount: string;
      }>();

    return rawRows.map((row) => ({
      player: {
        id: row.playerId,
        externalProviderId: row.externalProviderId,
        name: row.playerName,
        shortName: row.playerShortName,
        position: row.playerPosition,
        currentPrice: row.playerCurrentPrice,
        totalPoints: Number.parseInt(row.playerTotalPoints, 10) || 0,
        isInjured: row.playerIsInjured,
        isSuspended: row.playerIsSuspended,
        isActive: true,
        team: {
          id: row.teamId,
          externalProviderId: row.teamExternalProviderId,
          name: row.teamName,
          shortName: row.teamShortName,
          code: row.teamCode,
          flagUrl: row.teamFlagUrl,
        },
      },
      count: Number.parseInt(row.transferCount, 10) || 0,
    }));
  }

  private async getBestLeagues(tournamentId: string) {
    const rawRows = await this.leaderboardEntriesRepository
      .createQueryBuilder('entry')
      .leftJoin('entry.league', 'league')
      .where('entry.scope = :scope', { scope: 'league' })
      .andWhere('entry.matchday_id IS NULL')
      .andWhere('league.id IS NOT NULL')
      .andWhere('league.tournament_id = :tournamentId', { tournamentId })
      .andWhere('league.is_archived = false')
      .select('league.id', 'leagueId')
      .addSelect('league.name', 'leagueName')
      .addSelect('AVG(entry.total_points)', 'averagePoints')
      .groupBy('league.id')
      .addGroupBy('league.name')
      .orderBy('AVG(entry.total_points)', 'DESC')
      .limit(5)
      .getRawMany<{ leagueId: string; leagueName: string; averagePoints: string }>();

    return rawRows.map((row, index) => ({
      position: index + 1,
      leagueId: row.leagueId,
      leagueName: row.leagueName,
      averagePoints: Number.parseFloat(row.averagePoints) || 0,
    }));
  }

  private async getLatestAvailabilityIssues() {
    const players = await this.playersRepository
      .createQueryBuilder('player')
      .leftJoinAndSelect('player.team', 'team')
      .where('player.is_injured = true')
      .orWhere('player.is_suspended = true')
      .orderBy('player.updatedAt', 'DESC')
      .addOrderBy('player.name', 'ASC')
      .limit(5)
      .getMany();

    return players.map((player) => ({
      player: this.serializePlayer(player),
      status: player.isSuspended ? 'suspension' : 'injury',
    }));
  }

  private async getTopPlayersByMatchday(tournamentId: string, currentMatchdayNumber: number) {
    const recentMatchdays = await this.matchdaysRepository.find({
      where: { tournament: { id: tournamentId } },
      order: { number: 'DESC' },
      take: 3,
    });

    const resolvedTopPlayers = await Promise.all(
      [...recentMatchdays]
        .sort((left, right) => left.number - right.number)
        .map(async (matchday) => {
          const topScoreLog = await this.playerScoreLogsRepository
            .createQueryBuilder('scoreLog')
            .innerJoinAndSelect('scoreLog.player', 'player')
            .leftJoinAndSelect('player.team', 'team')
            .leftJoin('scoreLog.fixture', 'fixture')
            .where('fixture.matchday_id = :matchdayId', { matchdayId: matchday.id })
            .orderBy('scoreLog.totalPoints', 'DESC')
            .addOrderBy('player.name', 'ASC')
            .getOne();

          return {
            matchdayNumber: matchday.number,
            player: topScoreLog ? this.serializePlayer(topScoreLog.player) : null,
            points: topScoreLog?.totalPoints ?? null,
            isUpcoming: false,
          };
        }),
    );

    const nextMatchdayNumber = currentMatchdayNumber + 1;
    const hasNextMatchdayEntry = resolvedTopPlayers.some((item) => item.matchdayNumber === nextMatchdayNumber);

    if (hasNextMatchdayEntry) {
      return resolvedTopPlayers;
    }

    return [
      ...resolvedTopPlayers,
      {
        matchdayNumber: nextMatchdayNumber,
        player: null,
        points: null,
        isUpcoming: true,
      },
    ];
  }

  private async getMostValuableTeams(tournamentId: string) {
    const rawRows = await this.fantasyTeamsRepository
      .createQueryBuilder('fantasyTeam')
      .where('fantasyTeam.tournament_id = :tournamentId', { tournamentId })
      .select('fantasyTeam.id', 'fantasyTeamId')
      .addSelect('fantasyTeam.name', 'teamName')
      .addSelect('fantasyTeam.team_value', 'teamValue')
      .orderBy('fantasyTeam.team_value', 'DESC')
      .addOrderBy('fantasyTeam.name', 'ASC')
      .limit(5)
      .getRawMany<{ fantasyTeamId: string; teamName: string; teamValue: string }>();

    return rawRows.map((row, index) => ({
      position: index + 1,
      fantasyTeamId: row.fantasyTeamId,
      teamName: row.teamName,
      teamValue: Number.parseFloat(row.teamValue) || 0,
    }));
  }

  private async getNewlyAddedPlayers(limit = 20) {
    const players = await this.playersRepository
      .createQueryBuilder('player')
      .leftJoinAndSelect('player.team', 'team')
      .where('player.is_active = true')
      .orderBy('player.createdAt', 'DESC')
      .addOrderBy('player.name', 'ASC')
      .limit(limit)
      .getMany();

    return players.map((player) => this.serializePlayer(player));
  }

  private async getRecentTransfers(fantasyTeamId: string, limit = 20) {
    const transfers = await this.transfersRepository
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.playerIn', 'playerIn')
      .leftJoinAndSelect('playerIn.team', 'playerInTeam')
      .leftJoinAndSelect('transfer.playerOut', 'playerOut')
      .leftJoinAndSelect('playerOut.team', 'playerOutTeam')
      .leftJoinAndSelect('transfer.matchday', 'matchday')
      .where('transfer.fantasy_team_id = :fantasyTeamId', { fantasyTeamId })
      .orderBy('transfer.transferredAt', 'DESC')
      .limit(limit)
      .getMany();

    return transfers.map((transfer) => ({
      id: transfer.id,
      transferredAt: transfer.transferredAt.toISOString(),
      matchdayNumber: transfer.matchday?.number ?? null,
      costHit: transfer.costHit,
      playerIn: this.serializePlayer(transfer.playerIn),
      playerOut: this.serializePlayer(transfer.playerOut),
    }));
  }

  private async getSetPieceCandidates(tournamentId: string) {
    type RankedPlayerSnapshot = {
      player: PlayerEntity;
      assists: number;
      goals: number;
      penaltiesScored: number;
      penaltiesMissed: number;
      minutesPlayed: number;
      totalPoints: number;
    };

    const players = await this.playersRepository
      .createQueryBuilder('player')
      .leftJoinAndSelect('player.team', 'team')
      .where('team.tournament_id = :tournamentId', { tournamentId })
      .andWhere('player.is_active = true')
      .orderBy('player.totalPoints', 'DESC')
      .addOrderBy('player.name', 'ASC')
      .getMany();

    const availablePlayers = players.filter((player) => !player.isSuspended);
    const playerIds = availablePlayers.map((player) => player.id);
    const countsByPlayer = new Map<string, Map<string, number>>();

    if (playerIds.length > 0) {
      const eventRows = await this.playerScoreEventsRepository
        .createQueryBuilder('event')
        .select('event.player_id', 'playerId')
        .addSelect('event.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .where('event.player_id IN (:...playerIds)', { playerIds })
        .andWhere('event.type IN (:...eventTypes)', { eventTypes: ['goal', 'assist', 'penalty_scored', 'penalty_missed'] })
        .groupBy('event.player_id')
        .addGroupBy('event.type')
        .getRawMany<{ playerId: string; type: string; count: string }>();

      for (const row of eventRows) {
        const playerCounts = countsByPlayer.get(row.playerId) ?? new Map<string, number>();
        playerCounts.set(row.type, Number.parseInt(row.count, 10) || 0);
        countsByPlayer.set(row.playerId, playerCounts);
      }
    }

    const rankedPlayers: RankedPlayerSnapshot[] = availablePlayers.map((player) => {
      const eventCounts = countsByPlayer.get(player.id) ?? new Map<string, number>();
      const penaltiesScored = eventCounts.get('penalty_scored') ?? 0;
      const penaltiesMissed = eventCounts.get('penalty_missed') ?? 0;
      const openPlayGoals = eventCounts.get('goal') ?? 0;

      return {
        player,
        assists: eventCounts.get('assist') ?? 0,
        goals: openPlayGoals + penaltiesScored,
        penaltiesScored,
        penaltiesMissed,
        minutesPlayed: player.minutesPlayed ?? 0,
        totalPoints: player.totalPoints ?? 0,
      };
    });

    const buildSection = (
      key: string,
      title: string,
      subtitle: string,
      metricBuilder: (snapshot: RankedPlayerSnapshot) => string,
      scoreBuilder: (snapshot: RankedPlayerSnapshot) => number,
    ) => ({
      key,
      title,
      subtitle,
      items: rankedPlayers
        .map((snapshot) => ({
          player: this.serializePlayer(snapshot.player),
          score: scoreBuilder(snapshot),
          metric: metricBuilder(snapshot),
        }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || right.player.totalPoints - left.player.totalPoints || left.player.name.localeCompare(right.player.name))
        .slice(0, 8),
    });

    return [
      buildSection(
        'penalties',
        'Likely Penalty Takers',
        'Ranked from actual penalty involvement, goal output, and attacking role.',
        (snapshot) => `${snapshot.penaltiesScored + snapshot.penaltiesMissed} pens • ${snapshot.goals} goals`,
        (snapshot) => {
          let roleBonus = 0;

          if (snapshot.player.position === 'FWD') {
            roleBonus = 6;
          } else if (snapshot.player.position === 'MID') {
            roleBonus = 3;
          }

          return (
            ((snapshot.penaltiesScored + snapshot.penaltiesMissed) * 14)
            + (snapshot.penaltiesScored * 6)
            + (snapshot.goals * 5)
            + Math.round(snapshot.totalPoints / 8)
            + Math.round(snapshot.minutesPlayed / 250)
            + roleBonus
            - (snapshot.player.isInjured ? 10 : 0)
          );
        },
      ),
      buildSection(
        'delivery',
        'Set-Piece Creators',
        'Weighted toward assist production, trust, and minutes on the pitch.',
        (snapshot) => `${snapshot.assists} ast • ${snapshot.totalPoints} pts`,
        (snapshot) => {
          let roleBonus = 0;

          if (snapshot.player.position === 'MID') {
            roleBonus = 6;
          } else if (snapshot.player.position === 'DEF') {
            roleBonus = 3;
          }

          return (
            (snapshot.assists * 12)
            + Math.round(snapshot.totalPoints / 7)
            + Math.round(snapshot.minutesPlayed / 300)
            + roleBonus
            - (snapshot.player.isInjured ? 8 : 0)
          );
        },
      ),
      buildSection(
        'threat',
        'Dead-Ball Threat',
        'Blends direct scoring threat with creation and recent fantasy return.',
        (snapshot) => `${snapshot.goals} G • ${snapshot.assists} A`,
        (snapshot) => {
          let roleBonus = 0;

          if (snapshot.player.position === 'FWD') {
            roleBonus = 4;
          } else if (snapshot.player.position === 'MID') {
            roleBonus = 2;
          }

          return (
            (snapshot.goals * 8)
            + (snapshot.assists * 5)
            + (snapshot.penaltiesScored * 2)
            + Math.round(snapshot.totalPoints / 8)
            + Math.round(snapshot.minutesPlayed / 240)
            + roleBonus
            - (snapshot.player.isInjured ? 10 : 0)
          );
        },
      ),
    ];
  }

  private async getTeamOfTheWeekPlayers(matchdayId: string) {
    const scoreLogs = await this.playerScoreLogsRepository
      .createQueryBuilder('scoreLog')
      .innerJoinAndSelect('scoreLog.player', 'player')
      .leftJoinAndSelect('player.team', 'team')
      .leftJoin('scoreLog.fixture', 'fixture')
      .where('fixture.matchday_id = :matchdayId', { matchdayId })
      .orderBy('scoreLog.totalPoints', 'DESC')
      .addOrderBy('player.name', 'ASC')
      .getMany();

    if (scoreLogs.length > 0) {
      const uniqueLogs = scoreLogs.filter((scoreLog, index, collection) => collection.findIndex((candidate) => candidate.player.id === scoreLog.player.id) === index);
      return this.selectShowcaseFormation(
        uniqueLogs.map((scoreLog) => ({
          player: scoreLog.player,
          points: scoreLog.totalPoints,
        })),
      ).map((entry) => this.serializePlayer(entry.player));
    }

    const fallbackPlayers = await this.playersRepository.find({
      relations: { team: true },
      order: { totalPoints: 'DESC', name: 'ASC' },
      take: 40,
    });

    return this.selectShowcaseFormation(
      fallbackPlayers.map((player) => ({
        player,
        points: player.totalPoints,
      })),
    ).map((entry) => this.serializePlayer(entry.player));
  }

  private async getTeamOfTheTournamentPlayers(tournamentId: string) {
    const topPlayers = await this.playersRepository.find({
      where: {
        isActive: true,
        team: { tournament: { id: tournamentId } },
      },
      relations: { team: true },
      order: { totalPoints: 'DESC', name: 'ASC' },
      take: 60,
    });

    return this.selectShowcaseFormation(
      topPlayers.map((player) => ({
        player,
        points: player.totalPoints,
      })),
    ).map((entry) => this.serializePlayer(entry.player));
  }

  private selectShowcaseFormation(candidates: Array<{ player: PlayerEntity; points: number }>) {
    const uniqueCandidates = candidates
      .filter((candidate, index, collection) => collection.findIndex((item) => item.player.id === candidate.player.id) === index)
      .sort((left, right) => {
        if (right.points !== left.points) {
          return right.points - left.points;
        }

        return left.player.name.localeCompare(right.player.name);
      });

    const goalkeepers = uniqueCandidates.filter((candidate) => candidate.player.position === 'GK');
    const defenders = uniqueCandidates.filter((candidate) => candidate.player.position === 'DEF');
    const midfielders = uniqueCandidates.filter((candidate) => candidate.player.position === 'MID');
    const forwards = uniqueCandidates.filter((candidate) => candidate.player.position === 'FWD');

    const selected: Array<{ player: PlayerEntity; points: number }> = [];

    if (goalkeepers[0]) {
      selected.push(goalkeepers[0]);
    }

    selected.push(...defenders.slice(0, 3));
    selected.push(...midfielders.slice(0, 2));
    selected.push(...forwards.slice(0, 1));

    const selectedIds = new Set(selected.map((candidate) => candidate.player.id));
    const optionalPool = [
      ...defenders.slice(3).map((candidate) => ({ ...candidate, order: 0 })),
      ...midfielders.slice(2).map((candidate) => ({ ...candidate, order: 1 })),
      ...forwards.slice(1).map((candidate) => ({ ...candidate, order: 2 })),
    ]
      .filter((candidate) => !selectedIds.has(candidate.player.id))
      .sort((left, right) => {
        if (right.points !== left.points) {
          return right.points - left.points;
        }

        if (left.order !== right.order) {
          return left.order - right.order;
        }

        return left.player.name.localeCompare(right.player.name);
      });

    let defenderCount = selected.filter((candidate) => candidate.player.position === 'DEF').length;
    let midfielderCount = selected.filter((candidate) => candidate.player.position === 'MID').length;
    let forwardCount = selected.filter((candidate) => candidate.player.position === 'FWD').length;

    for (const candidate of optionalPool) {
      if (selected.length >= 11) {
        break;
      }

      if (candidate.player.position === 'DEF' && defenderCount >= 5) {
        continue;
      }

      if (candidate.player.position === 'MID' && midfielderCount >= 5) {
        continue;
      }

      if (candidate.player.position === 'FWD' && forwardCount >= 3) {
        continue;
      }

      selected.push(candidate);
      selectedIds.add(candidate.player.id);

      if (candidate.player.position === 'DEF') {
        defenderCount += 1;
      } else if (candidate.player.position === 'MID') {
        midfielderCount += 1;
      } else if (candidate.player.position === 'FWD') {
        forwardCount += 1;
      }
    }

    if (selected.length < 11) {
      const fallbackPool = uniqueCandidates.filter((candidate) => !selectedIds.has(candidate.player.id));
      for (const candidate of fallbackPool) {
        if (selected.length >= 11) {
          break;
        }

        selected.push(candidate);
        selectedIds.add(candidate.player.id);
      }
    }

    return selected.slice(0, 11);
  }

  private async countChipActivations(matchdayId: string, chipType: ChipType) {
    return this.chipActivationsRepository.count({
      where: {
        chipType,
        matchday: { id: matchdayId },
      },
    });
  }

  private serializePlayer(player: PlayerEntity) {
    return {
      id: player.id,
      externalProviderId: player.externalProviderId,
      name: player.name,
      shortName: player.shortName,
      position: player.position,
      currentPrice: player.currentPrice,
      totalPoints: player.totalPoints,
      isInjured: player.isInjured,
      isSuspended: player.isSuspended,
      isActive: player.isActive,
      availability: {
        statusType: player.isSuspended ? 'suspension' : player.isInjured ? 'injury' : 'available',
        severity: player.isSuspended ? 'high' : player.isInjured ? 'medium' : 'none',
        confidence: player.isSuspended ? 'high' : player.isInjured ? 'medium' : 'high',
        expectedReturn: player.isSuspended ? 'Awaiting next eligible matchday' : player.isInjured ? 'Unknown return date' : null,
        sourceLabel: player.isSuspended ? 'Disciplinary / admin review' : player.isInjured ? 'Medical / admin review' : 'Player active',
        updatedAt: player.updatedAt?.toISOString?.() ?? null,
        suspensionReason: player.isSuspended ? 'Suspended' : null,
      },
      team: player.team
        ? {
            id: player.team.id,
            externalProviderId: player.team.externalProviderId,
            name: player.team.name,
            shortName: player.team.shortName,
            code: player.team.code,
            flagUrl: player.team.flagUrl,
          }
        : null,
    };
  }

  private toDisplayTeamId(fantasyTeamId: string) {
    const numericHash = fantasyTeamId
      .split('')
      .reduce((hash, character) => ((hash * 31) + (character.codePointAt(0) ?? 0)) % 9_999_999, 0);

    return numericHash.toString().padStart(7, '0');
  }

  private formatDayLabel(date: Date) {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(date);
  }

  private buildUserResponse(user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      accountType: user.accountType,
      status: user.status,
      profile: user.profile
        ? {
            displayName: user.profile.displayName,
            teamName: user.profile.teamName,
            avatarUrl: user.profile.avatarUrl,
            locale: user.profile.locale,
            timezone: user.profile.timezone,
            watchlistPlayerIds: user.profile.watchlistPlayerIds ?? [],
            favoritePlayerIds: user.profile.favoritePlayerIds ?? [],
          }
        : null,
    };
  }
}
