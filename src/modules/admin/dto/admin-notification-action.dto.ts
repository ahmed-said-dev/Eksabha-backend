import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminNotificationActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  actorUserId?: string;
}
