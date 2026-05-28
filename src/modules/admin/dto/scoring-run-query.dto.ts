import { IsOptional, IsString } from 'class-validator';

export class ScoringRunQueryDto {
  @IsOptional()
  @IsString()
  fixtureId?: string;

  @IsOptional()
  @IsString()
  matchdayId?: string;
}
