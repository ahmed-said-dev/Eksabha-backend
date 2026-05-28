import { IsOptional, IsString } from 'class-validator';

export class LeagueAdminQueryDto {
  @IsOptional()
  @IsString()
  tournamentId?: string;
}
