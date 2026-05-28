import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity, FixtureStatus } from '../../../common/database';
import { FixtureEntity } from '../../tournament/entities/fixture.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('fixture_corrections')
export class FixtureCorrectionEntity extends AppBaseEntity {
  @Column({ name: 'reason', type: 'varchar', length: 255 })
  reason!: string;

  @Column({ name: 'home_score', type: 'int', nullable: true })
  homeScore!: number | null;

  @Column({ name: 'away_score', type: 'int', nullable: true })
  awayScore!: number | null;

  @Column({ name: 'current_minute', type: 'int', nullable: true })
  currentMinute!: number | null;

  @Column({ type: 'enum', enum: FixtureStatus, nullable: true })
  status!: FixtureStatus | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @ManyToOne(() => FixtureEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixture_id' })
  fixture!: FixtureEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy!: UserEntity | null;
}
