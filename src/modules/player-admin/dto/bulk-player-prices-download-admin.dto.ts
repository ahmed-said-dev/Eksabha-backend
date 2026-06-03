import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class BulkPlayerPricesDownloadAdminDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  playerIds!: string[];

  @IsOptional()
  @IsString()
  reason?: string;
}
