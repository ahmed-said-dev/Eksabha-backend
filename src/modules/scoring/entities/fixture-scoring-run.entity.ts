import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { FixtureEntity } from '../../tournament/entities/fixture.entity';

export enum FixtureScoringRunStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('fixture_scoring_runs')
export class FixtureScoringRunEntity extends AppBaseEntity {
  @Column({ type: 'enum', enum: FixtureScoringRunStatus, default: FixtureScoringRunStatus.PENDING })
  status!: FixtureScoringRunStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @ManyToOne(() => FixtureEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixture_id' })
  fixture!: FixtureEntity;
}
