import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AdminGuard } from './guards/admin.guard';
import { BulkPlayerActionAdminDto } from './dto/bulk-player-action-admin.dto';
import { BulkPlayerPricesDownloadAdminDto } from './dto/bulk-player-prices-download-admin.dto';
import { BulkPlayerPricesUploadAdminDto } from './dto/bulk-player-prices-upload-admin.dto';
import { CreatePlayerAdminDto } from './dto/create-player-admin.dto';
import { UpdatePlayerAdminDto } from './dto/update-player-admin.dto';
import { PlayerAdminService } from './player-admin.service';

@Controller('player-admin')
export class PlayerAdminController {
  constructor(private readonly playerAdminService: PlayerAdminService) {}

  @Get('stats')
  @UseGuards(AdminGuard)
  getStats(@Query('tournamentId') tournamentId?: string) {
    return this.playerAdminService.getStats(tournamentId);
  }

  @Get('teams')
  @UseGuards(AdminGuard)
  getTeams(@Query('tournamentId') tournamentId?: string) {
    return this.playerAdminService.getTeams(tournamentId);
  }

  @Get('players')
  @UseGuards(AdminGuard)
  getPlayers(
    @Query('tournamentId') tournamentId?: string,
    @Query('teamId') teamId?: string,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.playerAdminService.getPlayers({
      tournamentId,
      teamId,
      search,
      includeInactive: includeInactive === 'true',
    });
  }

  @Post('players')
  @UseGuards(AdminGuard)
  createPlayer(@Body() dto: CreatePlayerAdminDto) {
    return this.playerAdminService.createPlayer(dto);
  }

  @Post('players/bulk-actions')
  @UseGuards(AdminGuard)
  applyBulkAction(@Body() dto: BulkPlayerActionAdminDto) {
    return this.playerAdminService.applyBulkAction(dto);
  }

  @Post('players/bulk-prices/download')
  @UseGuards(AdminGuard)
  downloadBulkPricesCsv(@Body() dto: BulkPlayerPricesDownloadAdminDto) {
    return this.playerAdminService.downloadBulkPricesCsv(dto);
  }

  @Post('players/bulk-prices/upload')
  @UseGuards(AdminGuard)
  uploadBulkPricesCsv(@Body() dto: BulkPlayerPricesUploadAdminDto) {
    return this.playerAdminService.uploadBulkPricesCsv(dto);
  }

  @Patch('players/:playerId')
  @UseGuards(AdminGuard)
  updatePlayer(@Param('playerId') playerId: string, @Body() dto: UpdatePlayerAdminDto) {
    return this.playerAdminService.updatePlayer(playerId, dto);
  }

  @Patch('players/:playerId/active')
  @UseGuards(AdminGuard)
  setPlayerActive(@Param('playerId') playerId: string, @Body('isActive') isActive: boolean) {
    return this.playerAdminService.setPlayerActive(playerId, isActive);
  }

  @Delete('players/:playerId')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  deletePlayer(@Param('playerId') playerId: string) {
    return this.playerAdminService.deletePlayer(playerId);
  }
}
