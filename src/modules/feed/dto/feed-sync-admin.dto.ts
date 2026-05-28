import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const FEED_MATCHDAY_RECOMPUTE_MODES = ['changed_only', 'all_matchday'] as const;
export type FeedMatchdayRecomputeMode = (typeof FEED_MATCHDAY_RECOMPUTE_MODES)[number];

export class FeedSyncAdminDto {
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @IsOptional()
  @IsString()
  fixtureId?: string;

  @IsOptional()
  @IsBoolean()
  syncEvents?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  requestedByUserId?: string;

  @IsOptional()
  @IsIn(FEED_MATCHDAY_RECOMPUTE_MODES)
  recomputeMode?: FeedMatchdayRecomputeMode;
}
