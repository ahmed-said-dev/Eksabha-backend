import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class UpdateFantasyPickDto {
  @IsString()
  playerId!: string;

  @IsInt()
  @Min(1)
  positionOrder!: number;

  @IsBoolean()
  isCaptain!: boolean;

  @IsBoolean()
  isViceCaptain!: boolean;

  @IsBoolean()
  isBenched!: boolean;
}

export class UpdateFantasyTeamDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  formationCode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateFantasyPickDto)
  picks?: UpdateFantasyPickDto[];
}
