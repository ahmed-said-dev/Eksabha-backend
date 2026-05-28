import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { LeagueMembershipEntity } from '../leagues/entities/league-membership.entity';
import { PlayerScoreLogEntity } from '../scoring/entities/player-score-log.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { LeaderboardEntryEntity } from './entities/leaderboard-entry.entity';

interface MaterializedLeaderboardRow {
  fantasyTeam: FantasyTeamEntity;
  totalPoints: number;
  matchdayPoints: number;
}

@Injectable()
export class LeaderboardsService {
  constructor(
    @InjectRepository(LeaderboardEntryEntity)
    private readonly leaderboardEntriesRepository: Repository<LeaderboardEntryEntity>,
    @InjectRepository(FantasyTeamEntity)
    private readonly fantasyTeamsRepository: Repository<FantasyTeamEntity>,
    @InjectRepository(LeagueMembershipEntity)
    private readonly leagueMembershipsRepository: Repository<LeagueMembershipEntity>,
    @InjectRepository(PlayerScoreLogEntity)
    private readonly playerScoreLogsRepository: Repository<PlayerScoreLogEntity>,
    @InjectRepository(MatchdayEntity)
    private readonly matchdaysRepository: Repository<MatchdayEntity>,
  ) {}

  getGlobalLeaderboard(matchday?: string) {
    return this.createLeaderboardQuery('global', { matchdayId: matchday }).getMany();
  }

  getLeagueLeaderboard(leagueId: string, matchday?: string) {
    return this.createLeaderboardQuery('league', { leagueId, matchdayId: matchday }).getMany();
  }

  async materializeForMatchday(matchdayId?: string) {
    const matchday = await this.resolveMatchday(matchdayId);

    const fantasyTeams = await this.fantasyTeamsRepository.find({
      where: { tournament: { id: matchday.tournament.id } },
      relations: {
        user: { profile: true },
        tournament: true,
        picks: { player: true },
      },
      order: { createdAt: 'ASC' },
    });

    const matchdayPlayerPoints = await this.getMatchdayPlayerPoints(matchday.id);
    const globalRows = fantasyTeams.map((fantasyTeam) =>
      this.buildLeaderboardRow(fantasyTeam, matchdayPlayerPoints),
    );

    for (const row of globalRows) {
      row.fantasyTeam.totalPoints = row.totalPoints;
      await this.fantasyTeamsRepository.save(row.fantasyTeam);
    }

    const previousGlobalOverallRanks = await this.getPreviousRankMap('global');
    const previousGlobalMatchdayRanks = await this.getPreviousRankMap('global', matchday.id);
    const previousLeagueOverallRanks = await this.getPreviousLeagueRankMap();
    const previousLeagueMatchdayRanks = await this.getPreviousLeagueRankMap(matchday.id);

    const memberships = await this.leagueMembershipsRepository.find({
      relations: { user: true, league: true },
      order: { joinedAt: 'ASC' },
    });

    const userIds = new Set(
      globalRows
        .map((row) => row.fantasyTeam.user?.id)
        .filter((userId): userId is string => typeof userId === 'string'),
    );
    const membershipsByUserId = new Map<string, LeagueMembershipEntity[]>();

    for (const membership of memberships) {
      if (!membership.user || !membership.league) {
        continue;
      }

      if (!userIds.has(membership.user.id) || membership.league.isArchived) {
        continue;
      }

      const currentMemberships = membershipsByUserId.get(membership.user.id) ?? [];
      currentMemberships.push(membership);
      membershipsByUserId.set(membership.user.id, currentMemberships);
    }

    const leagueRows = new Map<string, MaterializedLeaderboardRow[]>();
    const leaguesById = new Map<string, LeagueMembershipEntity['league']>();

    for (const row of globalRows) {
      const userId = row.fantasyTeam.user?.id;
      if (!userId) {
        continue;
      }

      const membershipsForUser = membershipsByUserId.get(userId) ?? [];

      for (const membership of membershipsForUser) {
        const currentRows = leagueRows.get(membership.league.id) ?? [];
        currentRows.push(row);
        leagueRows.set(membership.league.id, currentRows);
        leaguesById.set(membership.league.id, membership.league);
      }
    }

    await this.deleteEntries('global');
    await this.deleteEntries('global', matchday.id);
    await this.deleteEntries('league');
    await this.deleteEntries('league', matchday.id);

    const globalOverallEntries = this.rankRows(globalRows).map((row) =>
      this.leaderboardEntriesRepository.create({
        scope: 'global',
        rank: row.rank,
        previousRank: previousGlobalOverallRanks.get(row.fantasyTeam.id) ?? null,
        totalPoints: row.totalPoints,
        matchdayPoints: row.matchdayPoints,
        fantasyTeam: row.fantasyTeam,
        league: null,
        matchday: null,
      }),
    );

    const globalMatchdayEntries = this.rankRows(globalRows).map((row) =>
      this.leaderboardEntriesRepository.create({
        scope: 'global',
        rank: row.rank,
        previousRank: previousGlobalMatchdayRanks.get(row.fantasyTeam.id) ?? null,
        totalPoints: row.totalPoints,
        matchdayPoints: row.matchdayPoints,
        fantasyTeam: row.fantasyTeam,
        league: null,
        matchday,
      }),
    );

    if (globalOverallEntries.length > 0) {
      await this.leaderboardEntriesRepository.save(globalOverallEntries);
    }

    if (globalMatchdayEntries.length > 0) {
      await this.leaderboardEntriesRepository.save(globalMatchdayEntries);
    }

    const leagueOverallEntries: LeaderboardEntryEntity[] = [];
    const leagueMatchdayEntries: LeaderboardEntryEntity[] = [];

    for (const [leagueId, rows] of leagueRows) {
      const league = leaguesById.get(leagueId);
      if (!league) {
        continue;
      }

      const rankedRows = this.rankRows(rows);
      const previousOverallMap = previousLeagueOverallRanks.get(leagueId) ?? new Map<string, number>();
      const previousMatchdayMap = previousLeagueMatchdayRanks.get(leagueId) ?? new Map<string, number>();

      leagueOverallEntries.push(
        ...rankedRows.map((row) =>
          this.leaderboardEntriesRepository.create({
            scope: 'league',
            rank: row.rank,
            previousRank: previousOverallMap.get(row.fantasyTeam.id) ?? null,
            totalPoints: row.totalPoints,
            matchdayPoints: row.matchdayPoints,
            fantasyTeam: row.fantasyTeam,
            league,
            matchday: null,
          }),
        ),
      );

      leagueMatchdayEntries.push(
        ...rankedRows.map((row) =>
          this.leaderboardEntriesRepository.create({
            scope: 'league',
            rank: row.rank,
            previousRank: previousMatchdayMap.get(row.fantasyTeam.id) ?? null,
            totalPoints: row.totalPoints,
            matchdayPoints: row.matchdayPoints,
            fantasyTeam: row.fantasyTeam,
            league,
            matchday,
          }),
        ),
      );
    }

    if (leagueOverallEntries.length > 0) {
      await this.leaderboardEntriesRepository.save(leagueOverallEntries);
    }

    if (leagueMatchdayEntries.length > 0) {
      await this.leaderboardEntriesRepository.save(leagueMatchdayEntries);
    }

    return {
      matchdayId: matchday.id,
      fantasyTeams: globalRows.length,
      globalOverallEntries: globalOverallEntries.length,
      globalMatchdayEntries: globalMatchdayEntries.length,
      leagueOverallEntries: leagueOverallEntries.length,
      leagueMatchdayEntries: leagueMatchdayEntries.length,
    };
  }

  private createLeaderboardQuery(
    scope: 'global' | 'league',
    options: { leagueId?: string; matchdayId?: string },
  ) {
    const query = this.leaderboardEntriesRepository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.fantasyTeam', 'fantasyTeam')
      .leftJoinAndSelect('fantasyTeam.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('entry.league', 'league')
      .leftJoinAndSelect('entry.matchday', 'matchday')
      .where('entry.scope = :scope', { scope });

    if (options.leagueId) {
      query.andWhere('league.id = :leagueId', { leagueId: options.leagueId });
    }

    if (options.matchdayId) {
      query.andWhere('matchday.id = :matchdayId', { matchdayId: options.matchdayId });
    } else {
      query.andWhere('entry.matchday_id IS NULL');
    }

    return query.orderBy('entry.rank', 'ASC').addOrderBy('entry.total_points', 'DESC');
  }

  private async resolveMatchday(matchdayId?: string) {
    let matchday: MatchdayEntity | null;

    if (matchdayId) {
      matchday = await this.matchdaysRepository.findOne({
        where: { id: matchdayId },
        relations: { tournament: true },
      });
    } else {
      const [latestMatchday] = await this.matchdaysRepository.find({
        relations: { tournament: true },
        order: { number: 'DESC', createdAt: 'DESC' },
        take: 1,
      });

      matchday = latestMatchday ?? null;
    }

    if (!matchday) {
      throw new NotFoundException('Matchday not found for leaderboard materialization.');
    }

    return matchday;
  }

  private async getMatchdayPlayerPoints(matchdayId: string) {
    const scoreLogs = await this.playerScoreLogsRepository.find({
      where: { fixture: { matchday: { id: matchdayId } } },
      relations: { player: true, fixture: true },
      order: { createdAt: 'ASC' },
    });

    const pointsByPlayerId = new Map<string, number>();

    for (const scoreLog of scoreLogs) {
      if (!scoreLog.player) {
        continue;
      }

      const currentPoints = pointsByPlayerId.get(scoreLog.player.id) ?? 0;
      pointsByPlayerId.set(scoreLog.player.id, currentPoints + scoreLog.totalPoints);
    }

    return pointsByPlayerId;
  }

  private buildLeaderboardRow(
    fantasyTeam: FantasyTeamEntity,
    matchdayPlayerPoints: Map<string, number>,
  ): MaterializedLeaderboardRow {
    const activePicks = fantasyTeam.picks.filter((pick) => !pick.isBenched && !!pick.player);

    const totalPoints = activePicks.reduce(
      (sum, pick) => sum + (pick.livePoints ?? 0) * Math.max(pick.multiplier ?? 1, 1),
      0,
    );

    const matchdayPoints = activePicks.reduce((sum, pick) => {
      const playerMatchdayPoints = matchdayPlayerPoints.get(pick.player.id) ?? 0;
      return sum + playerMatchdayPoints * Math.max(pick.multiplier ?? 1, 1);
    }, 0);

    return {
      fantasyTeam,
      totalPoints,
      matchdayPoints,
    };
  }

  private rankRows(rows: MaterializedLeaderboardRow[]) {
    return [...rows]
      .sort((left, right) => {
        if (right.totalPoints !== left.totalPoints) {
          return right.totalPoints - left.totalPoints;
        }

        if (right.matchdayPoints !== left.matchdayPoints) {
          return right.matchdayPoints - left.matchdayPoints;
        }

        return left.fantasyTeam.createdAt.getTime() - right.fantasyTeam.createdAt.getTime();
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  private async getPreviousRankMap(scope: 'global' | 'league', matchdayId?: string) {
    const entries = await this.createLeaderboardQuery(scope, { matchdayId }).getMany();
    const rankMap = new Map<string, number>();

    for (const entry of entries) {
      if (!entry.fantasyTeam) {
        continue;
      }

      rankMap.set(entry.fantasyTeam.id, entry.rank);
    }

    return rankMap;
  }

  private async getPreviousLeagueRankMap(matchdayId?: string) {
    const entries = await this.createLeaderboardQuery('league', { matchdayId }).getMany();
    const rankMap = new Map<string, Map<string, number>>();

    for (const entry of entries) {
      if (!entry.league) {
        continue;
      }

      if (!entry.fantasyTeam) {
        continue;
      }

      const leagueRanks = rankMap.get(entry.league.id) ?? new Map<string, number>();
      leagueRanks.set(entry.fantasyTeam.id, entry.rank);
      rankMap.set(entry.league.id, leagueRanks);
    }

    return rankMap;
  }

  private async deleteEntries(scope: 'global' | 'league', matchdayId?: string) {
    const query = this.leaderboardEntriesRepository
      .createQueryBuilder()
      .delete()
      .from(LeaderboardEntryEntity)
      .where('scope = :scope', { scope });

    if (matchdayId) {
      query.andWhere('matchday_id = :matchdayId', { matchdayId });
    } else {
      query.andWhere('matchday_id IS NULL');
    }

    await query.execute();
  }
}
