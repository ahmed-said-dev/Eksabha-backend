import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { TournamentPhase } from '../../../common/database';
import { MatchdayStatus } from '../../tournament/entities/matchday.entity';

export class CreateMatchdayAdminDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  number!: number;

  @IsEnum(TournamentPhase)
  phase!: TournamentPhase;

  @IsOptional()
  @IsEnum(MatchdayStatus)
  status?: MatchdayStatus;

  @IsOptional()
  @IsDateString()
  opensAt?: string | null;

  @IsDateString()
  deadlineAt!: string;

  @IsOptional()
  @IsDateString()
  locksAt?: string | null;

  @IsOptional()
  @IsString()
  tournamentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  createdByUserId?: string;
}
