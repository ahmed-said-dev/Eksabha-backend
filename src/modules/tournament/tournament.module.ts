import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlayerScoreEventEntity } from '../scoring/entities/player-score-event.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { EgyptLiveStateService } from './egypt-live-state.service';
import { EgyptLiveTrackerService } from './egypt-live-tracker.service';
import { EgyptLiveTrackerRunnerService } from './egypt-live-tracker-runner.service';
import { TournamentController } from './tournament.controller';
import { FixtureEntity } from './entities/fixture.entity';
import { GroupEntity } from './entities/group.entity';
import { MatchdayEntity } from './entities/matchday.entity';
import { TournamentEntity } from './entities/tournament.entity';
import { TournamentService } from './tournament.service';

@Module({
  imports: [TypeOrmModule.forFeature([TournamentEntity, MatchdayEntity, GroupEntity, FixtureEntity, PlayerScoreEventEntity]), RealtimeModule],
  controllers: [TournamentController],
  providers: [TournamentService, EgyptLiveStateService, EgyptLiveTrackerService, EgyptLiveTrackerRunnerService],
  exports: [TournamentService, EgyptLiveStateService, EgyptLiveTrackerService],
})
export class TournamentModule {}
