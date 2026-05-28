import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlayerEntity } from '../catalog/entities/player.entity';
import { TeamEntity } from '../catalog/entities/team.entity';
import { UserEntity } from '../users/entities/user.entity';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { ScoringModule } from '../scoring/scoring.module';
import { TournamentModule } from '../tournament/tournament.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuthModule } from '../auth/auth.module';
import { FixtureEntity } from '../tournament/entities/fixture.entity';
import { GroupEntity } from '../tournament/entities/group.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { TournamentEntity } from '../tournament/entities/tournament.entity';
import { FeedAutoSyncService } from './feed-auto-sync.service';
import { FeedController } from './feed.controller';
import { RawFeedPayloadEntity } from './entities/raw-feed-payload.entity';
import { FeedService } from './feed.service';
import { ApiFootballProvider } from './providers/api-football.provider';
import { FootballDataOrgProvider } from './providers/football-data-org.provider';
import { TheSportsDbProvider } from './providers/the-sports-db.provider';
import { ProviderRouter } from './providers/provider-router';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TypeOrmModule.forFeature([RawFeedPayloadEntity, FixtureEntity, PlayerEntity, TeamEntity, GroupEntity, MatchdayEntity, TournamentEntity, UserEntity]),
    LeaderboardsModule,
    ScoringModule,
    TournamentModule,
    RealtimeModule,
  ],
  controllers: [FeedController],
  providers: [ApiFootballProvider, FootballDataOrgProvider, TheSportsDbProvider, ProviderRouter, FeedService, FeedAutoSyncService],
  exports: [FeedService],
})
export class FeedModule {}
