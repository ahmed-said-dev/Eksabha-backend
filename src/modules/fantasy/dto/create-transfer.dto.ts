import { IsString } from 'class-validator';

export class CreateTransferDto {
  @IsString()
  playerOutId!: string;

  @IsString()
  playerInId!: string;
}
