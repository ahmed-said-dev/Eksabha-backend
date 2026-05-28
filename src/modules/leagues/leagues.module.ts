import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { LeaderboardEntryEntity } from '../leaderboards/entities/leaderboard-entry.entity';
import { TournamentEntity } from '../tournament/entities/tournament.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { UserEntity } from '../users/entities/user.entity';
import { LeaguesController } from './leagues.controller';
import { LeaguesService } from './leagues.service';
import { CupEntryEntity } from './entities/cup-entry.entity';
import { CupFixtureEntity } from './entities/cup-fixture.entity';
import { CupRoundEntity } from './entities/cup-round.entity';
import { CupEntity } from './entities/cup.entity';
import { LeagueHeadToHeadFixtureEntity } from './entities/league-head-to-head-fixture.entity';
import { LeagueEntity } from './entities/league.entity';
import { LeagueMembershipEntity } from './entities/league-membership.entity';
import { LeaguePendingEntryEntity } from './entities/league-pending-entry.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      LeagueEntity,
      LeagueMembershipEntity,
      LeaguePendingEntryEntity,
      LeagueHeadToHeadFixtureEntity,
      CupEntity,
      CupEntryEntity,
      CupRoundEntity,
      CupFixtureEntity,
      UserEntity,
      TournamentEntity,
      FantasyTeamEntity,
      MatchdayEntity,
      LeaderboardEntryEntity,
    ]),
  ],
  controllers: [LeaguesController],
  providers: [LeaguesService],
  exports: [LeaguesService],
})
export class LeaguesModule {}
