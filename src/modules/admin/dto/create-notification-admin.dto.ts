import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNotificationAdminDto {
  @IsString()
  userId!: string;

  @IsString()
  @MaxLength(80)
  type!: string;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  createdByUserId?: string;
}
