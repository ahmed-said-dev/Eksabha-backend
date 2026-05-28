import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { LeagueMembershipRole } from '../../leagues/entities/league-membership.entity';

export class UpdateLeagueMembershipAdminDto {
  @IsOptional()
  @IsEnum(LeagueMembershipRole)
  role?: LeagueMembershipRole;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  updatedByUserId?: string;
}
