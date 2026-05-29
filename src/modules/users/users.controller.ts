import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/interfaces/auth-request.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getProfile(@CurrentUser() user: JwtAccessPayload) {
    return this.usersService.getUserProfile(user.sub);
  }

  @Get('more')
  getMoreOverview(@CurrentUser() user: JwtAccessPayload, @Query('tournamentId') tournamentId?: string) {
    return this.usersService.getMoreOverview(user.sub, tournamentId ?? user.selectedTournamentId ?? undefined);
  }

  @Get('showcase/team-of-the-week')
  getTeamOfTheWeek(@CurrentUser() user: JwtAccessPayload, @Query('tournamentId') tournamentId?: string) {
    return this.usersService.getTeamShowcase(user.sub, 'week', tournamentId ?? user.selectedTournamentId ?? undefined);
  }

  @Get('showcase/team-of-the-tournament')
  getTeamOfTheTournament(@CurrentUser() user: JwtAccessPayload, @Query('tournamentId') tournamentId?: string) {
    return this.usersService.getTeamShowcase(user.sub, 'tournament', tournamentId ?? user.selectedTournamentId ?? undefined);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: JwtAccessPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateUserProfile(user.sub, dto);
  }
}
