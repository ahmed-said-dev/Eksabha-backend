import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { MatchdayEntity } from '../../tournament/entities/matchday.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('matchday_locks')
export class MatchdayLockEntity extends AppBaseEntity {
  @Column({ name: 'locked_at', type: 'timestamptz' })
  lockedAt!: Date;

  @Column({ name: 'unlocked_at', type: 'timestamptz', nullable: true })
  unlockedAt!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @ManyToOne(() => MatchdayEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'matchday_id' })
  matchday!: MatchdayEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'locked_by_user_id' })
  lockedBy!: UserEntity | null;
}
