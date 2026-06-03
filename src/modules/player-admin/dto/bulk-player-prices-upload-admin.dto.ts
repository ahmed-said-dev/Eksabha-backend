import { IsOptional, IsString } from 'class-validator';

export class BulkPlayerPricesUploadAdminDto {
  @IsString()
  csvContent!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
