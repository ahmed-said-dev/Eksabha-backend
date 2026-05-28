import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { ScoreFixtureEventDto } from './dto/score-fixture-event.dto';
import { ScoringService } from './scoring.service';

@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  @Get('status')
  getStatus() {
    return this.scoringService.getStatus();
  }

  @Get('fixtures/:fixtureId/logs')
  getFixtureScoringLogs(@Param('fixtureId') fixtureId: string) {
    return this.scoringService.getFixtureScoringLogs(fixtureId);
  }

  @Get('logs')
  getScoringLogs(
    @Query('fixtureId') fixtureId?: string,
    @Query('playerId') playerId?: string,
  ) {
    return this.scoringService.getScoringLogsByFilters({ fixtureId, playerId });
  }

  @Post('fixtures/:fixtureId/events')
  scoreFixtureEvent(
    @Param('fixtureId') fixtureId: string,
    @Body() dto: ScoreFixtureEventDto,
  ) {
    return this.scoringService.scoreFixtureEvent({ ...dto, fixtureId });
  }
}
