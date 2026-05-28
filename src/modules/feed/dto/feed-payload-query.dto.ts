import { IsOptional, IsString } from 'class-validator';

import { FeedProcessingStatus } from '../entities/raw-feed-payload.entity';

export class FeedPayloadQueryDto {
  @IsOptional()
  @IsString()
  status?: FeedProcessingStatus;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  entityType?: string;
}
