import { IsEnum } from 'class-validator';

import { ChipType } from '../../../common/database';

export class ActivateChipDto {
  @IsEnum(ChipType)
  chipType!: ChipType;
}