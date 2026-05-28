import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { FixtureStatus, TournamentPhase } from '../../../common/database';

export class CreateFixtureAdminDto {
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @IsOptional()
  @IsString()
  matchdayId?: string | null;

  @IsOptional()
  @IsString()
  groupId?: string | null;

  @IsString()
  homeTeamId!: string;

  @IsString()
  awayTeamId!: string;

  @IsEnum(TournamentPhase)
  phase!: TournamentPhase;

  @IsOptional()
  @IsEnum(FixtureStatus)
  status?: FixtureStatus;

  @IsDateString()
  kickoffAt!: string;

  @IsString()
  @MaxLength(160)
  venue!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  homeScore?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  awayScore?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  currentMinute?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalProviderId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  createdByUserId?: string;
}
