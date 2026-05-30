import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/interfaces/auth-request.interface';
import { CreateCupDto } from './dto/create-cup.dto';
import { CreateLeagueDto } from './dto/create-league.dto';
import { JoinCupDto } from './dto/join-cup.dto';
import { JoinLeagueDto } from './dto/join-league.dto';
import { LeaguesService } from './leagues.service';

@Controller('leagues')
export class LeaguesController {
  constructor(private readonly leaguesService: LeaguesService) {}

  @Get()
  getLeagues() {
    return this.leaguesService.getLeagues();
  }

  @UseGuards(JwtAuthGuard)
  @Get('overview')
  getLeaguesOverview(@CurrentUser() user: JwtAccessPayload, @Query('tournamentId') tournamentId?: string) {
    return this.leaguesService.getLeaguesOverviewForUser(user.sub, tournamentId ?? user.selectedTournamentId ?? undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Get('cups/overview')
  getCupsOverview(@CurrentUser() user: JwtAccessPayload, @Query('tournamentId') tournamentId?: string) {
    return this.leaguesService.getCupsOverviewForUser(user.sub, tournamentId ?? user.selectedTournamentId ?? undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Get('create-join/options')
  getCreateJoinOptions(@CurrentUser() user: JwtAccessPayload, @Query('tournamentId') tournamentId?: string) {
    return this.leaguesService.getCreateJoinOptionsForUser(user.sub, tournamentId ?? user.selectedTournamentId ?? undefined);
  }

  @Get('fantasy-team/:fantasyTeamId')
  getLeaguesForFantasyTeam(@Param('fantasyTeamId') fantasyTeamId: string) {
    return this.leaguesService.getLeaguesForFantasyTeam(fantasyTeamId);
  }

  @Get('fantasy-team/:fantasyTeamId/cups')
  getCupsForFantasyTeam(@Param('fantasyTeamId') fantasyTeamId: string) {
    return this.leaguesService.getCupsForFantasyTeam(fantasyTeamId);
  }

  @Get('cups/:cupId')
  getCupById(@Param('cupId') cupId: string) {
    return this.leaguesService.getCupById(cupId);
  }

  @Get(':leagueId')
  getLeagueById(@Param('leagueId') leagueId: string) {
    return this.leaguesService.getLeagueById(leagueId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':leagueId/detail')
  getLeagueDetail(
    @CurrentUser() user: JwtAccessPayload,
    @Param('leagueId') leagueId: string,
    @Query('scopeKey') scopeKey?: string,
  ) {
    return this.leaguesService.getLeagueDetailForUser(user.sub, leagueId, scopeKey);
  }

  @Get(':leagueId/memberships')
  getLeagueMemberships(@Param('leagueId') leagueId: string) {
    return this.leaguesService.getLeagueMemberships(leagueId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  createLeague(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateLeagueDto) {
    return this.leaguesService.createLeagueForUser(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('join')
  joinLeague(@CurrentUser() user: JwtAccessPayload, @Body() dto: JoinLeagueDto) {
    return this.leaguesService.joinLeagueForUser(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('public/:leagueId/join')
  joinPublicLeague(@CurrentUser() user: JwtAccessPayload, @Param('leagueId') leagueId: string) {
    return this.leaguesService.joinPublicLeagueForUser(user.sub, leagueId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cups')
  createCup(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateCupDto) {
    return this.leaguesService.createCupForUser(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cups/join')
  joinCup(@CurrentUser() user: JwtAccessPayload, @Body() dto: JoinCupDto) {
    return this.leaguesService.joinCupForUser(user.sub, dto);
  }
}
