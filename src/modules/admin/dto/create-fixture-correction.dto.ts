import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

import { FixtureStatus } from '../../../common/database';

export class CreateFixtureCorrectionDto {
  @IsString()
  fixtureId!: string;

  @IsString()
  @MaxLength(255)
  reason!: string;

  @IsOptional()
  @IsInt()
  homeScore?: number | null;

  @IsOptional()
  @IsInt()
  awayScore?: number | null;

  @IsOptional()
  @IsInt()
  currentMinute?: number | null;

  @IsOptional()
  @IsEnum(FixtureStatus)
  status?: FixtureStatus | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  createdByUserId?: string;
}
