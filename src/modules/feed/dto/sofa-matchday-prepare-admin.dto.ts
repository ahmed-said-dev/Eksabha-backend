import { Type } from 'class-transformer';
import {
  ArrayUnique,
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SofaMatchdayPreviewAdminDto {
  @IsString()
  tournamentId!: string;

  @IsString()
  matchdayId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sofaScoreTournamentId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sofaScoreSeasonId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sofaScoreRound!: number;
}

export class SofaMatchdayImportAdminDto extends SofaMatchdayPreviewAdminDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  eventIds!: number[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  requestedByUserId?: string;
}
