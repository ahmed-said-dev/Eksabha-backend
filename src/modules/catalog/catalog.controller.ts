import { Controller, Get, Param, Query } from '@nestjs/common';
import { PlayerPosition } from '../../common/database';

import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('players')
  getPlayers(
    @Query('teamId') teamId?: string,
    @Query('tournamentId') tournamentId?: string,
    @Query('position') position?: PlayerPosition,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    const parsedMinPrice = minPrice ? Number.parseFloat(minPrice) : undefined;
    const parsedMaxPrice = maxPrice ? Number.parseFloat(maxPrice) : undefined;

    return this.catalogService.getPlayers({
      teamId,
      tournamentId,
      position,
      minPrice: Number.isFinite(parsedMinPrice) ? parsedMinPrice : undefined,
      maxPrice: Number.isFinite(parsedMaxPrice) ? parsedMaxPrice : undefined,
    });
  }

  @Get('players/:playerId')
  getPlayerById(@Param('playerId') playerId: string) {
    return this.catalogService.getPlayerById(playerId);
  }

  @Get('teams')
  getTeams(@Query('tournamentId') tournamentId?: string) {
    return this.catalogService.getTeams(tournamentId);
  }
}
