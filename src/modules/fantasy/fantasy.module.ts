import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AdminAuditLogEntity } from '../admin/entities/admin-audit-log.entity';
import { PlayerEntity } from '../catalog/entities/player.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { TournamentModule } from '../tournament/tournament.module';
import { DeadlineLockService } from './deadline-lock.service';
import { FantasyController } from './fantasy.controller';
import { FantasyService } from './fantasy.service';
import { ChipActivationEntity } from './entities/chip-activation.entity';
import { FantasyPickEntity } from './entities/fantasy-pick.entity';
import { FantasyPickSnapshotEntity } from './entities/fantasy-pick-snapshot.entity';
import { FantasyTeamEntity } from './entities/fantasy-team.entity';
import { FantasyTeamSnapshotEntity } from './entities/fantasy-team-snapshot.entity';
import { MatchdayLockEntity } from './entities/matchday-lock.entity';
import { TransferEntity } from './entities/transfer.entity';
import { UserEntity } from '../users/entities/user.entity';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    RealtimeModule,
    TournamentModule,
    TypeOrmModule.forFeature([
      FantasyTeamEntity,
      FantasyPickEntity,
      FantasyTeamSnapshotEntity,
      FantasyPickSnapshotEntity,
      MatchdayLockEntity,
      ChipActivationEntity,
      TransferEntity,
      PlayerEntity,
      MatchdayEntity,
      UserEntity,
      AdminAuditLogEntity,
    ]),
  ],
  controllers: [FantasyController],
  providers: [FantasyService, DeadlineLockService],
  exports: [FantasyService, DeadlineLockService],
})
export class FantasyModule {}
