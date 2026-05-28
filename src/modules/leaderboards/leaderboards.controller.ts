import { Controller, Get, Param, Post, Query } from '@nestjs/common';

import { LeaderboardsService } from './leaderboards.service';

@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private readonly leaderboardsService: LeaderboardsService) {}

  @Get('global')
  getGlobalLeaderboard(@Query('matchday') matchday?: string) {
    return this.leaderboardsService.getGlobalLeaderboard(matchday);
  }

  @Get('leagues/:leagueId')
  getLeagueLeaderboard(
    @Param('leagueId') leagueId: string,
    @Query('matchday') matchday?: string,
  ) {
    return this.leaderboardsService.getLeagueLeaderboard(leagueId, matchday);
  }

  @Post('materialize')
  materializeLeaderboard(@Query('matchday') matchday?: string) {
    return this.leaderboardsService.materializeForMatchday(matchday);
  }
}
