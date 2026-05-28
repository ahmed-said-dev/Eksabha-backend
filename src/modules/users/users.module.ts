import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { PlayerEntity } from '../catalog/entities/player.entity';
import { FantasyPickEntity } from '../fantasy/entities/fantasy-pick.entity';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { ChipActivationEntity } from '../fantasy/entities/chip-activation.entity';
import { TransferEntity } from '../fantasy/entities/transfer.entity';
import { LeagueMembershipEntity } from '../leagues/entities/league-membership.entity';
import { LeaderboardEntryEntity } from '../leaderboards/entities/leaderboard-entry.entity';
import { NotificationEntity } from '../notifications/entities/notification.entity';
import { PlayerScoreEventEntity } from '../scoring/entities/player-score-event.entity';
import { PlayerScoreLogEntity } from '../scoring/entities/player-score-log.entity';
import { FixtureEntity } from '../tournament/entities/fixture.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { UsersController } from './users.controller';
import { UserEntity } from './entities/user.entity';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UsersService } from './users.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      UserEntity,
      UserProfileEntity,
      FantasyTeamEntity,
      FantasyPickEntity,
      TransferEntity,
      ChipActivationEntity,
      MatchdayEntity,
      FixtureEntity,
      LeaderboardEntryEntity,
      LeagueMembershipEntity,
      PlayerEntity,
      PlayerScoreEventEntity,
      PlayerScoreLogEntity,
      NotificationEntity,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
