import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LockMatchdayDto {
  @IsOptional()
  @IsString()
  matchdayId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  lockedByUserId?: string;
}
