import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerPosition } from '../../common/database';
import { FantasyPickEntity } from '../fantasy/entities/fantasy-pick.entity';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { TransferEntity } from '../fantasy/entities/transfer.entity';
import { PlayerScoreEventEntity } from '../scoring/entities/player-score-event.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';

import { PlayerEntity } from './entities/player.entity';
import { PlayerPriceEntity } from './entities/player-price.entity';
import { TeamEntity } from './entities/team.entity';

const UUID_V4_OR_V5_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(TeamEntity)
    private readonly teamsRepository: Repository<TeamEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playersRepository: Repository<PlayerEntity>,
    @InjectRepository(PlayerPriceEntity)
    private readonly playerPricesRepository: Repository<PlayerPriceEntity>,
    @InjectRepository(PlayerScoreEventEntity)
    private readonly playerScoreEventsRepository: Repository<PlayerScoreEventEntity>,
    @InjectRepository(FantasyPickEntity)
    private readonly fantasyPicksRepository: Repository<FantasyPickEntity>,
    @InjectRepository(FantasyTeamEntity)
    private readonly fantasyTeamsRepository: Repository<FantasyTeamEntity>,
    @InjectRepository(TransferEntity)
    private readonly transfersRepository: Repository<TransferEntity>,
    @InjectRepository(MatchdayEntity)
    private readonly matchdaysRepository: Repository<MatchdayEntity>,
  ) {}

  async getTeams(tournamentId?: string) {
    const queryBuilder = this.teamsRepository
      .createQueryBuilder('team')
      .leftJoinAndSelect('team.group', 'group')
      .leftJoinAndSelect('team.tournament', 'tournament')
      .orderBy('group.displayOrder', 'ASC')
      .addOrderBy('team.name', 'ASC');

    if (tournamentId) {
      queryBuilder.where('tournament.id = :tournamentId', { tournamentId });
    }

    return queryBuilder.getMany();
  }

  async getPlayers(options: {
    teamId?: string;
    tournamentId?: string;
    position?: PlayerPosition;
    maxPrice?: number;
    minPrice?: number;
  }) {
    const queryBuilder = this.playersRepository
      .createQueryBuilder('player')
      .leftJoinAndSelect('player.team', 'team')
      .where('player.is_active = :isActive', { isActive: true })
      .orderBy('player.totalPoints', 'DESC')
      .addOrderBy('player.name', 'ASC');

    if (options.tournamentId) {
      queryBuilder.andWhere('team.tournament_id = :tournamentId', { tournamentId: options.tournamentId });
    }

    if (options.teamId) {
      queryBuilder.andWhere('team.id = :teamId', { teamId: options.teamId });
    }

    if (options.position) {
      queryBuilder.andWhere('player.position = :position', { position: options.position });
    }

    if (options.minPrice !== undefined && !Number.isNaN(options.minPrice)) {
      queryBuilder.andWhere('CAST(player.current_price AS float) >= :minPrice', { minPrice: options.minPrice });
    }

    if (options.maxPrice !== undefined && !Number.isNaN(options.maxPrice)) {
      queryBuilder.andWhere('CAST(player.current_price AS float) <= :maxPrice', { maxPrice: options.maxPrice });
    }

    const players = await queryBuilder.getMany();
    return this.enrichPlayers(players, options.tournamentId);
  }

  async getPlayerById(playerId: string) {
    const playerLookup = this.playersRepository
      .createQueryBuilder('player')
      .leftJoinAndSelect('player.team', 'team')
      .leftJoinAndSelect('team.tournament', 'tournament')
      .where('player.is_active = :isActive', { isActive: true });

    if (UUID_V4_OR_V5_REGEX.test(playerId)) {
      playerLookup.andWhere('player.id = :playerId', { playerId });
    } else {
      playerLookup.andWhere('player.external_provider_id = :playerId', { playerId });
    }

    const player = await playerLookup.getOne();

    if (!player) {
      throw new NotFoundException('Player not found.');
    }

    const liveStats = await this.getPlayerLiveStats(player);
    const trendStats = await this.getPlayerTrendStats([player], player.team?.tournament?.id);

    return {
      ...player,
      availability: this.buildAvailability(player),
      ...liveStats,
      ...(trendStats.get(player.id) ?? this.buildDefaultTrendStats()),
    };
  }

  private async enrichPlayers(players: PlayerEntity[], tournamentId?: string) {
    if (players.length === 0) {
      return [];
    }

    const [trendStats, liveStatsEntries] = await Promise.all([
      this.getPlayerTrendStats(players, tournamentId),
      Promise.all(players.map(async (player) => ([player.id, await this.getPlayerLiveStats(player)] as const))),
    ]);

    const liveStats = new Map(liveStatsEntries);

    return players.map((player) => ({
      ...player,
      availability: this.buildAvailability(player),
      ...(liveStats.get(player.id) ?? {}),
      ...(trendStats.get(player.id) ?? this.buildDefaultTrendStats()),
    }));
  }

  private buildAvailability(player: PlayerEntity) {
    if (player.isSuspended) {
      return {
        statusType: 'suspension' as const,
        severity: 'high' as const,
        confidence: 'high' as const,
        expectedReturn: 'Awaiting next eligible matchday',
        sourceLabel: 'Disciplinary / admin review',
        updatedAt: player.updatedAt?.toISOString() ?? null,
        suspensionReason: 'Suspended',
      };
    }

    if (player.isInjured) {
      return {
        statusType: 'injury' as const,
        severity: 'medium' as const,
        confidence: 'medium' as const,
        expectedReturn: 'Unknown return date',
        sourceLabel: 'Medical / admin review',
        updatedAt: player.updatedAt?.toISOString() ?? null,
        suspensionReason: null,
      };
    }

    return {
      statusType: 'available' as const,
      severity: 'none' as const,
      confidence: 'high' as const,
      expectedReturn: null,
      sourceLabel: 'Player active',
      updatedAt: player.updatedAt?.toISOString() ?? null,
      suspensionReason: null,
    };
  }

  private buildDefaultTrendStats() {
    return {
      totalTransferIn: 0,
      totalTransferOut: 0,
      transferInRound: 0,
      transferOutRound: 0,
      totalPriceRaise: 0,
      totalPriceDown: 0,
      priceRaiseRound: 0,
      priceDownRound: 0,
    };
  }

  private async getPlayerTrendStats(players: PlayerEntity[], tournamentId?: string) {
    const stats = new Map<string, ReturnType<CatalogService['buildDefaultTrendStats']>>();

    for (const player of players) {
      stats.set(player.id, this.buildDefaultTrendStats());
    }

    if (players.length === 0) {
      return stats;
    }

    const playerIds = players.map((player) => player.id);
    const resolvedTournamentId = tournamentId ?? undefined;
    const tournamentEntity = resolvedTournamentId
      ? await this.teamsRepository
          .createQueryBuilder('team')
          .leftJoinAndSelect('team.tournament', 'tournament')
          .where('tournament.id = :tournamentId', { tournamentId: resolvedTournamentId })
          .getOne()
      : null;

    const currentMatchdayNumber = tournamentEntity?.tournament.currentMatchdayNumber;

    const currentMatchday = resolvedTournamentId && currentMatchdayNumber
      ? await this.matchdaysRepository.findOne({
          where: {
            tournament: { id: resolvedTournamentId },
            number: currentMatchdayNumber,
          },
        })
      : null;

    const [transferInRows, transferOutRows, transferInRoundRows, transferOutRoundRows, priceRows] = await Promise.all([
      this.buildTransferAggregation('playerIn', playerIds, resolvedTournamentId),
      this.buildTransferAggregation('playerOut', playerIds, resolvedTournamentId),
      currentMatchday ? this.buildTransferAggregation('playerIn', playerIds, resolvedTournamentId, currentMatchday.id) : Promise.resolve([]),
      currentMatchday ? this.buildTransferAggregation('playerOut', playerIds, resolvedTournamentId, currentMatchday.id) : Promise.resolve([]),
      this.playerPricesRepository
        .createQueryBuilder('playerPrice')
        .leftJoinAndSelect('playerPrice.player', 'player')
        .where('player.id IN (:...playerIds)', { playerIds })
        .orderBy('playerPrice.effectiveAt', 'ASC')
        .getMany(),
    ]);

    for (const row of transferInRows) {
      stats.get(row.playerId)!.totalTransferIn = row.count;
    }

    for (const row of transferOutRows) {
      stats.get(row.playerId)!.totalTransferOut = row.count;
    }

    for (const row of transferInRoundRows) {
      stats.get(row.playerId)!.transferInRound = row.count;
    }

    for (const row of transferOutRoundRows) {
      stats.get(row.playerId)!.transferOutRound = row.count;
    }

    const priceHistoryByPlayer = new Map<string, PlayerPriceEntity[]>();
    for (const row of priceRows) {
      const bucket = priceHistoryByPlayer.get(row.player.id) ?? [];
      bucket.push(row);
      priceHistoryByPlayer.set(row.player.id, bucket);
    }

    for (const playerId of playerIds) {
      const history = priceHistoryByPlayer.get(playerId) ?? [];
      const playerStats = stats.get(playerId)!;

      for (let index = 1; index < history.length; index += 1) {
        const previousPrice = Number.parseFloat(history[index - 1].price);
        const currentPrice = Number.parseFloat(history[index].price);
        const delta = Number((currentPrice - previousPrice).toFixed(2));
        const isCurrentRoundChange = currentMatchday
          ? this.isInCurrentRound(history[index].effectiveAt, currentMatchday)
          : false;

        if (delta > 0) {
          playerStats.totalPriceRaise = Number((playerStats.totalPriceRaise + delta).toFixed(2));
          if (isCurrentRoundChange) {
            playerStats.priceRaiseRound = Number((playerStats.priceRaiseRound + delta).toFixed(2));
          }
        } else if (delta < 0) {
          const absoluteDelta = Math.abs(delta);
          playerStats.totalPriceDown = Number((playerStats.totalPriceDown + absoluteDelta).toFixed(2));
          if (isCurrentRoundChange) {
            playerStats.priceDownRound = Number((playerStats.priceDownRound + absoluteDelta).toFixed(2));
          }
        }
      }
    }

    return stats;
  }

  private async buildTransferAggregation(
    direction: 'playerIn' | 'playerOut',
    playerIds: string[],
    tournamentId?: string,
    matchdayId?: string,
  ) {
    if (playerIds.length === 0) {
      return [] as Array<{ playerId: string; count: number }>;
    }

    const query = this.transfersRepository
      .createQueryBuilder('transfer')
      .leftJoin(`transfer.${direction}`, 'player')
      .leftJoin('transfer.fantasyTeam', 'fantasyTeam')
      .select('player.id', 'playerId')
      .addSelect('COUNT(*)', 'count')
      .where('player.id IN (:...playerIds)', { playerIds })
      .groupBy('player.id');

    if (tournamentId) {
      query.andWhere('fantasyTeam.tournament_id = :tournamentId', { tournamentId });
    }

    if (matchdayId) {
      query.andWhere('transfer.matchday_id = :matchdayId', { matchdayId });
    }

    const rows = await query.getRawMany<{ playerId: string; count: string }>();
    return rows.map((row) => ({ playerId: row.playerId, count: Number.parseInt(row.count, 10) || 0 }));
  }

  private isInCurrentRound(effectiveAt: Date, currentMatchday: MatchdayEntity) {
    const startsAt = currentMatchday.opensAt ?? currentMatchday.deadlineAt;
    return effectiveAt >= startsAt && effectiveAt <= currentMatchday.deadlineAt;
  }

  private async getPlayerLiveStats(player: PlayerEntity) {
    const eventRows = await this.playerScoreEventsRepository
      .createQueryBuilder('event')
      .select('event.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('event.player_id = :playerId', { playerId: player.id })
      .groupBy('event.type')
      .getRawMany<{ type: string; count: string }>();

    const eventCounts = new Map(eventRows.map((row) => [row.type, Number.parseInt(row.count, 10) || 0]));
    const tournamentId = player.team?.tournament?.id;

    let ownership = 0;
    let selectedBy = 0;

    if (tournamentId) {
      const [selectedTeamsRow, totalTeams] = await Promise.all([
        this.fantasyPicksRepository
          .createQueryBuilder('pick')
          .innerJoin('pick.fantasyTeam', 'fantasyTeam')
          .select('COUNT(DISTINCT fantasyTeam.id)', 'count')
          .where('pick.player_id = :playerId', { playerId: player.id })
          .andWhere('fantasyTeam.tournament_id = :tournamentId', { tournamentId })
          .getRawOne<{ count: string }>(),
        this.fantasyTeamsRepository.count({ where: { tournament: { id: tournamentId } } }),
      ]);

      const selectedTeams = Number.parseInt(selectedTeamsRow?.count ?? '0', 10) || 0;
      const percentage = totalTeams > 0 ? Number(((selectedTeams / totalTeams) * 100).toFixed(1)) : 0;
      ownership = percentage;
      selectedBy = percentage;
    }

    return {
      minutesPlayed: player.minutesPlayed ?? 0,
      goals: (eventCounts.get('goal') ?? 0) + (eventCounts.get('penalty_scored') ?? 0),
      assists: eventCounts.get('assist') ?? 0,
      cleanSheets: eventCounts.get('clean_sheet') ?? 0,
      yellowCards: eventCounts.get('yellow_card') ?? 0,
      redCards: eventCounts.get('red_card') ?? 0,
      saves: (eventCounts.get('save') ?? 0) + (eventCounts.get('penalty_save') ?? 0),
      ownership,
      selectedBy,
      shotsOnTarget: null,
      passCompletion: null,
    };
  }
}
