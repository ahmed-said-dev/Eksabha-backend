import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { TournamentPhase } from '../../../common/database';
import { MatchdayStatus } from '../../tournament/entities/matchday.entity';

export class UpdateMatchdayAdminDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  number?: number;

  @IsOptional()
  @IsEnum(TournamentPhase)
  phase?: TournamentPhase;

  @IsOptional()
  @IsEnum(MatchdayStatus)
  status?: MatchdayStatus;

  @IsOptional()
  @IsDateString()
  opensAt?: string | null;

  @IsOptional()
  @IsDateString()
  deadlineAt?: string;

  @IsOptional()
  @IsDateString()
  locksAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  updatedByUserId?: string;
}
