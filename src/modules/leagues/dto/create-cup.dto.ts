import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCupDto {
  @IsString()
  @MaxLength(140)
  name!: string;

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
  startMatchdayNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  entryCutoffMatchdayNumber?: number;
}
