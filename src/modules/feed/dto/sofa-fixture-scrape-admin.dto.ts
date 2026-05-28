import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SofaFixtureScrapeAdminDto {
  @IsString()
  fixtureId!: string;

  @IsString()
  @MaxLength(1000)
  sofaScoreUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  requestedByUserId?: string;
}
