import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlayerEntity } from '../catalog/entities/player.entity';
import { FantasyPickEntity } from '../fantasy/entities/fantasy-pick.entity';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { FixtureEntity } from '../tournament/entities/fixture.entity';
import { ScoringController } from './scoring.controller';
import { FixtureScoringRunEntity } from './entities/fixture-scoring-run.entity';
import { PlayerScoreEventEntity } from './entities/player-score-event.entity';
import { PlayerScoreLogEntity } from './entities/player-score-log.entity';
import { ScoringRuleEntity } from './entities/scoring-rule.entity';
import { ScoringRuleSetEntity } from './entities/scoring-rule-set.entity';
import { ScoringService } from './scoring.service';

@Module({
  imports: [
    LeaderboardsModule,
    NotificationsModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      PlayerScoreLogEntity,
      PlayerScoreEventEntity,
      FixtureScoringRunEntity,
      ScoringRuleSetEntity,
      ScoringRuleEntity,
      FixtureEntity,
      PlayerEntity,
      FantasyPickEntity,
      FantasyTeamEntity,
    ]),
  ],
  controllers: [ScoringController],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
