import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PlayerPosition } from '../../../common/database';

export class UpsertScoringRuleSetDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(80)
  code!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsInt()
  version?: number;
}

export class UpsertScoringRuleDto {
  @IsString()
  @MaxLength(80)
  eventType!: string;

  @IsEnum(PlayerPosition)
  position!: PlayerPosition;

  @IsInt()
  points!: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpsertScoringRulesDto {
  @ValidateNested()
  @Type(() => UpsertScoringRuleSetDto)
  ruleSet!: UpsertScoringRuleSetDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertScoringRuleDto)
  rules!: UpsertScoringRuleDto[];
}
