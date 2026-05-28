import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envValidationSchema } from './common/config/env.validation';
import { CacheModule } from './infra/cache/cache.module';
import { DatabaseModule } from './infra/database/database.module';
import { QueueModule } from './infra/queue/queue.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { FeedModule } from './modules/feed/feed.module';
import { FantasyModule } from './modules/fantasy/fantasy.module';
import { HealthModule } from './modules/health/health.module';
import { LeaguesModule } from './modules/leagues/leagues.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { LeaderboardsModule } from './modules/leaderboards/leaderboards.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { TournamentModule } from './modules/tournament/tournament.module';
import { UsersModule } from './modules/users/users.module';
import { PlayerAdminModule } from './modules/player-admin/player-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: envValidationSchema,
    }),
    DatabaseModule,
    CacheModule,
    QueueModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    UsersModule,
    TournamentModule,
    CatalogModule,
    FantasyModule,
    LeaguesModule,
    LeaderboardsModule,
    NotificationsModule,
    ScoringModule,
    AdminModule,
    PlayerAdminModule,
    FeedModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
