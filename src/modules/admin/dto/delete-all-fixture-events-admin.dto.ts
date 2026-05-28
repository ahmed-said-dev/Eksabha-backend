import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteAllFixtureEventsAdminDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  deletedByUserId?: string;
}
