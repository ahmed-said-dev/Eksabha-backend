import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class ScoreFixtureEventDto {
  @IsOptional()
  @IsString()
  fixtureId?: string;

  @IsString()
  playerId!: string;

  @IsString()
  type!: string;

  @IsInt()
  @Min(0)
  minute!: number;

  @IsOptional()
  @IsInt()
  points?: number;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
