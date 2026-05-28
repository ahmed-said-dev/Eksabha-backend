import { IsString, IsUUID } from 'class-validator';

export class SelectCompetitionDto {
  @IsUUID()
  tournamentId!: string;

  @IsString()
  teamName!: string;
}
