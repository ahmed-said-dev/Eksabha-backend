import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FantasyPickEntity } from '../fantasy/entities/fantasy-pick.entity';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { LeagueMembershipEntity } from '../leagues/entities/league-membership.entity';
import { PlayerScoreLogEntity } from '../scoring/entities/player-score-log.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { LeaderboardsController } from './leaderboards.controller';
import { LeaderboardEntryEntity } from './entities/leaderboard-entry.entity';
import { LeaderboardsService } from './leaderboards.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeaderboardEntryEntity,
      FantasyTeamEntity,
      FantasyPickEntity,
      LeagueMembershipEntity,
      PlayerScoreLogEntity,
      MatchdayEntity,
    ]),
  ],
  controllers: [LeaderboardsController],
  providers: [LeaderboardsService],
  exports: [LeaderboardsService],
})
export class LeaderboardsModule {}
