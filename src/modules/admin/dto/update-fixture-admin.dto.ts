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

export class UpdateFixtureAdminDto {
  @IsOptional()
  @IsEnum(TournamentPhase)
  phase?: TournamentPhase;

  @IsOptional()
  @IsEnum(FixtureStatus)
  status?: FixtureStatus;

  @IsOptional()
  @IsDateString()
  kickoffAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  venue?: string;

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
  matchdayId?: string | null;

  @IsOptional()
  @IsString()
  groupId?: string | null;

  @IsOptional()
  @IsString()
  homeTeamId?: string;

  @IsOptional()
  @IsString()
  awayTeamId?: string;

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
  updatedByUserId?: string;
}
