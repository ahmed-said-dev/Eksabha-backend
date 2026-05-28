import { IsOptional, IsString } from 'class-validator';

export class NotificationAdminQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  status?: 'read' | 'unread';
}
