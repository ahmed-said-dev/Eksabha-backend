import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { ChipType } from '../../common/database';
import { AdminAuditLogEntity } from '../admin/entities/admin-audit-log.entity';
import { PlayerEntity } from '../catalog/entities/player.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { TournamentService } from '../tournament/tournament.service';
import { UserEntity } from '../users/entities/user.entity';
import { ActivateChipDto } from './dto/activate-chip.dto';
import { DeadlineLockService } from './deadline-lock.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateCaptaincyDto } from './dto/update-captaincy.dto';
import { UpdateFantasyTeamDto } from './dto/update-fantasy-team.dto';
import { ChipActivationEntity } from './entities/chip-activation.entity';
import { FantasyPickEntity } from './entities/fantasy-pick.entity';
import { FantasyPickSnapshotEntity } from './entities/fantasy-pick-snapshot.entity';
import { FantasyTeamEntity } from './entities/fantasy-team.entity';
import { FantasyTeamSnapshotEntity } from './entities/fantasy-team-snapshot.entity';
import { TransferEntity } from './entities/transfer.entity';

const ALLOWED_STARTER_FORMATIONS = new Set([
  '4/4/2',
  '3/5/2',
  '3/4/3',
  '5/2/3',
  '5/3/2',
  '4/3/3',
  '4/5/1',
  '5/4/1',
]);

type FantasyTeamTransferPlayer = {
  id: string;
  externalProviderId: string | null;
  name: string;
  shortName: string;
  position: string;
  currentPrice: string;
  totalPoints: number;
  isInjured: boolean;
  isSuspended: boolean;
  isActive: boolean;
  team: {
    id: string;
    externalProviderId: string | null;
    name: string;
    shortName: string;
    code: string;
    flagUrl: string | null;
  } | null;
};

type FantasyTeamTransferRow = {
  id: string;
  transferredAt: string;
  costHit: number;
  matchdayNumber: number | null;
  playerIn: FantasyTeamTransferPlayer;
  playerOut: FantasyTeamTransferPlayer;
};

type FantasyTeamTransferSummary = {
  totalTransfers: number;
  transfersUsedThisRound: number;
  transferCostThisRound: number;
  transferCostTotal: number;
  squadValue: number;
  inTheBank: number;
};

type FantasyTeamWithInsights = FantasyTeamEntity & {
  transfersSummary: FantasyTeamTransferSummary;
  recentTransfers: FantasyTeamTransferRow[];
  transferHistory: FantasyTeamTransferRow[];
  availableMatchdays?: Array<{
    id: string;
    number: number;
    label: string;
    isCurrent: boolean;
  }>;
  selectedMatchday?: {
    id: string;
    number: number;
    label: string;
    isCurrent: boolean;
  } | null;
};

@Injectable()
export class FantasyService {
  constructor(
    @InjectRepository(FantasyTeamEntity)
    private readonly fantasyTeamsRepository: Repository<FantasyTeamEntity>,
    @InjectRepository(FantasyPickEntity)
    private readonly fantasyPicksRepository: Repository<FantasyPickEntity>,
    @InjectRepository(FantasyTeamSnapshotEntity)
    private readonly fantasyTeamSnapshotsRepository: Repository<FantasyTeamSnapshotEntity>,
    @InjectRepository(FantasyPickSnapshotEntity)
    private readonly fantasyPickSnapshotsRepository: Repository<FantasyPickSnapshotEntity>,
    @InjectRepository(ChipActivationEntity)
    private readonly chipActivationsRepository: Repository<ChipActivationEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playersRepository: Repository<PlayerEntity>,
    @InjectRepository(TransferEntity)
    private readonly transfersRepository: Repository<TransferEntity>,
    @InjectRepository(MatchdayEntity)
    private readonly matchdaysRepository: Repository<MatchdayEntity>,
    @InjectRepository(AdminAuditLogEntity)
    private readonly adminAuditLogsRepository: Repository<AdminAuditLogEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly tournamentService: TournamentService,
    private readonly deadlineLockService: DeadlineLockService,
  ) {}

  async getFantasyTeamForUser(userId: string, tournamentId?: string): Promise<FantasyTeamEntity> {
    const where = tournamentId
      ? { user: { id: userId }, tournament: { id: tournamentId } }
      : { user: { id: userId } };

    const fantasyTeams = await this.fantasyTeamsRepository.find({
      where,
      relations: {
        user: { profile: true },
        tournament: true,
        picks: { player: { team: true } },
        chipActivations: { matchday: true },
      },
      order: { createdAt: 'DESC' },
      take: 1,
    });

    let fantasyTeam = fantasyTeams[0];

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found for this user.');
    }

    fantasyTeam = await this.syncChipState(fantasyTeam);
    fantasyTeam.picks = await this.hydrateMissingPlayersOnPicks(fantasyTeam.picks);

    if (fantasyTeam.tournament?.format !== 'world_cup') {
      throw new NotFoundException('This app only supports FIFA World Cup fantasy data.');
    }

    return fantasyTeam;
  }

  async getFantasyTeam(fantasyTeamId: string, matchdayNumber?: number): Promise<FantasyTeamWithInsights> {
    const fantasyTeam = await this.getFantasyTeamCore(fantasyTeamId);
    return this.attachTransferInsights(fantasyTeam, matchdayNumber);
  }

  private async getFantasyTeamCore(fantasyTeamId: string): Promise<FantasyTeamEntity> {
    let fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: { id: fantasyTeamId },
      relations: {
        user: { profile: true },
        tournament: true,
        picks: { player: { team: true } },
        chipActivations: { matchday: true },
      },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found.');
    }

    fantasyTeam = await this.syncChipState(fantasyTeam);
    fantasyTeam.picks = await this.hydrateMissingPlayersOnPicks(fantasyTeam.picks);

    return fantasyTeam;
  }

  private serializeTransferPlayer(player: PlayerEntity | null): FantasyTeamTransferPlayer {
    return {
      id: player?.id ?? '',
      externalProviderId: player?.externalProviderId ?? null,
      name: player?.name ?? 'Unknown Player',
      shortName: player?.shortName ?? 'Unknown',
      position: player?.position ?? 'MID',
      currentPrice: player?.currentPrice ?? '0.00',
      totalPoints: player?.totalPoints ?? 0,
      isInjured: player?.isInjured ?? false,
      isSuspended: player?.isSuspended ?? false,
      isActive: player?.isActive ?? false,
      team: player?.team
        ? {
          id: player.team.id,
          externalProviderId: player.team.externalProviderId ?? null,
          name: player.team.name,
          shortName: player.team.shortName,
          code: player.team.code,
          flagUrl: player.team.flagUrl ?? null,
        }
        : null,
    };
  }

  private async attachTransferInsights(fantasyTeam: FantasyTeamEntity, matchdayNumber?: number): Promise<FantasyTeamWithInsights> {
    const availableMatchdays = fantasyTeam.tournament?.id
      ? await this.matchdaysRepository.find({
        where: { tournament: { id: fantasyTeam.tournament.id } },
        relations: { tournament: true },
        order: { number: 'DESC' },
      })
      : [];

    const resolvedMatchday = matchdayNumber !== undefined
      ? availableMatchdays.find((matchday) => matchday.number === matchdayNumber) ?? null
      : (fantasyTeam.tournament?.currentMatchdayNumber
        ? await this.getCurrentMatchday(fantasyTeam.tournament.id, fantasyTeam.tournament.currentMatchdayNumber)
        : null);

    const currentMatchday = resolvedMatchday;

    let resolvedPicks = fantasyTeam.picks;
    if (currentMatchday && currentMatchday.number !== fantasyTeam.tournament?.currentMatchdayNumber) {
      const snapshot = await this.fantasyTeamSnapshotsRepository.findOne({
        where: { fantasyTeam: { id: fantasyTeam.id }, matchday: { id: currentMatchday.id } },
        relations: { picks: { player: { team: true } }, matchday: true, fantasyTeam: true },
      });

      if (snapshot) {
        resolvedPicks = snapshot.picks.map((pickSnapshot) => this.fantasyPicksRepository.create({
          fantasyTeam,
          player: pickSnapshot.player,
          playerId: pickSnapshot.player.id,
          positionOrder: pickSnapshot.positionOrder,
          isCaptain: pickSnapshot.isCaptain,
          isViceCaptain: pickSnapshot.isViceCaptain,
          isBenched: pickSnapshot.isBenched,
          multiplier: pickSnapshot.multiplier,
          buyPrice: pickSnapshot.buyPrice,
          sellPrice: pickSnapshot.sellPrice,
          livePoints: pickSnapshot.livePoints,
        }));

        fantasyTeam.name = snapshot.name;
        fantasyTeam.formationCode = snapshot.formationCode;
        fantasyTeam.budgetRemaining = snapshot.budgetRemaining;
        fantasyTeam.totalBudget = snapshot.totalBudget;
        fantasyTeam.teamValue = snapshot.teamValue;
        fantasyTeam.freeTransfers = snapshot.freeTransfers;
        fantasyTeam.activeChipType = snapshot.activeChipType;
      }
    }

    fantasyTeam.picks = resolvedPicks;

    const [totalsRow, thisRoundRow, transferHistory] = await Promise.all([
      this.transfersRepository
        .createQueryBuilder('transfer')
        .select('COUNT(*)', 'totalTransfers')
        .addSelect('COALESCE(SUM(transfer.cost_hit), 0)', 'totalCostHit')
        .where('transfer.fantasy_team_id = :fantasyTeamId', { fantasyTeamId: fantasyTeam.id })
        .getRawOne<{ totalTransfers: string; totalCostHit: string }>(),
      currentMatchday
        ? this.transfersRepository
          .createQueryBuilder('transfer')
          .select('COUNT(*)', 'transfersUsedThisRound')
          .addSelect('COALESCE(SUM(transfer.cost_hit), 0)', 'costHitThisRound')
          .where('transfer.fantasy_team_id = :fantasyTeamId', { fantasyTeamId: fantasyTeam.id })
          .andWhere('transfer.matchday_id = :matchdayId', { matchdayId: currentMatchday.id })
          .getRawOne<{ transfersUsedThisRound: string; costHitThisRound: string }>()
        : Promise.resolve({ transfersUsedThisRound: '0', costHitThisRound: '0' }),
      this.transfersRepository
        .createQueryBuilder('transfer')
        .leftJoinAndSelect('transfer.playerIn', 'playerIn')
        .leftJoinAndSelect('playerIn.team', 'playerInTeam')
        .leftJoinAndSelect('transfer.playerOut', 'playerOut')
        .leftJoinAndSelect('playerOut.team', 'playerOutTeam')
        .leftJoinAndSelect('transfer.matchday', 'matchday')
        .where('transfer.fantasy_team_id = :fantasyTeamId', { fantasyTeamId: fantasyTeam.id })
        .orderBy('transfer.transferredAt', 'DESC')
        .limit(120)
        .getMany(),
    ]);

    const mappedTransferHistory: FantasyTeamTransferRow[] = transferHistory.map((transfer) => ({
      id: transfer.id,
      transferredAt: transfer.transferredAt.toISOString(),
      costHit: transfer.costHit,
      matchdayNumber: transfer.matchday?.number ?? null,
      playerIn: this.serializeTransferPlayer(transfer.playerIn),
      playerOut: this.serializeTransferPlayer(transfer.playerOut),
    }));

    return Object.assign(fantasyTeam, {
      transfersSummary: {
        totalTransfers: Number.parseInt(totalsRow?.totalTransfers ?? '0', 10) || 0,
        transfersUsedThisRound: Number.parseInt(thisRoundRow?.transfersUsedThisRound ?? '0', 10) || 0,
        transferCostThisRound: Number.parseInt(thisRoundRow?.costHitThisRound ?? '0', 10) || 0,
        transferCostTotal: Number.parseInt(totalsRow?.totalCostHit ?? '0', 10) || 0,
        squadValue: Number.parseFloat(fantasyTeam.teamValue) || 0,
        inTheBank: Number.parseFloat(fantasyTeam.budgetRemaining) || 0,
      },
      recentTransfers: mappedTransferHistory.slice(0, 5),
      transferHistory: mappedTransferHistory,
      availableMatchdays: availableMatchdays.map((matchday) => ({
        id: matchday.id,
        number: matchday.number,
        label: `Round ${matchday.number}`,
        isCurrent: matchday.number === fantasyTeam.tournament?.currentMatchdayNumber,
      })),
      selectedMatchday: currentMatchday
        ? {
          id: currentMatchday.id,
          number: currentMatchday.number,
          label: `Round ${currentMatchday.number}`,
          isCurrent: currentMatchday.number === fantasyTeam.tournament?.currentMatchdayNumber,
        }
        : null,
    });
  }

  async getDeadlineSummaryForUser(userId: string, tournamentId?: string) {
    const fantasyTeam = await this.getFantasyTeamForUser(userId, tournamentId);
    if (!fantasyTeam.tournament?.id || typeof fantasyTeam.tournament.currentMatchdayNumber !== 'number') {
      throw new NotFoundException('Current matchday not configured for this tournament.');
    }

    const currentMatchday = await this.getCurrentMatchday(
      fantasyTeam.tournament.id,
      fantasyTeam.tournament.currentMatchdayNumber,
    );

    if (!currentMatchday) {
      throw new NotFoundException('Current matchday not found.');
    }

    const deadlineAt = this.resolveDeadlineAt(currentMatchday.deadlineAt);
    const opensAt = this.resolveOptionalDateIso(currentMatchday.opensAt);
    const locksAt = this.resolveOptionalDateIso(currentMatchday.locksAt);
    const lockStatus = await this.deadlineLockService.getMatchdayLockStatus(currentMatchday.id);
    const startingPicks = fantasyTeam.picks.filter((pick) => !pick.isBenched);
    const benchPicks = fantasyTeam.picks.filter((pick) => pick.isBenched);
    const availableChipLabels = this.getAvailableChipLabels(fantasyTeam);

    const checklist = {
      captainSelectionComplete: startingPicks.some((pick) => pick.isCaptain) && startingPicks.some((pick) => pick.isViceCaptain),
      unsavedChangesRisk: false,
      unusedFreeTransfer: fantasyTeam.freeTransfers > 0,
      benchOrderReviewNeeded: benchPicks.length !== 4,
      availableChipReminder: availableChipLabels.length > 0,
    };

    return {
      matchday: {
        id: currentMatchday.id,
        number: currentMatchday.number,
        phase: currentMatchday.phase,
        status: currentMatchday.status,
        opensAt,
        deadlineAt: deadlineAt.toISOString(),
        locksAt,
        isLocked: lockStatus.isLocked,
      },
      tournament: {
        id: fantasyTeam.tournament.id,
        name: fantasyTeam.tournament.name,
        status: fantasyTeam.tournament.status,
        currentMatchdayNumber: fantasyTeam.tournament.currentMatchdayNumber,
        visibleTeamMatchdayNumber: fantasyTeam.tournament.visibleTeamMatchdayNumber,
        visibleLivePointsMatchdayNumber: fantasyTeam.tournament.visibleLivePointsMatchdayNumber,
      },
      checklist,
      summary: {
        freeTransfers: fantasyTeam.freeTransfers,
        activeChip: fantasyTeam.activeChipType,
        availableChipLabels,
        startingPlayers: startingPicks.length,
        benchPlayers: benchPicks.length,
      },
      recommendations: [
        ...(!checklist.captainSelectionComplete ? ['Review captain and vice-captain before the deadline.'] : []),
        ...(checklist.unusedFreeTransfer ? ['You still have a free transfer available this round.'] : []),
        ...(checklist.benchOrderReviewNeeded ? ['Review bench order before the deadline lock.'] : []),
        ...(checklist.availableChipReminder ? [`Available chips: ${availableChipLabels.join(', ')}.`] : []),
      ],
      countdown: {
        now: new Date().toISOString(),
        deadlineAt: deadlineAt.toISOString(),
        minutesUntilDeadline: Math.max(0, Math.floor((deadlineAt.getTime() - Date.now()) / 60_000)),
        priority: lockStatus.isLocked ? 'locked' : this.resolveDeadlinePriority(deadlineAt),
      },
    };
  }

  private resolveDeadlineAt(rawDeadlineAt: Date | string | null | undefined) {
    if (!rawDeadlineAt) {
      throw new NotFoundException('Current matchday deadline is not configured.');
    }

    if (rawDeadlineAt instanceof Date) {
      if (Number.isNaN(rawDeadlineAt.getTime())) {
        throw new NotFoundException('Current matchday deadline is invalid.');
      }

      return rawDeadlineAt;
    }

    const parsedDeadlineAt = new Date(rawDeadlineAt);
    if (Number.isNaN(parsedDeadlineAt.getTime())) {
      throw new NotFoundException('Current matchday deadline is invalid.');
    }

    return parsedDeadlineAt;
  }

  private resolveOptionalDateIso(rawDate: Date | string | null | undefined) {
    if (!rawDate) {
      return null;
    }

    if (rawDate instanceof Date) {
      return Number.isNaN(rawDate.getTime()) ? null : rawDate.toISOString();
    }

    const parsedDate = new Date(rawDate);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
  }

  async updateFantasyTeamForUser(userId: string, dto: UpdateFantasyTeamDto, tournamentId?: string) {
    await this.deadlineLockService.ensureMatchdayUnlockedForMutations();

    const fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: tournamentId
        ? { user: { id: userId }, tournament: { id: tournamentId } }
        : { user: { id: userId } },
      relations: { tournament: true, picks: { player: true }, chipActivations: { matchday: true } },
      order: { createdAt: 'DESC' },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found for this user.');
    }

    const syncedFantasyTeam = await this.syncChipState(fantasyTeam);

    try {
      const updatedTeam = await this.updateFantasyTeam(syncedFantasyTeam.id, dto);
      await this.recordManagerMutationAudit({
        actionType: 'manager_team_saved',
        targetId: syncedFantasyTeam.id,
        reason: 'manager_team_saved',
        actorUserId: userId,
        beforeState: {
          updatedAt: syncedFantasyTeam.updatedAt,
          formationCode: syncedFantasyTeam.formationCode,
        },
        afterState: {
          updatedAt: updatedTeam.updatedAt,
          formationCode: updatedTeam.formationCode,
        },
      });

      return this.attachMutationMeta(updatedTeam, 'team_save');
    } catch (error) {
      await this.recordManagerMutationAudit({
        actionType: 'manager_team_save_failed',
        targetId: syncedFantasyTeam.id,
        reason: error instanceof Error ? error.message : 'manager_team_save_failed',
        actorUserId: userId,
        beforeState: {
          updatedAt: syncedFantasyTeam.updatedAt,
          formationCode: syncedFantasyTeam.formationCode,
        },
        afterState: null,
      });

      throw error;
    }
  }

  async updateCaptaincyForUser(userId: string, dto: UpdateCaptaincyDto, tournamentId?: string) {
    await this.deadlineLockService.ensureMatchdayUnlockedForMutations();

    const fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: tournamentId
        ? { user: { id: userId }, tournament: { id: tournamentId } }
        : { user: { id: userId } },
      relations: { tournament: true, picks: { player: true }, chipActivations: { matchday: true } },
      order: { createdAt: 'DESC' },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found for this user.');
    }

    const syncedFantasyTeam = await this.syncChipState(fantasyTeam);

    if (dto.captainPlayerId === dto.viceCaptainPlayerId) {
      throw new BadRequestException('Captain and vice-captain must be different players.');
    }

    const captainPick = syncedFantasyTeam.picks.find(
      (pick) => pick.player.id === dto.captainPlayerId,
    );
    const viceCaptainPick = syncedFantasyTeam.picks.find(
      (pick) => pick.player.id === dto.viceCaptainPlayerId,
    );

    if (!captainPick || !viceCaptainPick) {
      throw new NotFoundException('Captain or vice-captain player does not belong to this fantasy team.');
    }

    if (captainPick.isBenched || viceCaptainPick.isBenched) {
      throw new BadRequestException('Captain and vice-captain must both be selected from the starting eleven.');
    }

    try {
      const captainMultiplier = this.getCaptainMultiplier(syncedFantasyTeam.activeChipType);

      for (const pick of syncedFantasyTeam.picks) {
        pick.isCaptain = pick.player.id === dto.captainPlayerId;
        pick.isViceCaptain = pick.player.id === dto.viceCaptainPlayerId;
        pick.multiplier = pick.isCaptain ? captainMultiplier : 1;
        await this.fantasyPicksRepository.save(pick);
      }

      const updatedTeam = await this.getFantasyTeam(syncedFantasyTeam.id);
      await this.recordManagerMutationAudit({
        actionType: 'manager_captaincy_saved',
        targetId: syncedFantasyTeam.id,
        reason: 'manager_captaincy_saved',
        actorUserId: userId,
        beforeState: {
          updatedAt: syncedFantasyTeam.updatedAt,
          captainPlayerId: captainPick.player.id,
          viceCaptainPlayerId: viceCaptainPick.player.id,
        },
        afterState: {
          updatedAt: updatedTeam.updatedAt,
          captainPlayerId: dto.captainPlayerId,
          viceCaptainPlayerId: dto.viceCaptainPlayerId,
        },
      });

      return this.attachMutationMeta(updatedTeam, 'captaincy_save');
    } catch (error) {
      await this.recordManagerMutationAudit({
        actionType: 'manager_captaincy_save_failed',
        targetId: syncedFantasyTeam.id,
        reason: error instanceof Error ? error.message : 'manager_captaincy_save_failed',
        actorUserId: userId,
        beforeState: {
          updatedAt: syncedFantasyTeam.updatedAt,
          captainPlayerId: captainPick.player.id,
          viceCaptainPlayerId: viceCaptainPick.player.id,
        },
        afterState: null,
      });

      throw error;
    }
  }

  async createTransferForUser(userId: string, dto: CreateTransferDto, tournamentId?: string) {
    let fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: tournamentId
        ? { user: { id: userId }, tournament: { id: tournamentId } }
        : { user: { id: userId } },
      relations: {
        picks: { player: { team: true } },
        tournament: true,
        chipActivations: { matchday: true },
      },
      order: { createdAt: 'DESC' },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found for this user.');
    }

    fantasyTeam = await this.syncChipState(fantasyTeam);
    fantasyTeam.picks = await this.hydrateMissingPlayersOnPicks(
      await this.loadFantasyTeamPicksWithDeletedPlayers(fantasyTeam.id),
    );

    const teamTournament = fantasyTeam.tournament;
    const hasCurrentMatchday = typeof teamTournament?.currentMatchdayNumber === 'number';
    const currentMatchdayForTeam = hasCurrentMatchday
      ? await this.matchdaysRepository.findOne({
          where: {
            tournament: { id: teamTournament.id },
            number: teamTournament.currentMatchdayNumber,
          },
        })
      : null;
    await this.deadlineLockService.ensureMatchdayUnlockedForMutations(currentMatchdayForTeam?.id ?? undefined);

    const { incomingPlayer, outgoingPick, projectedBudget } = await this.prepareTransferMutation(
      fantasyTeam,
      dto,
    );

    const currentTournament = fantasyTeam.tournament;
    const currentMatchday = await this.getCurrentMatchday(
      currentTournament.id,
      currentTournament.currentMatchdayNumber,
    );

    const transfersUsedThisRound = currentMatchday
      ? await this.transfersRepository.count({
          where: {
            fantasyTeam: { id: fantasyTeam.id },
            matchday: { id: currentMatchday.id },
          },
        })
      : 0;

    const { costHit, nextFreeTransfers } = this.resolveTransferAccounting(fantasyTeam, transfersUsedThisRound);

    try {
      const playerOut = outgoingPick.player;
      outgoingPick.player = incomingPlayer;
      outgoingPick.buyPrice = incomingPlayer.currentPrice;
      outgoingPick.sellPrice = incomingPlayer.currentPrice;
      await this.fantasyPicksRepository.save(outgoingPick);

      fantasyTeam.freeTransfers = nextFreeTransfers;
      fantasyTeam.budgetRemaining = projectedBudget.toFixed(2);
      await this.fantasyTeamsRepository.save(fantasyTeam);

      const transfer = this.transfersRepository.create({
        fantasyTeam,
        playerOut,
        playerIn: incomingPlayer,
        transferredAt: new Date(),
        costHit,
        matchday: currentMatchday ?? null,
      });

      await this.transfersRepository.save(transfer);

      const updatedTeam = await this.getFantasyTeam(fantasyTeam.id);
      await this.recordManagerMutationAudit({
        actionType: 'manager_transfer_saved',
        targetId: fantasyTeam.id,
        reason: 'manager_transfer_saved',
        actorUserId: userId,
        beforeState: {
          updatedAt: fantasyTeam.updatedAt,
          playerOutId: dto.playerOutId,
          playerInId: dto.playerInId,
        },
        afterState: {
          updatedAt: updatedTeam.updatedAt,
          playerOutId: dto.playerOutId,
          playerInId: dto.playerInId,
          affectedMatchdayId: currentMatchday?.id ?? null,
        },
      });

      return {
        transfer,
        fantasyTeam: this.attachMutationMeta(updatedTeam, 'transfer_save', currentMatchday?.id ?? null),
      };
    } catch (error) {
      await this.recordManagerMutationAudit({
        actionType: 'manager_transfer_failed',
        targetId: fantasyTeam.id,
        reason: error instanceof Error ? error.message : 'manager_transfer_failed',
        actorUserId: userId,
        beforeState: {
          updatedAt: fantasyTeam.updatedAt,
          playerOutId: dto.playerOutId,
          playerInId: dto.playerInId,
        },
        afterState: null,
      });

      throw error;
    }
  }

  async updateFantasyTeam(fantasyTeamId: string, dto: UpdateFantasyTeamDto) {
    const fantasyTeam = await this.getFantasyTeamForMutation(fantasyTeamId);

    this.applyFantasyTeamMetadata(fantasyTeam, dto);

    await this.fantasyTeamsRepository.save(fantasyTeam);

    if (dto.picks?.length) {
      await this.syncFantasyTeamPicks(fantasyTeam, dto.picks);
    }

    return this.getFantasyTeam(fantasyTeamId);
  }

  async activateChipForUser(userId: string, dto: ActivateChipDto, tournamentId?: string): Promise<FantasyTeamEntity> {
    const currentMatchday = await this.deadlineLockService.ensureMatchdayUnlockedForMutations();

    let fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: tournamentId
        ? { user: { id: userId }, tournament: { id: tournamentId } }
        : { user: { id: userId } },
      relations: {
        tournament: true,
        picks: { player: true },
        chipActivations: { matchday: true },
      },
      order: { createdAt: 'DESC' },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found for this user.');
    }

    fantasyTeam = await this.syncChipState(fantasyTeam);

    if (fantasyTeam.activeChipType && fantasyTeam.activeChipType !== dto.chipType) {
      throw new BadRequestException('Deactivate your currently active chip before activating a different one.');
    }

    if (fantasyTeam.activeChipType === dto.chipType) {
      return this.getFantasyTeam(fantasyTeam.id);
    }

    const activationsForChip = fantasyTeam.chipActivations.filter((activation) => activation.chipType === dto.chipType);
    const maxUses = dto.chipType === ChipType.WILDCARD ? 2 : 1;
    if (activationsForChip.length >= maxUses) {
      throw new BadRequestException(
        dto.chipType === ChipType.WILDCARD
          ? 'Wildcard can only be used twice per tournament.'
          : 'This chip has already been used in this tournament.',
      );
    }

    const activation = this.chipActivationsRepository.create({
      fantasyTeam,
      chipType: dto.chipType,
      isActive: true,
      activatedAt: new Date(),
      consumedAt: null,
      matchday: currentMatchday,
    });

    const savedActivation = await this.chipActivationsRepository.save(activation);
    fantasyTeam.chipActivations = [...fantasyTeam.chipActivations, savedActivation];

    if (dto.chipType === ChipType.FREE_HIT) {
      const existingSnapshot = await this.fantasyTeamSnapshotsRepository.findOne({
        where: { fantasyTeam: { id: fantasyTeam.id }, matchday: { id: currentMatchday.id } },
      });

      if (!existingSnapshot) {
        const snapshot = await this.fantasyTeamSnapshotsRepository.save(
          this.fantasyTeamSnapshotsRepository.create({
            fantasyTeam,
            matchday: currentMatchday,
            name: fantasyTeam.name,
            budgetRemaining: fantasyTeam.budgetRemaining,
            totalBudget: fantasyTeam.totalBudget,
            teamValue: fantasyTeam.teamValue,
            freeTransfers: fantasyTeam.freeTransfers,
            activeChipType: fantasyTeam.activeChipType,
            formationCode: fantasyTeam.formationCode,
            capturedAt: new Date(),
          }),
        );

        const pickSnapshots = fantasyTeam.picks.map((pick) => this.fantasyPickSnapshotsRepository.create({
          fantasyTeamSnapshot: snapshot,
          player: pick.player,
          positionOrder: pick.positionOrder,
          isCaptain: pick.isCaptain,
          isViceCaptain: pick.isViceCaptain,
          isBenched: pick.isBenched,
          multiplier: pick.multiplier,
          buyPrice: pick.buyPrice,
          sellPrice: pick.sellPrice,
          livePoints: pick.livePoints,
        }));

        if (pickSnapshots.length > 0) {
          await this.fantasyPickSnapshotsRepository.save(pickSnapshots);
        }
      }
    }

    fantasyTeam.activeChipType = dto.chipType;
    await this.fantasyTeamsRepository.update(fantasyTeam.id, {
      activeChipType: dto.chipType,
    });

    if (dto.chipType === ChipType.TRIPLE_CAPTAIN) {
      await this.applyCaptainMultiplier(fantasyTeam.picks, this.getCaptainMultiplier(dto.chipType));
    }

    return this.getFantasyTeam(fantasyTeam.id);
  }

  async deactivateChipForUser(userId: string, tournamentId?: string): Promise<FantasyTeamEntity> {
    const currentMatchday = await this.deadlineLockService.ensureMatchdayUnlockedForMutations();

    const fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: tournamentId
        ? { user: { id: userId }, tournament: { id: tournamentId } }
        : { user: { id: userId } },
      relations: {
        tournament: true,
        picks: { player: true },
        chipActivations: { matchday: true },
      },
      order: { createdAt: 'DESC' },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found for this user.');
    }

    if (!fantasyTeam.activeChipType) {
      return this.getFantasyTeam(fantasyTeam.id);
    }

    const activeActivation = fantasyTeam.chipActivations.find(
      (activation) => activation.chipType === fantasyTeam.activeChipType
        && activation.isActive
        && activation.matchday?.id === currentMatchday.id,
    );

    if (activeActivation) {
      await this.chipActivationsRepository.remove(activeActivation);
    }

    fantasyTeam.activeChipType = null;
    await this.fantasyTeamsRepository.update(fantasyTeam.id, {
      activeChipType: null,
    });
    await this.applyCaptainMultiplier(fantasyTeam.picks, 2);

    return this.getFantasyTeam(fantasyTeam.id);
  }

  private async validatePicks(picks: UpdateFantasyTeamDto['picks']) {
    if (!picks?.length) {
      return;
    }

    if (picks.length !== 15) {
      throw new BadRequestException('A fantasy team must contain exactly 15 players.');
    }

    const playerIds = picks.map((pick) => pick.playerId);
    if (new Set(playerIds).size !== playerIds.length) {
      throw new BadRequestException('Duplicate players are not allowed in the same fantasy team.');
    }

    const captainCount = picks.filter((pick) => pick.isCaptain).length;
    const viceCaptainCount = picks.filter((pick) => pick.isViceCaptain).length;

    if (captainCount !== 1) {
      throw new BadRequestException('Exactly one captain must be selected.');
    }

    if (viceCaptainCount !== 1) {
      throw new BadRequestException('Exactly one vice-captain must be selected.');
    }

    const invalidDualRolePick = picks.find(
      (pick) => pick.isCaptain && pick.isViceCaptain,
    );

    if (invalidDualRolePick) {
      throw new BadRequestException('A player cannot be both captain and vice-captain.');
    }

    const duplicatePositions = picks.map((pick) => pick.positionOrder);
    if (new Set(duplicatePositions).size !== duplicatePositions.length) {
      throw new BadRequestException('Each fantasy pick position must be unique.');
    }

    const sortedPositions = [...duplicatePositions].sort((left, right) => left - right);
    const expectedPositions = Array.from({ length: 15 }, (_, index) => index + 1);
    if (sortedPositions.some((position, index) => position !== expectedPositions[index])) {
      throw new BadRequestException('Fantasy team positions must be numbered uniquely from 1 to 15.');
    }

    const starters = picks.filter((pick) => !pick.isBenched);
    const bench = picks.filter((pick) => pick.isBenched);

    if (starters.length !== 11) {
      throw new BadRequestException('A fantasy team must contain exactly 11 starting players.');
    }

    if (bench.length !== 4) {
      throw new BadRequestException('A fantasy team must contain exactly 4 bench players.');
    }

    const captainPick = picks.find((pick) => pick.isCaptain);
    const viceCaptainPick = picks.find((pick) => pick.isViceCaptain);
    if (captainPick?.isBenched || viceCaptainPick?.isBenched) {
      throw new BadRequestException('Captain and vice-captain must both be selected from the starting eleven.');
    }

    const players = await this.playersRepository.find({
      where: { id: In(playerIds) },
      relations: { team: true },
    });

    if (players.length !== playerIds.length) {
      throw new NotFoundException('One or more selected players could not be found.');
    }

    const playerPositionMap = new Map(players.map((player) => [player.id, player.position]));
    const playerTeamMap = new Map(players.map((player) => [player.id, player.team.id]));
    const squadCounts = this.countSquadPositions(
      picks.map((pick) => playerPositionMap.get(pick.playerId)!),
    );
    this.ensureFullSquadPositionCounts(squadCounts);
    this.ensureTeamLimit(picks.map((pick) => playerTeamMap.get(pick.playerId)!));

    const totalSquadValue = players.reduce((sum, player) => sum + Number.parseFloat(player.currentPrice), 0);
    if (totalSquadValue > 100) {
      throw new BadRequestException('The fantasy squad total value cannot exceed 100.0M.');
    }

    const starterCounts = this.countSquadPositions(
      starters.map((pick) => playerPositionMap.get(pick.playerId)!),
    );
    this.ensureStarterPositionCounts(starterCounts);

    const benchCounts = this.countSquadPositions(
      bench.map((pick) => playerPositionMap.get(pick.playerId)!),
    );
    if (benchCounts.GK !== 1) {
      throw new BadRequestException('The bench must contain exactly 1 goalkeeper.');
    }

    if (benchCounts.DEF + benchCounts.MID + benchCounts.FWD !== 3) {
      throw new BadRequestException('The bench must contain exactly 3 outfield players.');
    }
  }

  private countSquadPositions(positions: Array<PlayerEntity['position']>) {
    return positions.reduce(
      (counts, position) => {
        counts[position] += 1;
        return counts;
      },
      {
        GK: 0,
        DEF: 0,
        MID: 0,
        FWD: 0,
      },
    );
  }

  private ensureFullSquadPositionCounts(counts: Record<'GK' | 'DEF' | 'MID' | 'FWD', number>) {
    if (counts.GK !== 2 || counts.DEF !== 5 || counts.MID !== 5 || counts.FWD !== 3) {
      throw new BadRequestException(
        'A fantasy squad must contain exactly 2 goalkeepers, 5 defenders, 5 midfielders, and 3 forwards.',
      );
    }
  }

  private ensureStarterPositionCounts(counts: Record<'GK' | 'DEF' | 'MID' | 'FWD', number>) {
    if (counts.GK !== 1) {
      throw new BadRequestException('The starting eleven must contain exactly 1 goalkeeper.');
    }

    if (counts.DEF < 3 || counts.DEF > 5) {
      throw new BadRequestException('The starting eleven must contain between 3 and 5 defenders.');
    }

    if (counts.MID < 2 || counts.MID > 5) {
      throw new BadRequestException('The starting eleven must contain between 2 and 5 midfielders.');
    }

    if (counts.FWD < 1 || counts.FWD > 3) {
      throw new BadRequestException('The starting eleven must contain between 1 and 3 forwards.');
    }

    const formationLabel = `${counts.DEF}/${counts.MID}/${counts.FWD}`;
    if (!ALLOWED_STARTER_FORMATIONS.has(formationLabel)) {
      throw new BadRequestException(
        `The starting eleven must use one of the allowed formations: ${Array.from(ALLOWED_STARTER_FORMATIONS).join(', ')}.`,
      );
    }
  }

  private ensureTeamLimit(teamIds: string[]) {
    const teamCounts = teamIds.reduce<Record<string, number>>((counts, teamId) => {
      counts[teamId] = (counts[teamId] ?? 0) + 1;
      return counts;
    }, {});

    const violatingTeam = Object.entries(teamCounts).find(([, count]) => count > 3);
    if (violatingTeam) {
      throw new BadRequestException('You can select a maximum of 3 players from the same team.');
    }
  }

  private async prepareTransferMutation(fantasyTeam: FantasyTeamEntity, dto: CreateTransferDto) {
    if (dto.playerInId === dto.playerOutId) {
      throw new BadRequestException('Player in and player out cannot be the same.');
    }

    const outgoingPick = fantasyTeam.picks.find((pick) => pick.player?.id === dto.playerOutId);
    if (!outgoingPick) {
      throw new NotFoundException('The outgoing player is not part of this fantasy team.');
    }

    const otherInvalidPicks = fantasyTeam.picks.filter(
      (pick) => !pick.player && pick.id !== outgoingPick.id,
    );
    if (otherInvalidPicks.length > 0) {
      await this.fantasyPicksRepository.delete(otherInvalidPicks.map((pick) => pick.id));
      fantasyTeam.picks = fantasyTeam.picks.filter(
        (pick) => pick.player || pick.id === outgoingPick.id,
      );
    }

    const incomingPlayer = await this.playersRepository.findOne({
      where: { id: dto.playerInId },
      relations: { team: true },
    });

    if (!incomingPlayer) {
      throw new NotFoundException('Incoming player not found.');
    }

    const duplicateIncoming = fantasyTeam.picks.find((pick) => pick.player?.id === incomingPlayer.id);
    if (duplicateIncoming) {
      throw new BadRequestException('Incoming player already exists in the fantasy team.');
    }

    if (!outgoingPick.player) {
      throw new BadRequestException('The outgoing squad slot does not currently have a valid player assigned.');
    }

    if (incomingPlayer.position !== outgoingPick.player.position) {
      throw new BadRequestException('Transfers must be made between players in the same position.');
    }

    const nextSquadCounts = this.countSquadPositions(
      fantasyTeam.picks.map((pick) =>
        pick.player?.id === outgoingPick.player.id ? incomingPlayer.position : pick.player?.position,
      ),
    );
    this.ensureFullSquadPositionCounts(nextSquadCounts);

    const nextTeamIds = fantasyTeam.picks.map((pick) =>
      pick.player?.id === outgoingPick.player.id ? incomingPlayer.team.id : pick.player?.team?.id,
    );
    if (nextTeamIds.some((teamId) => !teamId)) {
      throw new BadRequestException('Fantasy team contains a player without a valid team assignment. Refresh the squad and try again.');
    }
    this.ensureTeamLimit(nextTeamIds);

    const currentBudget = Number.parseFloat(fantasyTeam.budgetRemaining);
    const outgoingSellPrice = Number.parseFloat(outgoingPick.sellPrice);
    const incomingPrice = Number.parseFloat(incomingPlayer.currentPrice);
    const projectedBudget = currentBudget + outgoingSellPrice - incomingPrice;

    if (projectedBudget < 0) {
      throw new BadRequestException('Insufficient budget for this transfer.');
    }

    return {
      outgoingPick,
      incomingPlayer,
      projectedBudget,
    };
  }

  private async loadFantasyTeamPicksWithDeletedPlayers(fantasyTeamId: string) {
    return this.fantasyPicksRepository
      .createQueryBuilder('pick')
      .withDeleted()
      .leftJoinAndSelect('pick.player', 'player')
      .leftJoinAndSelect('player.team', 'team')
      .where('pick.fantasy_team_id = :fantasyTeamId', { fantasyTeamId })
      .andWhere('pick.deleted_at IS NULL')
      .orderBy('pick.position_order', 'ASC')
      .getMany();
  }

  private async hydrateMissingPlayersOnPicks(picks: FantasyPickEntity[]) {
    const missingPlayerIds = Array.from(new Set(
      picks
        .filter((pick) => !pick.player && pick.playerId)
        .map((pick) => pick.playerId),
    ));

    if (missingPlayerIds.length === 0) {
      return picks;
    }

    const deletedPlayers = await this.playersRepository
      .createQueryBuilder('player')
      .withDeleted()
      .leftJoinAndSelect('player.team', 'team')
      .where('player.id IN (:...playerIds)', { playerIds: missingPlayerIds })
      .getMany();

    const playersById = new Map(deletedPlayers.map((player) => [player.id, player]));

    for (const pick of picks) {
      if (!pick.player && pick.playerId) {
        const restoredPlayer = playersById.get(pick.playerId);
        if (restoredPlayer) {
          pick.player = restoredPlayer;
        }
      }
    }

    return picks;
  }

  private async getFantasyTeamForMutation(fantasyTeamId: string) {
    const fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: { id: fantasyTeamId },
      relations: { tournament: true, picks: { player: true }, chipActivations: { matchday: true } },
    });

    if (!fantasyTeam) {
      throw new NotFoundException('Fantasy team not found.');
    }

    return this.syncChipState(fantasyTeam);
  }

  private applyFantasyTeamMetadata(fantasyTeam: FantasyTeamEntity, dto: UpdateFantasyTeamDto) {
    if (dto.name) {
      fantasyTeam.name = dto.name.trim();
    }

    if (dto.formationCode) {
      fantasyTeam.formationCode = dto.formationCode;
    }
  }

  private async syncFantasyTeamPicks(
    fantasyTeam: FantasyTeamEntity,
    nextPicks: NonNullable<UpdateFantasyTeamDto['picks']>,
  ) {
    await this.validatePicks(nextPicks);

    const nextPlayerIds = new Set(nextPicks.map((pick) => pick.playerId));
    const stalePicks = fantasyTeam.picks.filter(
      (existingPick) => !nextPlayerIds.has(existingPick.player.id),
    );

    if (stalePicks.length > 0) {
      await this.fantasyPicksRepository.delete(stalePicks.map((pick) => pick.id));
      fantasyTeam.picks = fantasyTeam.picks.filter(
        (existingPick) => nextPlayerIds.has(existingPick.player.id),
      );
    }

    for (const nextPick of nextPicks) {
      const pick = await this.findOrCreateFantasyPick(fantasyTeam, nextPick.playerId, nextPick.positionOrder);

      pick.positionOrder = nextPick.positionOrder;
      pick.isCaptain = nextPick.isCaptain;
      pick.isViceCaptain = nextPick.isViceCaptain;
      pick.isBenched = nextPick.isBenched;
      pick.multiplier = nextPick.isCaptain
        ? this.getCaptainMultiplier(fantasyTeam.activeChipType)
        : 1;

      await this.fantasyPicksRepository.save(pick);
    }
  }

  private async findOrCreateFantasyPick(
    fantasyTeam: FantasyTeamEntity,
    playerId: string,
    positionOrder: number,
  ) {
    const existingPick = fantasyTeam.picks.find((pick) => pick.player.id === playerId);
    if (existingPick) {
      return existingPick;
    }

    const player = await this.playersRepository.findOne({ where: { id: playerId } });
    if (!player) {
      throw new NotFoundException(`Player ${playerId} not found.`);
    }

    const newPick = this.fantasyPicksRepository.create({
      fantasyTeam,
      player,
      buyPrice: player.currentPrice,
      sellPrice: player.currentPrice,
      livePoints: 0,
      multiplier: 1,
      isCaptain: false,
      isViceCaptain: false,
      isBenched: false,
      positionOrder,
    });

    fantasyTeam.picks.push(newPick);

    return newPick;
  }

  private async getCurrentMatchday(tournamentId: string, currentMatchdayNumber: number) {
    return this.matchdaysRepository.findOne({
      where: {
        tournament: { id: tournamentId },
        number: currentMatchdayNumber,
      },
      relations: { tournament: true },
    });
  }

  private getAvailableChipLabels(fantasyTeam: FantasyTeamEntity) {
    const activationCounts = new Map<ChipType, number>();

    for (const activation of fantasyTeam.chipActivations) {
      activationCounts.set(activation.chipType, (activationCounts.get(activation.chipType) ?? 0) + 1);
    }

    const chipMeta: Array<{ type: ChipType; label: string; maxUses: number }> = [
      { type: ChipType.WILDCARD, label: 'Wildcard', maxUses: 2 },
      { type: ChipType.FREE_HIT, label: 'Free Hit', maxUses: 1 },
      { type: ChipType.BENCH_BOOST, label: 'Bench Boost', maxUses: 1 },
      { type: ChipType.TRIPLE_CAPTAIN, label: 'Triple Captain', maxUses: 1 },
    ];

    return chipMeta
      .filter((chip) => (activationCounts.get(chip.type) ?? 0) < chip.maxUses)
      .map((chip) => chip.label);
  }

  private resolveDeadlinePriority(deadlineAt: Date) {
    const diffMs = deadlineAt.getTime() - Date.now();

    if (diffMs <= 0) {
      return 'locked';
    }

    if (diffMs <= 60 * 60 * 1000) {
      return 'critical';
    }

    if (diffMs <= 24 * 60 * 60 * 1000) {
      return 'warning';
    }

    return 'normal';
  }

  private resolveTransferAccounting(fantasyTeam: FantasyTeamEntity, transfersUsedThisRound: number) {
    const previousFreeTransfers = fantasyTeam.freeTransfers;
    const hasUnlimitedTransfersChip = fantasyTeam.activeChipType === ChipType.WILDCARD
      || fantasyTeam.activeChipType === ChipType.FREE_HIT;
    const includedFreeTransfers = Math.max(1, previousFreeTransfers);
    const hasFreeTransferRemainingThisRound = transfersUsedThisRound < includedFreeTransfers;

    return {
      costHit: hasUnlimitedTransfersChip || hasFreeTransferRemainingThisRound ? 0 : 4,
      nextFreeTransfers: hasUnlimitedTransfersChip
        ? previousFreeTransfers
        : Math.max(0, includedFreeTransfers - (transfersUsedThisRound + 1)),
    };
  }

  private getCaptainMultiplier(activeChipType: ChipType | null | undefined) {
    return activeChipType === ChipType.TRIPLE_CAPTAIN ? 3 : 2;
  }

  private attachMutationMeta<T extends FantasyTeamEntity>(
    fantasyTeam: T,
    mutationType: 'team_save' | 'captaincy_save' | 'transfer_save',
    affectedMatchdayId: string | null = null,
  ) {
    return Object.assign(fantasyTeam, {
      mutationMeta: {
        mutationType,
        savedAt: fantasyTeam.updatedAt?.toISOString?.() ?? new Date().toISOString(),
        revisionId: `${fantasyTeam.id}:${fantasyTeam.updatedAt?.getTime?.() ?? Date.now()}`,
        affectedMatchdayId,
      },
    });
  }

  private async recordManagerMutationAudit(input: {
    actionType: string;
    targetId: string;
    reason: string;
    actorUserId: string;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
  }) {
    const actor = await this.usersRepository.findOne({ where: { id: input.actorUserId } });

    await this.adminAuditLogsRepository.save(
      this.adminAuditLogsRepository.create({
        actionType: input.actionType,
        targetType: 'fantasy_team',
        targetId: input.targetId,
        reason: input.reason,
        actor: actor ?? null,
        beforeState: input.beforeState,
        afterState: input.afterState,
      }),
    );
  }

  private async applyCaptainMultiplier(picks: FantasyPickEntity[], captainMultiplier: number) {
    for (const pick of picks) {
      pick.multiplier = pick.isCaptain ? captainMultiplier : 1;
      await this.fantasyPicksRepository.update(pick.id, {
        multiplier: pick.multiplier,
      });
    }
  }

  private async markChipActivationsInactive(chipActivations: ChipActivationEntity[]) {
    if (chipActivations.length === 0) {
      return;
    }

    const consumedAt = new Date();

    for (const chipActivation of chipActivations) {
      chipActivation.isActive = false;
      chipActivation.consumedAt ??= consumedAt;
      await this.chipActivationsRepository.save(chipActivation);
    }
  }

  private async syncChipState(fantasyTeam: FantasyTeamEntity): Promise<FantasyTeamEntity> {
    const activeActivations = fantasyTeam.chipActivations
      .filter((activation) => activation.isActive)
      .sort((left, right) => right.activatedAt.getTime() - left.activatedAt.getTime());

    if (!fantasyTeam.activeChipType) {
      if (activeActivations.length === 0) {
        return fantasyTeam;
      }

      await this.markChipActivationsInactive(activeActivations);
      return this.getFantasyTeamCore(fantasyTeam.id);
    }

    const activeActivation = activeActivations.find(
      (activation) => activation.chipType === fantasyTeam.activeChipType,
    );

    const staleActiveActivations = activeActivations.filter(
      (activation) => activation.id !== activeActivation?.id,
    );

    if (staleActiveActivations.length > 0) {
      await this.markChipActivationsInactive(staleActiveActivations);
    }

    if (!activeActivation) {
      fantasyTeam.activeChipType = null;
      await this.fantasyTeamsRepository.save(fantasyTeam);
      return this.getFantasyTeamCore(fantasyTeam.id);
    }

    if (!fantasyTeam.tournament?.currentMatchdayNumber || !activeActivation.matchday?.number) {
      return staleActiveActivations.length > 0 ? this.getFantasyTeamCore(fantasyTeam.id) : fantasyTeam;
    }

    if (activeActivation.matchday.number >= fantasyTeam.tournament.currentMatchdayNumber) {
      return staleActiveActivations.length > 0 ? this.getFantasyTeamCore(fantasyTeam.id) : fantasyTeam;
    }

    if (fantasyTeam.activeChipType === ChipType.FREE_HIT) {
      await this.restoreFreeHitSnapshot(fantasyTeam.id, activeActivation.matchday.id);
    }

    fantasyTeam.activeChipType = null;
    await this.fantasyTeamsRepository.save(fantasyTeam);

    await this.markChipActivationsInactive([activeActivation]);

    if (activeActivation.chipType === ChipType.TRIPLE_CAPTAIN) {
      await this.applyCaptainMultiplier(fantasyTeam.picks, 2);
    }

    return this.getFantasyTeamCore(fantasyTeam.id);
  }

  private async restoreFreeHitSnapshot(fantasyTeamId: string, matchdayId: string) {
    const snapshot = await this.fantasyTeamSnapshotsRepository.findOne({
      where: { fantasyTeam: { id: fantasyTeamId }, matchday: { id: matchdayId } },
      relations: { picks: { player: true } },
      order: { capturedAt: 'DESC' },
    });

    if (!snapshot) {
      return;
    }

    const fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: { id: fantasyTeamId },
      relations: { picks: { player: true } },
    });

    if (!fantasyTeam) {
      return;
    }

    fantasyTeam.name = snapshot.name;
    fantasyTeam.formationCode = snapshot.formationCode;
    fantasyTeam.budgetRemaining = snapshot.budgetRemaining;
    fantasyTeam.totalBudget = snapshot.totalBudget;
    fantasyTeam.teamValue = snapshot.teamValue;
    fantasyTeam.freeTransfers = snapshot.freeTransfers;

    if (fantasyTeam.picks.length > 0) {
      await this.fantasyPicksRepository.delete(fantasyTeam.picks.map((pick) => pick.id));
    }

    const restoredPicks = snapshot.picks.map((pickSnapshot) => this.fantasyPicksRepository.create({
      fantasyTeam,
      player: pickSnapshot.player,
      positionOrder: pickSnapshot.positionOrder,
      isCaptain: pickSnapshot.isCaptain,
      isViceCaptain: pickSnapshot.isViceCaptain,
      isBenched: pickSnapshot.isBenched,
      multiplier: pickSnapshot.multiplier,
      buyPrice: pickSnapshot.buyPrice,
      sellPrice: pickSnapshot.sellPrice,
      livePoints: pickSnapshot.livePoints,
    }));

    if (restoredPicks.length > 0) {
      await this.fantasyPicksRepository.save(restoredPicks);
    }

    await this.fantasyTeamsRepository.save(fantasyTeam);
  }
}
