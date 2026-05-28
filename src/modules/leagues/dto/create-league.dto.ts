import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { LeagueScoringMode } from '../entities/league.entity';

export class CreateLeagueDto {
  @IsString()
  @MaxLength(140)
  name!: string;

  @IsOptional()
  @IsEnum(LeagueScoringMode)
  scoringMode?: LeagueScoringMode;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  maxMembers?: number;

  @IsOptional()
  @IsString()
  tournamentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  startsFromMatchdayNumber?: number;
}
