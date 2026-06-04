import { IsOptional, IsString } from 'class-validator';

export class BulkPlayerJsonUploadAdminDto {
  @IsString()
  jsonContent!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
