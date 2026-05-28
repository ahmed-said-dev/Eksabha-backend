import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { TournamentPhase } from '../../../common/database';
import { TournamentStatus } from '../../tournament/entities/tournament.entity';

export class UpdateTournamentOpsDto {
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @IsOptional()
  @IsEnum(TournamentPhase)
  currentPhase?: TournamentPhase;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  currentMatchdayNumber?: number;

  @IsOptional()
  @Transform(({ value }) => (value === null || value === '' || value === undefined ? null : Number(value)))
  @IsInt()
  @Min(1)
  visibleTeamMatchdayNumber?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value === null || value === '' || value === undefined ? null : Number(value)))
  @IsInt()
  @Min(0)
  visibleLivePointsMatchdayNumber?: number | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  updatedByUserId?: string;
}
