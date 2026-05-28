import { Column, Entity } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';

export enum FeedProcessingStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

@Entity('raw_feed_payloads')
export class RawFeedPayloadEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 80 })
  provider!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 80 })
  entityType!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 80, nullable: true })
  eventType!: string | null;

  @Column({ name: 'external_entity_id', type: 'varchar', length: 128, nullable: true })
  externalEntityId!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'enum', enum: FeedProcessingStatus, default: FeedProcessingStatus.PENDING })
  status!: FeedProcessingStatus;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;
}
