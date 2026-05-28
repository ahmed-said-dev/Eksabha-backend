import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { PlayerEntity } from '../catalog/entities/player.entity';
import { PlayerPriceEntity } from '../catalog/entities/player-price.entity';
import { TeamEntity } from '../catalog/entities/team.entity';
import { BulkPlayerActionAdminDto } from './dto/bulk-player-action-admin.dto';
import { CreatePlayerAdminDto } from './dto/create-player-admin.dto';
import { UpdatePlayerAdminDto } from './dto/update-player-admin.dto';

const ADMIN_DASHBOARD_COMPETITION_KEY = 'world-cup-2026';

@Injectable()
export class PlayerAdminService {
  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playersRepository: Repository<PlayerEntity>,
    @InjectRepository(PlayerPriceEntity)
    private readonly playerPricesRepository: Repository<PlayerPriceEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamsRepository: Repository<TeamEntity>,
  ) {}

  async getTeams(tournamentId?: string) {
    const qb = this.teamsRepository
      .createQueryBuilder('team')
      .leftJoinAndSelect('team.tournament', 'tournament')
      .orderBy('team.name', 'ASC');

    if (tournamentId) {
      qb.where('tournament.id = :tournamentId', { tournamentId });
    } else {
      qb.where('tournament.competitionKey = :competitionKey', {
        competitionKey: ADMIN_DASHBOARD_COMPETITION_KEY,
      });
    }

    return qb.getMany();
  }

  async getPlayers(options: {
    tournamentId?: string;
    teamId?: string;
    search?: string;
    includeInactive?: boolean;
  }) {
    const qb = this.playersRepository
      .createQueryBuilder('player')
      .leftJoinAndSelect('player.team', 'team')
      .leftJoinAndSelect('team.tournament', 'tournament')
      .orderBy('team.name', 'ASC')
      .addOrderBy('player.name', 'ASC');

    if (options.tournamentId) {
      qb.where('tournament.id = :tournamentId', {
        tournamentId: options.tournamentId,
      });
    } else {
      qb.where('tournament.competitionKey = :competitionKey', {
        competitionKey: ADMIN_DASHBOARD_COMPETITION_KEY,
      });
    }

    if (!options.includeInactive) {
      qb.andWhere('player.is_active = :isActive', { isActive: true });
    }

    if (options.teamId) {
      qb.andWhere('team.id = :teamId', { teamId: options.teamId });
    }

    if (options.search?.trim()) {
      const query = `%${options.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(player.name) LIKE :query OR LOWER(player.short_name) LIKE :query OR LOWER(team.name) LIKE :query)',
        { query },
      );
    }

    return qb.getMany();
  }

  async createPlayer(dto: CreatePlayerAdminDto) {
    const team = await this.teamsRepository.findOne({ where: { id: dto.teamId } });
    if (!team) {
      throw new NotFoundException('Team not found.');
    }

    const normalizedName = dto.name.trim();
    const player = this.playersRepository.create({
      name: normalizedName,
      shortName: dto.shortName?.trim() || this.buildShortName(normalizedName),
      position: dto.position,
      team,
      currentPrice: dto.currentPrice.toFixed(2),
      externalProviderId: dto.externalProviderId?.trim() || null,
      isActive: dto.isActive ?? true,
      isInjured: dto.isInjured ?? false,
      isSuspended: dto.isSuspended ?? false,
      minutesPlayed: dto.minutesPlayed ?? 0,
      totalPoints: dto.totalPoints ?? 0,
    });

    return this.playersRepository.manager.transaction(async (manager) => {
      const playerRepository = manager.getRepository(PlayerEntity);
      const playerPriceRepository = manager.getRepository(PlayerPriceEntity);
      const savedPlayer = await playerRepository.save(player);

      await this.recordPriceHistory(playerPriceRepository, savedPlayer, dto.currentPrice, 'admin_player_create');

      return this.serializePlayer(savedPlayer);
    });
  }

  async applyBulkAction(dto: BulkPlayerActionAdminDto) {
    const uniquePlayerIds = Array.from(new Set(dto.playerIds.filter(Boolean)));

    if (!uniquePlayerIds.length) {
      throw new BadRequestException('At least one player id is required.');
    }

    const players = await this.playersRepository.find({
      where: { id: In(uniquePlayerIds) },
      relations: { team: true },
    });

    if (!players.length) {
      throw new NotFoundException('No matching players were found.');
    }

    const missingPlayerIds = uniquePlayerIds.filter((playerId) => !players.some((player) => player.id === playerId));

    if (dto.action === 'delete') {
      await this.playersRepository.softRemove(players);
    } else {
      const isActive = dto.action === 'activate';
      for (const player of players) {
        player.isActive = isActive;
      }
      await this.playersRepository.save(players);
    }

    return {
      success: true,
      action: dto.action,
      requested: uniquePlayerIds.length,
      affected: players.length,
      playerIds: players.map((player) => player.id),
      missingPlayerIds,
    };
  }

  async updatePlayer(playerId: string, dto: UpdatePlayerAdminDto) {
    const player = await this.playersRepository.findOne({
      where: { id: playerId },
      relations: { team: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found.');
    }

    if (dto.teamId) {
      const team = await this.teamsRepository.findOne({ where: { id: dto.teamId } });
      if (!team) {
        throw new NotFoundException('Team not found.');
      }
      player.team = team;
    }

    if (dto.name !== undefined) {
      const normalizedName = dto.name.trim();
      player.name = normalizedName;
      if (!dto.shortName) {
        player.shortName = this.buildShortName(normalizedName);
      }
    }

    if (dto.shortName !== undefined) {
      player.shortName = dto.shortName.trim();
    }

    if (dto.position !== undefined) {
      player.position = dto.position;
    }

    const previousPrice = player.currentPrice;

    if (dto.currentPrice !== undefined) {
      player.currentPrice = dto.currentPrice.toFixed(2);
    }

    if (dto.externalProviderId !== undefined) {
      player.externalProviderId = dto.externalProviderId?.trim() || null;
    }

    if (dto.isActive !== undefined) {
      player.isActive = dto.isActive;
    }

    if (dto.isInjured !== undefined) {
      player.isInjured = dto.isInjured;
    }

    if (dto.isSuspended !== undefined) {
      player.isSuspended = dto.isSuspended;
    }

    if (dto.minutesPlayed !== undefined) {
      player.minutesPlayed = dto.minutesPlayed;
    }

    if (dto.totalPoints !== undefined) {
      player.totalPoints = dto.totalPoints;
    }

    return this.playersRepository.manager.transaction(async (manager) => {
      const playerRepository = manager.getRepository(PlayerEntity);
      const playerPriceRepository = manager.getRepository(PlayerPriceEntity);
      const savedPlayer = await playerRepository.save(player);

      if (dto.currentPrice !== undefined && this.hasPriceChanged(previousPrice, dto.currentPrice)) {
        await this.recordPriceHistory(playerPriceRepository, savedPlayer, dto.currentPrice, 'admin_player_price_update');
      }

      return this.serializePlayer(savedPlayer);
    });
  }

  async setPlayerActive(playerId: string, isActive: boolean) {
    const player = await this.playersRepository.findOne({ where: { id: playerId } });
    if (!player) {
      throw new NotFoundException('Player not found.');
    }

    player.isActive = isActive;
    return this.serializePlayer(await this.playersRepository.save(player));
  }

  async getStats(tournamentId?: string) {
    const baseQuery = this.playersRepository
      .createQueryBuilder('player')
      .leftJoin('player.team', 'team')
      .leftJoin('team.tournament', 'tournament');

    if (tournamentId) {
      baseQuery.where('tournament.id = :tournamentId', {
        tournamentId,
      });
    } else {
      baseQuery.where('tournament.competitionKey = :competitionKey', {
        competitionKey: ADMIN_DASHBOARD_COMPETITION_KEY,
      });
    }

    const [total, active, inactive, injured, suspended] = await Promise.all([
      baseQuery.clone().getCount(),
      baseQuery.clone().andWhere('player.is_active = :isActive', { isActive: true }).getCount(),
      baseQuery.clone().andWhere('player.is_active = :isActive', { isActive: false }).getCount(),
      baseQuery.clone().andWhere('player.is_injured = :isInjured', { isInjured: true }).getCount(),
      baseQuery.clone().andWhere('player.is_suspended = :isSuspended', { isSuspended: true }).getCount(),
    ]);

    const byPositionQuery = this.playersRepository
      .createQueryBuilder('p')
      .leftJoin('p.team', 't')
      .leftJoin('t.tournament', 'tournament')
      .select('p.position', 'position')
      .addSelect('COUNT(p.id)', 'count');

    if (tournamentId) {
      byPositionQuery.where('tournament.id = :tournamentId', { tournamentId });
    } else {
      byPositionQuery.where('tournament.competitionKey = :competitionKey', {
        competitionKey: ADMIN_DASHBOARD_COMPETITION_KEY,
      });
    }

    const byPosition = await byPositionQuery
      .groupBy('p.position')
      .getRawMany();

    const byTeamQuery = this.playersRepository
      .createQueryBuilder('p')
      .select('t.id', 'teamId')
      .addSelect('t.name', 'teamName')
      .addSelect('COUNT(p.id)', 'total')
      .addSelect('SUM(CASE WHEN p.is_active = true THEN 1 ELSE 0 END)', 'active')
      .leftJoin('p.team', 't')
      .leftJoin('t.tournament', 'tournament');

    if (tournamentId) {
      byTeamQuery.where('tournament.id = :tournamentId', { tournamentId });
    } else {
      byTeamQuery.where('tournament.competitionKey = :competitionKey', {
        competitionKey: ADMIN_DASHBOARD_COMPETITION_KEY,
      });
    }

    const byTeam = await byTeamQuery
      .groupBy('t.id')
      .addGroupBy('t.name')
      .orderBy('t.name', 'ASC')
      .getRawMany();

    return { total, active, inactive, injured, suspended, byPosition, byTeam };
  }

  async deletePlayer(playerId: string): Promise<{ success: boolean; id: string }> {
    const player = await this.playersRepository.findOne({ where: { id: playerId } });
    if (!player) {
      throw new NotFoundException('Player not found.');
    }

    await this.playersRepository.softRemove(player);
    return { success: true, id: playerId };
  }

  private buildShortName(fullName: string) {
    const clean = fullName.trim().replace(/\s+/g, ' ');
    const parts = clean.split(' ').filter(Boolean);

    if (parts.length <= 1) {
      return clean.slice(0, 80);
    }

    return `${parts[0][0]}. ${parts[parts.length - 1]}`.slice(0, 80);
  }

  private hasPriceChanged(previousPrice: string, nextPrice: number) {
    return previousPrice !== nextPrice.toFixed(2);
  }

  private async recordPriceHistory(
    repository: Repository<PlayerPriceEntity>,
    player: PlayerEntity,
    price: number,
    reason: string,
  ) {
    await repository.save(
      repository.create({
        player,
        price: price.toFixed(2),
        effectiveAt: new Date(),
        reason,
      }),
    );
  }

  private serializePlayer(player: PlayerEntity) {
    return {
      ...player,
      availability: {
        statusType: player.isSuspended ? 'suspension' as const : player.isInjured ? 'injury' as const : 'available' as const,
        severity: player.isSuspended ? 'high' as const : player.isInjured ? 'medium' as const : 'none' as const,
        confidence: player.isSuspended ? 'high' as const : player.isInjured ? 'medium' as const : 'high' as const,
        expectedReturn: player.isSuspended ? 'Awaiting next eligible matchday' : player.isInjured ? 'Unknown return date' : null,
        sourceLabel: player.isSuspended ? 'Disciplinary / admin review' : player.isInjured ? 'Medical / admin review' : 'Player active',
        updatedAt: player.updatedAt?.toISOString?.() ?? null,
        suspensionReason: player.isSuspended ? 'Suspended' : null,
      },
    };
  }
}
