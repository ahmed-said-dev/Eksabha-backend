import { IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateManualScoringAdjustmentDto {
  @IsString()
  fixtureId!: string;

  @IsString()
  playerId!: string;

  @IsString()
  @MaxLength(80)
  eventType!: string;

  @IsInt()
  minute!: number;

  @IsInt()
  points!: number;

  @IsString()
  @MaxLength(255)
  reason!: string;

  @IsOptional()
  @IsString()
  createdByUserId?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
