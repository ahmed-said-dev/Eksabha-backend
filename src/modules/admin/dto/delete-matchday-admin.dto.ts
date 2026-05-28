import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteMatchdayAdminDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  deletedByUserId?: string;
}
