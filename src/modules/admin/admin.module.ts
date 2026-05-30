import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FantasyModule } from '../fantasy/fantasy.module';
import { MatchdayLockEntity } from '../fantasy/entities/matchday-lock.entity';
import { FantasyPickEntity } from '../fantasy/entities/fantasy-pick.entity';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { ChipActivationEntity } from '../fantasy/entities/chip-activation.entity';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { LeaderboardEntryEntity } from '../leaderboards/entities/leaderboard-entry.entity';
import { LeaguesModule } from '../leagues/leagues.module';
import { LeagueEntity } from '../leagues/entities/league.entity';
import { LeagueMembershipEntity } from '../leagues/entities/league-membership.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationEntity } from '../notifications/entities/notification.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { FixtureEntity } from '../tournament/entities/fixture.entity';
import { GroupEntity } from '../tournament/entities/group.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { TournamentEntity } from '../tournament/entities/tournament.entity';
import { TeamEntity } from '../catalog/entities/team.entity';
import { PlayerEntity } from '../catalog/entities/player.entity';
import { TransferEntity } from '../fantasy/entities/transfer.entity';
import { UserEntity } from '../users/entities/user.entity';
import { ScoringModule } from '../scoring/scoring.module';
import { PlayerScoreEventEntity } from '../scoring/entities/player-score-event.entity';
import { PlayerScoreLogEntity } from '../scoring/entities/player-score-log.entity';
import { AuthModule } from '../auth/auth.module';
import { AdminAuditLogEntity } from './entities/admin-audit-log.entity';
import { FixtureCorrectionEntity } from './entities/fixture-correction.entity';
import { ManualScoringAdjustmentEntity } from './entities/manual-scoring-adjustment.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    AuthModule,
    FantasyModule,
    ScoringModule,
    LeaderboardsModule,
    LeaguesModule,
    NotificationsModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      AdminAuditLogEntity,
      ManualScoringAdjustmentEntity,
      FixtureCorrectionEntity,
      TournamentEntity,
      MatchdayEntity,
      FixtureEntity,
      GroupEntity,
      TeamEntity,
      PlayerEntity,
      TransferEntity,
      PlayerScoreEventEntity,
      PlayerScoreLogEntity,
      LeagueEntity,
      LeagueMembershipEntity,
      LeaderboardEntryEntity,
      FantasyTeamEntity,
      FantasyPickEntity,
      ChipActivationEntity,
      MatchdayLockEntity,
      NotificationEntity,
      UserEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
