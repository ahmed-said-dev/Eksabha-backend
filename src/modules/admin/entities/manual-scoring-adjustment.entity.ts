import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { FixtureEntity } from '../../tournament/entities/fixture.entity';
import { PlayerEntity } from '../../catalog/entities/player.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('manual_scoring_adjustments')
export class ManualScoringAdjustmentEntity extends AppBaseEntity {
  @Column({ name: 'event_type', type: 'varchar', length: 80 })
  eventType!: string;

  @Column({ type: 'int' })
  minute!: number;

  @Column({ type: 'int' })
  points!: number;

  @Column({ type: 'varchar', length: 255 })
  reason!: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details!: Record<string, unknown>;

  @ManyToOne(() => FixtureEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixture_id' })
  fixture!: FixtureEntity;

  @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy!: UserEntity | null;
}
