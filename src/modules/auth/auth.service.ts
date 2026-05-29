import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import type { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';

import { RefreshSessionEntity } from './entities/refresh-session.entity';
import { GuestAuthDto } from './dto/guest-auth.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SelectCompetitionDto } from './dto/select-competition.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { readActiveCompetitionConfig } from '../../common/config/competition.config';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { TournamentEntity } from '../tournament/entities/tournament.entity';
import { TournamentStatus } from '../tournament/entities/tournament.entity';
import { UserProfileEntity } from '../users/entities/user-profile.entity';
import {
  UserAccountType,
  UserEntity,
  UserStatus,
} from '../users/entities/user.entity';

interface AuthPayload {
  sub: string;
  sid: string;
  typ: 'access' | 'refresh';
  accountType?: UserAccountType;
  selectedTournamentId?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly userProfilesRepository: Repository<UserProfileEntity>,
    @InjectRepository(TournamentEntity)
    private readonly tournamentsRepository: Repository<TournamentEntity>,
    @InjectRepository(MatchdayEntity)
    private readonly matchdaysRepository: Repository<MatchdayEntity>,
    @InjectRepository(FantasyTeamEntity)
    private readonly fantasyTeamsRepository: Repository<FantasyTeamEntity>,
    @InjectRepository(RefreshSessionEntity)
    private readonly refreshSessionsRepository: Repository<RefreshSessionEntity>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async signUp(dto: SignUpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existingUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    const user = this.usersRepository.create({
      email: normalizedEmail,
      passwordHash: await hash(dto.password, 10),
      accountType: UserAccountType.REGISTERED,
      status: UserStatus.ACTIVE,
      lastLoginAt: new Date(),
    });
    const savedUser = await this.usersRepository.save(user);

    const profile = this.userProfilesRepository.create({
      user: savedUser,
      displayName: dto.displayName.trim(),
      teamName: dto.teamName.trim(),
      locale: 'en',
      timezone: 'UTC',
      avatarUrl: null,
    });
    const savedProfile = await this.userProfilesRepository.save(profile);
    savedUser.profile = savedProfile;

    return this.createSessionAndTokens(savedUser);
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
      relations: { profile: true },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatches = await compare(dto.password, user.passwordHash);
    if (!passwordMatches || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    user.lastLoginAt = new Date();
    await this.usersRepository.save(user);

    return this.createSessionAndTokens(user);
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      return {
        accepted: true,
      };
    }

    const user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (user && user.accountType !== UserAccountType.GUEST && user.status === UserStatus.ACTIVE) {
      this.logger.log(`Password reset requested for user=${user.id}.`);
    }

    return {
      accepted: true,
    };
  }

  async createGuestSession(dto: GuestAuthDto) {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const user = this.usersRepository.create({
      email: null,
      passwordHash: null,
      accountType: UserAccountType.GUEST,
      status: UserStatus.ACTIVE,
      lastLoginAt: new Date(),
    });
    const savedUser = await this.usersRepository.save(user);

    const profile = this.userProfilesRepository.create({
      user: savedUser,
      displayName: dto.displayName?.trim() || `Guest ${suffix}`,
      teamName: dto.teamName?.trim() || `Guest Squad ${suffix}`,
      locale: 'en',
      timezone: 'UTC',
      avatarUrl: null,
    });
    const savedProfile = await this.userProfilesRepository.save(profile);
    savedUser.profile = savedProfile;

    return this.createSessionAndTokens(savedUser);
  }

  async refresh(dto: RefreshTokenDto) {
    const session = await this.validateRefreshToken(dto.refreshToken);

    return this.rotateSessionTokens(session.user, session);
  }

  async logout(dto: LogoutDto) {
    const session = await this.validateRefreshToken(dto.refreshToken);

    session.revokedAt = new Date();
    await this.refreshSessionsRepository.save(session);

    return { success: true };
  }

  async getCompetitionOptions(userId: string) {
    const [user, tournaments, fantasyTeams] = await Promise.all([
      this.usersRepository.findOne({
        where: { id: userId },
        relations: { profile: true },
      }),
      this.tournamentsRepository.find({ order: { year: 'DESC', createdAt: 'DESC' } }),
      this.fantasyTeamsRepository.find({
        where: { user: { id: userId } },
        relations: { tournament: true },
      }),
    ]);

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const fantasyTeamsByTournamentId = new Map(
      fantasyTeams.map((fantasyTeam) => [fantasyTeam.tournament.id, fantasyTeam]),
    );

    const worldCupTournaments = tournaments.filter((tournament) => tournament.format === 'world_cup');

    return {
      user: this.buildUserResponse(user),
      tournaments: worldCupTournaments.map((tournament) => ({
        id: tournament.id,
        competitionKey: tournament.competitionKey,
        name: tournament.name,
        slug: tournament.slug,
        format: tournament.format,
        country: tournament.country,
        year: tournament.year,
        currentPhase: tournament.currentPhase,
        currentMatchdayNumber: tournament.currentMatchdayNumber,
        totalGroups: tournament.totalGroups,
        totalTeams: tournament.totalTeams,
        hasFantasyTeam: fantasyTeamsByTournamentId.has(tournament.id),
      })),
    };
  }

  async selectCompetition(userId: string, dto: SelectCompetitionDto) {
    const [user, tournament] = await Promise.all([
      this.usersRepository.findOne({
        where: { id: userId },
        relations: { profile: true },
      }),
      this.tournamentsRepository.findOne({ where: { id: dto.tournamentId } }),
    ]);

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!tournament) {
      throw new UnauthorizedException('Tournament not found.');
    }

    if (tournament.format !== 'world_cup') {
      throw new UnauthorizedException('This app only supports FIFA World Cup fantasy competitions.');
    }

    const fantasyTeam = await this.fantasyTeamsRepository.findOne({
      where: { user: { id: user.id }, tournament: { id: tournament.id } },
      relations: { tournament: true },
    });

    if (!fantasyTeam) {
      await this.fantasyTeamsRepository.save(
        this.fantasyTeamsRepository.create({
          user,
          tournament,
          name: dto.teamName.trim(),
          budgetRemaining: '100.00',
          totalBudget: '100.00',
          freeTransfers: 1,
          formationCode: '4-4-2',
          totalPoints: 0,
          teamValue: '0.00',
          activeChipType: null,
        }),
      );
    }

    if (user.profile) {
      user.profile.teamName = dto.teamName.trim();
      await this.userProfilesRepository.save(user.profile);
      user.profile.teamName = dto.teamName.trim();
    }

    return this.createSessionAndTokens(user, tournament.id);
  }

  private async createSessionAndTokens(user: UserEntity, selectedTournamentId: string | null = null) {
    await this.ensureAuthAllowedDuringDeadlineUpdateWindow();

    const session = this.refreshSessionsRepository.create({
      user,
      tokenHash: 'pending',
      issuedAt: new Date(),
      expiresAt: this.buildRefreshExpiryDate(),
      revokedAt: null,
      deviceId: null,
      ip: null,
      userAgent: null,
    });
    const savedSession = await this.refreshSessionsRepository.save(session);

    return this.rotateSessionTokens(user, savedSession, selectedTournamentId);
  }

  private async ensureAuthAllowedDuringDeadlineUpdateWindow() {
    const competition = readActiveCompetitionConfig(this.configService);
    const tournament = await this.tournamentsRepository.findOne({
      where: [{ competitionKey: competition.key }, { slug: competition.slug }],
      order: { year: 'DESC', createdAt: 'DESC' },
    });

    if (!tournament || tournament.status !== TournamentStatus.DEADLINE_LOCKED) {
      return;
    }

    const currentMatchday = await this.matchdaysRepository.findOne({
      where: {
        tournament: { id: tournament.id },
        number: tournament.currentMatchdayNumber,
      },
      relations: { tournament: true },
    });

    if (!currentMatchday?.deadlineAt) {
      return;
    }

    const availableAtMs = new Date(currentMatchday.deadlineAt).getTime() + 60 * 60 * 1000;
    const nowMs = Date.now();
    if (nowMs >= availableAtMs) {
      return;
    }

    const minutesRemaining = Math.max(1, Math.ceil((availableAtMs - nowMs) / 60_000));
    throw new ServiceUnavailableException({
      statusCode: 503,
      message: 'Fantasy is updating after the deadline. Please login again after one hour from deadline.',
      code: 'GAME_UPDATING_AFTER_DEADLINE',
      availableAt: new Date(availableAtMs).toISOString(),
      minutesRemaining,
    });
  }

  private async rotateSessionTokens(user: UserEntity, session: RefreshSessionEntity, selectedTournamentId: string | null = null) {
    const accessTokenExpiresIn = (this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN') ?? '7d') as SignOptions['expiresIn'];

    const accessPayload: AuthPayload = {
      sub: user.id,
      sid: session.id,
      typ: 'access',
      accountType: user.accountType,
      selectedTournamentId,
    };
    const refreshPayload: AuthPayload = {
      sub: user.id,
      sid: session.id,
      typ: 'refresh',
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: process.env.JWT_ACCESS_TOKEN_SECRET,
      expiresIn: accessTokenExpiresIn,
    });
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: process.env.JWT_REFRESH_TOKEN_SECRET,
      expiresIn: '30d',
    });

    session.tokenHash = await hash(refreshToken, 10);
    session.issuedAt = new Date();
    session.expiresAt = this.buildRefreshExpiryDate();
    await this.refreshSessionsRepository.save(session);

    return {
      accessToken,
      refreshToken,
      user: this.buildUserResponse(user),
      selectedTournamentId,
    };
  }

  private async validateRefreshToken(refreshToken: string) {
    let payload: AuthPayload;
    try {
      payload = await this.jwtService.verifyAsync<AuthPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_TOKEN_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token type.');
    }

    const session = await this.refreshSessionsRepository.findOne({
      where: { id: payload.sid },
      relations: { user: { profile: true } },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh session is no longer valid.');
    }

    const tokenMatches = await compare(refreshToken, session.tokenHash);
    if (!tokenMatches || session.user.id !== payload.sub) {
      throw new UnauthorizedException('Refresh token validation failed.');
    }

    return session;
  }

  private buildUserResponse(user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      accountType: user.accountType,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      profile: user.profile
        ? {
            id: user.profile.id,
            displayName: user.profile.displayName,
            teamName: user.profile.teamName,
            avatarUrl: user.profile.avatarUrl,
            locale: user.profile.locale,
            timezone: user.profile.timezone,
            watchlistPlayerIds: user.profile.watchlistPlayerIds ?? [],
            favoritePlayerIds: user.profile.favoritePlayerIds ?? [],
          }
        : null,
    };
  }

  private buildRefreshExpiryDate() {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
}
