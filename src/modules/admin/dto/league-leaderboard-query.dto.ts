import { IsOptional, IsString } from 'class-validator';

export class LeagueLeaderboardQueryDto {
  @IsOptional()
  @IsString()
  matchdayId?: string;
}
