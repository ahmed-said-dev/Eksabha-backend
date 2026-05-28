import { IsOptional, IsString } from 'class-validator';

export class ProviderMappingQueryDto {
  @IsOptional()
  @IsString()
  tournamentId?: string;
}
