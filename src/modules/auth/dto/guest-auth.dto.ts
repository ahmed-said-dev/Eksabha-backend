import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GuestAuthDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  teamName?: string;
}
