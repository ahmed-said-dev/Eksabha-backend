import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RecomputeScoringAdminDto {
  @IsOptional()
  @IsString()
  fixtureId?: string;

  @IsOptional()
  @IsString()
  matchdayId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  requestedByUserId?: string;
}
