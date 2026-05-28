import { IsString } from 'class-validator';

export class UpdateCaptaincyDto {
  @IsString()
  captainPlayerId!: string;

  @IsString()
  viceCaptainPlayerId!: string;
}
