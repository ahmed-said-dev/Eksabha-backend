import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignUpDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  teamName!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(24)
  @Matches(/^\+?[0-9\s().-]+$/)
  mobileNumber!: string;
}
