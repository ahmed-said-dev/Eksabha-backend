import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CompletePostDeadlineUpdateDto {
  @IsOptional()
  @IsString()
  matchdayId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsString()
  requestedByUserId?: string;
}
