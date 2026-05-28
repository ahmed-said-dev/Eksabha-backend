import { Controller, Get, Param, Post, Query } from '@nestjs/common';

import { TournamentService } from './tournament.service';

@Controller('tournament')
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  @Get()
  getTournament() {
    return this.tournamentService.getCurrentTournament();
  }

  @Get('matchdays')
  getMatchdays(@Query('tournamentId') tournamentId?: string) {
    return this.tournamentService.getMatchdays(tournamentId);
  }

  @Get('fixtures')
  getFixtures(
    @Query('tournamentId') tournamentId?: string,
    @Query('matchdayId') matchdayId?: string,
    @Query('matchdayNumber') matchdayNumber?: string,
    @Query('groupCode') groupCode?: string,
    @Query('includeStats') includeStats?: string,
    @Query('includeLineups') includeLineups?: string,
    @Query('includeEvents') includeEvents?: string,
  ) {
    return this.tournamentService.getFixtures({
      tournamentId,
      matchdayId,
      matchdayNumber: matchdayNumber ? parseInt(matchdayNumber, 10) : undefined,
      groupCode,
      includeStats: includeStats !== 'false',
      includeLineups: includeLineups === 'true',
      includeEvents: includeEvents === 'true',
    });
  }

  @Get('live-fixtures')
  getLiveFixtures() {
    return this.tournamentService.getLiveFixtures();
  }

  @Post('live-fixtures/refresh')
  refreshLiveFixtures() {
    return this.tournamentService.refreshLiveFixtures();
  }

  @Get('fixtures/:fixtureId')
  getFixtureById(@Param('fixtureId') fixtureId: string) {
    return this.tournamentService.getFixtureById(fixtureId);
  }

  @Get('groups/:groupCode/standings')
  getGroupStandings(
    @Param('groupCode') groupCode: string,
    @Query('tournamentId') tournamentId?: string,
  ) {
    return this.tournamentService.getGroupStandings(groupCode, tournamentId);
  }
}
