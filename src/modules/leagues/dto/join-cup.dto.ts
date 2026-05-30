import { IsString, Length } from 'class-validator';

export class JoinCupDto {
  @IsString()
  @Length(4, 24)
  joinCode!: string;
}
