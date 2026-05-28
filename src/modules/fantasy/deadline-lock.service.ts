import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TournamentStatus } from '../tournament/entities/tournament.entity';
import { MatchdayEntity, MatchdayStatus } from '../tournament/entities/matchday.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { TournamentService } from '../tournament/tournament.service';
import { PlayerEntity } from '../catalog/entities/player.entity';
import { UserEntity } from '../users/entities/user.entity';
import { FantasyPickSnapshotEntity } from './entities/fantasy-pick-snapshot.entity';
import { FantasyPickEntity } from './entities/fantasy-pick.entity';
import { FantasyTeamSnapshotEntity } from './entities/fantasy-team-snapshot.entity';
import { FantasyTeamEntity } from './entities/fantasy-team.entity';
import { MatchdayLockEntity } from './entities/matchday-lock.entity';

@Injectable()
export class DeadlineLockService {
  private readonly logger = new Logger(DeadlineLockService.name);

  constructor(
    @InjectRepository(FantasyTeamEntity)
    private readonly fantasyTeamsRepository: Repository<FantasyTeamEntity>,
    @InjectRepository(FantasyTeamSnapshotEntity)
    private readonly fantasyTeamSnapshotsRepository: Repository<FantasyTeamSnapshotEntity>,
    @InjectRepository(FantasyPickSnapshotEntity)
    private readonly fantasyPickSnapshotsRepository: Repository<FantasyPickSnapshotEntity>,
    @InjectRepository(MatchdayEntity)
    private readonly matchdaysRepository: Repository<MatchdayEntity>,
    @InjectRepository(MatchdayLockEntity)
    private readonly matchdayLocksRepository: Repository<MatchdayLockEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly tournamentService: TournamentService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeEventsService: RealtimeEventsService,
  ) {}

  async getMatchdayLockStatus(matchdayId?: string) {
    const matchday = await this.resolveMatchday(matchdayId);
    const activeLock = await this.matchdayLocksRepository.findOne({
      where: { matchday: { id: matchday.id }, isActive: true },
      relations: { matchday: true, lockedBy: true },
      order: { lockedAt: 'DESC' },
    });

    const snapshotsCount = await this.fantasyTeamSnapshotsRepository.count({
      where: { matchday: { id: matchday.id } },
    });

    return {
      matchdayId: matchday.id,
      matchdayNumber: matchday.number,
      matchdayStatus: matchday.status,
      isLocked: Boolean(activeLock),
      lock: activeLock,
      snapshotsCount,
      deadlineAt: matchday.deadlineAt,
      locksAt: matchday.locksAt,
    };
  }

  async lockMatchday(matchdayId?: string, options?: { reason?: string; lockedByUserId?: string }) {
    const matchday = await this.resolveMatchday(matchdayId);

    const existingActiveLock = await this.matchdayLocksRepository.findOne({
      where: { matchday: { id: matchday.id }, isActive: true },
      relations: { matchday: true },
    });

    if (existingActiveLock) {
      return {
        message: 'Matchday already locked.',
        matchdayId: matchday.id,
        snapshotsCreated: 0,
        lock: existingActiveLock,
      };
    }

    const lockedBy = options?.lockedByUserId
      ? await this.usersRepository.findOne({ where: { id: options.lockedByUserId } })
      : null;

    if (options?.lockedByUserId && !lockedBy) {
      throw new NotFoundException('Locking user not found.');
    }

    const fantasyTeams = await this.fantasyTeamsRepository.find({
      where: { tournament: { id: matchday.tournament.id } },
      relations: {
        user: true,
        tournament: true,
        picks: { player: true },
      },
      order: { createdAt: 'ASC' },
    });

    let snapshotsCreated = 0;
    for (const fantasyTeam of fantasyTeams) {
      const existingSnapshot = await this.fantasyTeamSnapshotsRepository.findOne({
        where: { fantasyTeam: { id: fantasyTeam.id }, matchday: { id: matchday.id } },
        relations: { fantasyTeam: true, matchday: true },
      });

      if (existingSnapshot) {
        continue;
      }

      const snapshot = await this.fantasyTeamSnapshotsRepository.save(
        this.fantasyTeamSnapshotsRepository.create({
          fantasyTeam,
          matchday,
          name: fantasyTeam.name,
          formationCode: fantasyTeam.formationCode,
          budgetRemaining: fantasyTeam.budgetRemaining,
          totalBudget: fantasyTeam.totalBudget,
          teamValue: fantasyTeam.teamValue,
          freeTransfers: fantasyTeam.freeTransfers,
          activeChipType: fantasyTeam.activeChipType,
          capturedAt: new Date(),
        }),
      );

      if (fantasyTeam.picks.length > 0) {
        const snapshotPicks = fantasyTeam.picks
          .filter((pick) => Boolean(pick.player?.id || pick.playerId))
          .map((pick) =>
            this.fantasyPickSnapshotsRepository.create({
              fantasyTeamSnapshot: snapshot,
              player: pick.player ?? ({ id: pick.playerId } as PlayerEntity),
              positionOrder: pick.positionOrder,
              isCaptain: pick.isCaptain,
              isViceCaptain: pick.isViceCaptain,
              isBenched: pick.isBenched,
              multiplier: pick.multiplier,
              buyPrice: pick.buyPrice,
              sellPrice: pick.sellPrice,
              livePoints: pick.livePoints,
            }),
          );

        if (snapshotPicks.length !== fantasyTeam.picks.length) {
          this.logger.warn(`Skipped ${fantasyTeam.picks.length - snapshotPicks.length} pick(s) without resolvable player for fantasyTeam=${fantasyTeam.id} while locking matchday=${matchday.id}.`);
        }

        if (snapshotPicks.length > 0) {
        await this.fantasyPickSnapshotsRepository.save(
          snapshotPicks,
        );
        }
      }

      snapshotsCreated += 1;
    }

    matchday.status = MatchdayStatus.LOCKED;
    if (!matchday.locksAt) {
      matchday.locksAt = new Date();
    }
    await this.matchdaysRepository.save(matchday);

    const tournament = await this.tournamentService.getCurrentTournament();
    if (tournament.id === matchday.tournament.id) {
      tournament.status = TournamentStatus.DEADLINE_LOCKED;
      await this.tournamentService.saveTournament(tournament);
    }

    const lock = await this.matchdayLocksRepository.save(
      this.matchdayLocksRepository.create({
        matchday,
        lockedAt: new Date(),
        unlockedAt: null,
        isActive: true,
        reason: options?.reason ?? 'manual_or_deadline_lock',
        lockedBy: lockedBy ?? null,
      }),
    );

    this.realtimeEventsService.emitDeadlineLocked({
      matchdayId: matchday.id,
      matchdayNumber: matchday.number,
      snapshotsCreated,
    });

    const notificationInputs = fantasyTeams
      .filter((fantasyTeam) => Boolean(fantasyTeam.user?.id))
      .map((fantasyTeam) => ({
        userId: fantasyTeam.user.id,
        type: 'deadline_locked',
        title: 'Matchday locked',
        body: `Matchday ${matchday.number} is now locked and your squad snapshot has been captured.`,
        payload: {
          matchdayId: matchday.id,
          matchdayNumber: matchday.number,
          fantasyTeamId: fantasyTeam.id,
        },
      }));

    if (notificationInputs.length > 0) {
      try {
        await this.notificationsService.createNotificationsForUsers(notificationInputs);
      } catch (error) {
        this.logger.warn(`Failed to create some deadline lock notifications for matchday=${matchday.id}: ${error instanceof Error ? error.message : 'unknown_error'}`);
      }
    }

    return {
      message: 'Matchday locked and snapshots captured successfully.',
      matchdayId: matchday.id,
      snapshotsCreated,
      lock,
    };
  }

  async ensureMatchdayUnlockedForMutations(matchdayId?: string) {
    const matchday = await this.resolveMatchday(matchdayId);
    const activeLock = await this.matchdayLocksRepository.findOne({
      where: { matchday: { id: matchday.id }, isActive: true },
      relations: { matchday: true },
    });

    if (activeLock || matchday.status === MatchdayStatus.LOCKED) {
      throw new BadRequestException('This matchday is locked. Fantasy team changes are no longer allowed.');
    }

    return matchday;
  }

  private async resolveMatchday(matchdayId?: string) {
    if (matchdayId) {
      const matchday = await this.matchdaysRepository.findOne({
        where: { id: matchdayId },
        relations: { tournament: true },
      });

      if (!matchday) {
        throw new NotFoundException('Matchday not found.');
      }

      return matchday;
    }

    const tournament = await this.tournamentService.getCurrentTournament();
    const matchday = await this.matchdaysRepository.findOne({
      where: {
        tournament: { id: tournament.id },
        number: tournament.currentMatchdayNumber,
      },
      relations: { tournament: true },
    });

    if (!matchday) {
      throw new NotFoundException('Current matchday not found.');
    }

    return matchday;
  }
}
