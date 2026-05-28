import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshSessionEntity } from './entities/refresh-session.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { TournamentEntity } from '../tournament/entities/tournament.entity';
import { UserProfileEntity } from '../users/entities/user-profile.entity';
import { UserEntity } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, UserProfileEntity, RefreshSessionEntity, TournamentEntity, MatchdayEntity, FantasyTeamEntity]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
