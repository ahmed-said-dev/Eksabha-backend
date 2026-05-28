import { IsObject, IsOptional, IsString } from 'class-validator';

export class IngestFeedPayloadDto {
  @IsString()
  provider!: string;

  @IsString()
  entityType!: string;

  @IsOptional()
  @IsString()
  eventType?: string | null;

  @IsOptional()
  @IsString()
  externalEntityId?: string | null;

  @IsObject()
  payload!: Record<string, unknown>;
}
