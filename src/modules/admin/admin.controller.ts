import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';

import { CreateFixtureCorrectionDto } from './dto/create-fixture-correction.dto';
import { CreateFixtureAdminDto } from './dto/create-fixture-admin.dto';
import { CreateFixtureEventAdminDto } from './dto/create-fixture-event-admin.dto';
import { CreateMatchdayAdminDto } from './dto/create-matchday-admin.dto';
import { CreateNotificationAdminDto } from './dto/create-notification-admin.dto';
import { CreateManualScoringAdjustmentDto } from './dto/create-manual-scoring-adjustment.dto';
import { AdminNotificationActionDto } from './dto/admin-notification-action.dto';
import { AuditLogAdminQueryDto } from './dto/audit-log-admin-query.dto';
import { DeleteAllFixtureEventsAdminDto } from './dto/delete-all-fixture-events-admin.dto';
import { DeleteFixtureEventAdminDto } from './dto/delete-fixture-event-admin.dto';
import { DeleteFixtureAdminDto } from './dto/delete-fixture-admin.dto';
import { DeleteMatchdayAdminDto } from './dto/delete-matchday-admin.dto';
import { LeagueAdminQueryDto } from './dto/league-admin-query.dto';
import { LeagueLeaderboardQueryDto } from './dto/league-leaderboard-query.dto';
import { MoreScreenSyncDto } from './dto/more-screen-sync.dto';
import { NotificationAdminQueryDto } from './dto/notification-admin-query.dto';
import { CompletePostDeadlineUpdateDto } from './dto/complete-post-deadline-update.dto';
import { RecomputeScoringAdminDto } from './dto/recompute-scoring-admin.dto';
import { ScoringLogQueryDto } from './dto/scoring-log-query.dto';
import { ScoringRunQueryDto } from './dto/scoring-run-query.dto';
import { UpdateFixtureEventAdminDto } from './dto/update-fixture-event-admin.dto';
import { UpdateFixtureAdminDto } from './dto/update-fixture-admin.dto';
import { UpdateLeagueAdminDto } from './dto/update-league-admin.dto';
import { UpdateLeagueMembershipAdminDto } from './dto/update-league-membership-admin.dto';
import { UpdateMatchdayAdminDto } from './dto/update-matchday-admin.dto';
import { UpdateTournamentOpsDto } from './dto/update-tournament-ops.dto';
import { UnlockMatchdayAdminDto } from './dto/unlock-matchday-admin.dto';
import { LockMatchdayDto } from '../fantasy/dto/lock-matchday.dto';
import { UpsertScoringRulesDto } from '../scoring/dto/upsert-scoring-rules.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/interfaces/auth-request.interface';
import { AdminGuard } from '../player-admin/guards/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('status')
  getAdminStatus() {
    return this.adminService.getStatus();
  }

  @Post('recompute/leaderboards')
  recomputeLeaderboards(@CurrentUser() user: JwtAccessPayload, @Query('matchday') matchday?: string) {
    return this.adminService.recomputeLeaderboards(matchday, user.sub);
  }

  @Post('recompute/fixtures/:fixtureId')
  recomputeFixtureScoring(@CurrentUser() user: JwtAccessPayload, @Param('fixtureId') fixtureId: string) {
    return this.adminService.recomputeFixtureScoring(fixtureId, user.sub);
  }

  @Get('scoring/rules')
  getScoringRules(
    @Query('code') code?: string,
    @Query('active') active?: string,
  ) {
    return this.adminService.getScoringRules(code, active === 'true');
  }

  @Put('scoring/rules')
  upsertScoringRules(@CurrentUser() user: JwtAccessPayload, @Body() dto: UpsertScoringRulesDto) {
    return this.adminService.upsertScoringRules(dto, user.sub);
  }

  @Get('deadlines/status')
  getDeadlineStatus(@Query('matchday') matchday?: string) {
    return this.adminService.getDeadlineStatus(matchday);
  }

  @Post('deadlines/lock')
  lockMatchday(@CurrentUser() user: JwtAccessPayload, @Body() dto: LockMatchdayDto) {
    return this.adminService.lockMatchday({ ...dto, lockedByUserId: user.sub });
  }

  @Post('scoring/manual-adjustments')
  createManualScoringAdjustment(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateManualScoringAdjustmentDto) {
    return this.adminService.createManualScoringAdjustment({ ...dto, createdByUserId: user.sub });
  }

  @Post('fixtures/corrections')
  createFixtureCorrection(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateFixtureCorrectionDto) {
    return this.adminService.createFixtureCorrection({ ...dto, createdByUserId: user.sub });
  }

  @Get('fixtures/:fixtureId/events')
  getFixtureEvents(@Param('fixtureId') fixtureId: string) {
    return this.adminService.getFixtureEvents(fixtureId);
  }

  @Post('fixtures/:fixtureId/events')
  createFixtureEvent(
    @CurrentUser() user: JwtAccessPayload,
    @Param('fixtureId') fixtureId: string,
    @Body() dto: CreateFixtureEventAdminDto,
  ) {
    return this.adminService.createFixtureEvent(fixtureId, { ...dto, createdByUserId: user.sub });
  }

  @Patch('fixtures/events/:eventId')
  updateFixtureEvent(
    @CurrentUser() user: JwtAccessPayload,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateFixtureEventAdminDto,
  ) {
    return this.adminService.updateFixtureEvent(eventId, { ...dto, updatedByUserId: user.sub });
  }

  @Post('fixtures/events/:eventId/delete')
  deleteFixtureEvent(
    @CurrentUser() user: JwtAccessPayload,
    @Param('eventId') eventId: string,
    @Body() dto: DeleteFixtureEventAdminDto,
  ) {
    return this.adminService.deleteFixtureEvent(eventId, { ...dto, deletedByUserId: user.sub });
  }

  @Post('fixtures/:fixtureId/events/delete-all')
  deleteAllFixtureEvents(
    @CurrentUser() user: JwtAccessPayload,
    @Param('fixtureId') fixtureId: string,
    @Body() dto: DeleteAllFixtureEventsAdminDto,
  ) {
    return this.adminService.deleteAllFixtureEvents(fixtureId, { ...dto, deletedByUserId: user.sub });
  }

  @Get('audit-logs')
  getAuditLogs() {
    return this.adminService.getAuditLogs();
  }

  @Get('audit/overview')
  getAuditOverview() {
    return this.adminService.getAuditOverview();
  }

  @Get('audit/logs')
  getAuditLogsAdmin(@Query() query: AuditLogAdminQueryDto) {
    return this.adminService.getAuditLogsAdmin(query);
  }

  @Get('notifications/overview')
  getNotificationsOverview() {
    return this.adminService.getNotificationsOverview();
  }

  @Get('notifications')
  getNotificationsAdmin(@Query() query: NotificationAdminQueryDto) {
    return this.adminService.getNotificationsAdmin(query);
  }

  @Post('notifications')
  createNotificationAdmin(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateNotificationAdminDto) {
    return this.adminService.createNotificationAdmin({ ...dto, createdByUserId: user.sub });
  }

  @Post('notifications/:notificationId/resend')
  resendNotificationAdmin(
    @CurrentUser() user: JwtAccessPayload,
    @Param('notificationId') notificationId: string,
    @Body() dto: AdminNotificationActionDto,
  ) {
    return this.adminService.resendNotificationAdmin(notificationId, { ...dto, actorUserId: user.sub });
  }

  @Patch('notifications/:notificationId/suppress')
  suppressNotificationAdmin(
    @CurrentUser() user: JwtAccessPayload,
    @Param('notificationId') notificationId: string,
    @Body() dto: AdminNotificationActionDto,
  ) {
    return this.adminService.suppressNotificationAdmin(notificationId, { ...dto, actorUserId: user.sub });
  }

  @Get('leagues/overview')
  getLeaguesOverview(@Query() query: LeagueAdminQueryDto) {
    return this.adminService.getLeaguesOverview(query);
  }

  @Get('leagues/:leagueId/leaderboard')
  getLeagueAdminLeaderboard(
    @Param('leagueId') leagueId: string,
    @Query() query: LeagueLeaderboardQueryDto,
  ) {
    return this.adminService.getLeagueAdminLeaderboard(leagueId, query.matchdayId);
  }

  @Patch('leagues/:leagueId')
  updateLeagueAdmin(@CurrentUser() user: JwtAccessPayload, @Param('leagueId') leagueId: string, @Body() dto: UpdateLeagueAdminDto) {
    return this.adminService.updateLeagueAdmin(leagueId, { ...dto, updatedByUserId: user.sub });
  }

  @Patch('leagues/memberships/:membershipId')
  updateLeagueMembershipAdmin(
    @CurrentUser() user: JwtAccessPayload,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateLeagueMembershipAdminDto,
  ) {
    return this.adminService.updateLeagueMembershipAdmin(membershipId, { ...dto, updatedByUserId: user.sub });
  }

  @Post('leagues/:leagueId/recompute')
  recomputeLeagueLeaderboard(
    @CurrentUser() user: JwtAccessPayload,
    @Param('leagueId') leagueId: string,
    @Query('matchdayId') matchdayId?: string,
  ) {
    return this.adminService.recomputeLeagueLeaderboard(leagueId, matchdayId, user.sub);
  }

  @Get('scoring/overview')
  getScoringOverview(@Query('tournamentId') tournamentId?: string) {
    return this.adminService.getScoringOverview(tournamentId);
  }

  @Get('scoring/logs')
  getScoringLogs(@Query() query: ScoringLogQueryDto) {
    return this.adminService.getScoringLogs(query);
  }

  @Get('scoring/runs')
  getScoringRuns(@Query() query: ScoringRunQueryDto) {
    return this.adminService.getScoringRuns(query);
  }

  @Post('scoring/recompute')
  recomputeScoring(@CurrentUser() user: JwtAccessPayload, @Body() dto: RecomputeScoringAdminDto) {
    return this.adminService.recomputeScoring({ ...dto, requestedByUserId: user.sub });
  }

  @Get('ops/overview')
  getOperationsOverview(@Query('tournamentId') tournamentId?: string) {
    return this.adminService.getOperationsOverview(tournamentId);
  }

  @Post('more/sync')
  syncMoreScreen(@CurrentUser() user: JwtAccessPayload, @Body() dto: MoreScreenSyncDto) {
    return this.adminService.syncMoreScreen({ ...dto, requestedByUserId: user.sub });
  }

  @Post('ops/matchdays')
  createMatchdayOps(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateMatchdayAdminDto) {
    return this.adminService.createMatchdayOps({ ...dto, createdByUserId: user.sub });
  }

  @Patch('ops/tournament')
  updateTournamentOps(@CurrentUser() user: JwtAccessPayload, @Body() dto: UpdateTournamentOpsDto) {
    return this.adminService.updateTournamentOps({ ...dto, updatedByUserId: user.sub });
  }

  @Patch('ops/matchdays/:matchdayId')
  updateMatchdayOps(@CurrentUser() user: JwtAccessPayload, @Param('matchdayId') matchdayId: string, @Body() dto: UpdateMatchdayAdminDto) {
    return this.adminService.updateMatchdayOps(matchdayId, { ...dto, updatedByUserId: user.sub });
  }

  @Post('ops/matchdays/:matchdayId/delete')
  deleteMatchdayOps(@CurrentUser() user: JwtAccessPayload, @Param('matchdayId') matchdayId: string, @Body() dto: DeleteMatchdayAdminDto) {
    return this.adminService.deleteMatchdayOps(matchdayId, { ...dto, deletedByUserId: user.sub });
  }

  @Patch('ops/fixtures/:fixtureId')
  updateFixtureOps(@CurrentUser() user: JwtAccessPayload, @Param('fixtureId') fixtureId: string, @Body() dto: UpdateFixtureAdminDto) {
    return this.adminService.updateFixtureOps(fixtureId, { ...dto, updatedByUserId: user.sub });
  }

  @Post('ops/fixtures/:fixtureId/delete')
  deleteFixtureOps(@CurrentUser() user: JwtAccessPayload, @Param('fixtureId') fixtureId: string, @Body() dto: DeleteFixtureAdminDto) {
    return this.adminService.deleteFixtureOps(fixtureId, { ...dto, deletedByUserId: user.sub });
  }

  @Post('ops/fixtures')
  createFixtureOps(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateFixtureAdminDto) {
    return this.adminService.createFixtureOps({ ...dto, createdByUserId: user.sub });
  }

  @Post('deadlines/unlock')
  unlockMatchday(@CurrentUser() user: JwtAccessPayload, @Body() dto: UnlockMatchdayAdminDto) {
    return this.adminService.unlockMatchday({ ...dto, unlockedByUserId: user.sub });
  }

  @Post('deadlines/complete-update')
  completePostDeadlineUpdate(@CurrentUser() user: JwtAccessPayload, @Body() dto: CompletePostDeadlineUpdateDto) {
    return this.adminService.completePostDeadlineUpdate({ ...dto, requestedByUserId: user.sub });
  }
}
