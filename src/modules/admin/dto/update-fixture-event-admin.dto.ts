import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateFixtureEventAdminDto {
  @IsString()
  playerId!: string;

  @IsString()
  @MaxLength(80)
  eventType!: string;

  @IsInt()
  @Min(0)
  minute!: number;

  @IsOptional()
  @IsInt()
  points?: number;

  @IsOptional()
  @IsString()
  relatedPlayerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  relatedPlayerName?: string;

  @IsOptional()
  @IsIn(['home', 'away'])
  teamSide?: 'home' | 'away';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  updatedByUserId?: string;
}
