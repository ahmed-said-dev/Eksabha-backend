import { IsOptional, IsString } from 'class-validator';

export class ScoringLogQueryDto {
  @IsOptional()
  @IsString()
  fixtureId?: string;

  @IsOptional()
  @IsString()
  playerId?: string;
}
