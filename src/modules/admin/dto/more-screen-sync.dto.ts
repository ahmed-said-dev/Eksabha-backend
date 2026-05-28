import { IsOptional, IsString, IsUUID } from 'class-validator';

export class MoreScreenSyncDto {
  @IsUUID()
  tournamentId!: string;

  @IsOptional()
  @IsUUID()
  activeMatchdayId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsUUID()
  requestedByUserId?: string;
}
