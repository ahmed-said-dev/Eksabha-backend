import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/interfaces/auth-request.interface';
import { ActivateChipDto } from './dto/activate-chip.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateCaptaincyDto } from './dto/update-captaincy.dto';
import { UpdateFantasyTeamDto } from './dto/update-fantasy-team.dto';
import { FantasyService } from './fantasy.service';

@UseGuards(JwtAuthGuard)
@Controller('fantasy')
export class FantasyController {
  constructor(private readonly fantasyService: FantasyService) {}

  @Get('team')
  getFantasyTeam(@CurrentUser() user: JwtAccessPayload, @Query('tournamentId') tournamentId?: string) {
    return this.fantasyService.getFantasyTeamForUser(user.sub, tournamentId ?? user.selectedTournamentId ?? undefined);
  }

  @Get('team/deadline-summary')
  getDeadlineSummary(@CurrentUser() user: JwtAccessPayload, @Query('tournamentId') tournamentId?: string) {
    return this.fantasyService.getDeadlineSummaryForUser(user.sub, tournamentId ?? user.selectedTournamentId ?? undefined);
  }

  @Get('team/:fantasyTeamId')
  getFantasyTeamById(@Param('fantasyTeamId') fantasyTeamId: string, @Query('matchdayNumber') matchdayNumber?: string) {
    return this.fantasyService.getFantasyTeam(
      fantasyTeamId,
      matchdayNumber ? Number.parseInt(matchdayNumber, 10) : undefined,
    );
  }

  @Patch('team')
  updateFantasyTeam(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpdateFantasyTeamDto,
    @Query('tournamentId') tournamentId?: string,
  ) {
    return this.fantasyService.updateFantasyTeamForUser(
      user.sub,
      dto,
      tournamentId ?? user.selectedTournamentId ?? undefined,
    );
  }

  @Patch('team/transfers')
  createTransfer(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateTransferDto,
    @Query('tournamentId') tournamentId?: string,
  ) {
    return this.fantasyService.createTransferForUser(
      user.sub,
      dto,
      tournamentId ?? user.selectedTournamentId ?? undefined,
    );
  }

  @Patch('team/captaincy')
  updateCaptaincy(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpdateCaptaincyDto,
    @Query('tournamentId') tournamentId?: string,
  ) {
    return this.fantasyService.updateCaptaincyForUser(
      user.sub,
      dto,
      tournamentId ?? user.selectedTournamentId ?? undefined,
    );
  }

  @Patch('team/chip')
  activateChip(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ActivateChipDto,
    @Query('tournamentId') tournamentId?: string,
  ) {
    return this.fantasyService.activateChipForUser(
      user.sub,
      dto,
      tournamentId ?? user.selectedTournamentId ?? undefined,
    );
  }

  @Patch('team/chip/deactivate')
  deactivateChip(@CurrentUser() user: JwtAccessPayload, @Query('tournamentId') tournamentId?: string) {
    return this.fantasyService.deactivateChipForUser(
      user.sub,
      tournamentId ?? user.selectedTournamentId ?? undefined,
    );
  }
}
