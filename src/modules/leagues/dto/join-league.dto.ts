import { IsString, Length } from 'class-validator';

export class JoinLeagueDto {
  @IsString()
  @Length(4, 24)
  joinCode!: string;
}
