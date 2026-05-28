import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { GuestAuthDto } from './dto/guest-auth.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SelectCompetitionDto } from './dto/select-competition.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtAccessPayload } from './interfaces/auth-request.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('status')
  getStatus() {
    return {
      module: 'auth',
      status: 'ready',
      plannedEndpoints: [
        'POST /api/auth/signup',
        'POST /api/auth/login',
        'POST /api/auth/forgot-password',
        'POST /api/auth/guest',
        'POST /api/auth/refresh',
        'POST /api/auth/logout',
        'GET /api/auth/competitions',
        'POST /api/auth/competitions/select',
      ],
    };
  }

  @Post('signup')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('guest')
  createGuestSession(@Body() dto: GuestAuthDto) {
    return this.authService.createGuestSession(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('competitions')
  getCompetitionOptions(@CurrentUser() user: JwtAccessPayload) {
    return this.authService.getCompetitionOptions(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('competitions/select')
  selectCompetition(@CurrentUser() user: JwtAccessPayload, @Body() dto: SelectCompetitionDto) {
    return this.authService.selectCompetition(user.sub, dto);
  }
}
