import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('admin_audit_logs')
export class AdminAuditLogEntity extends AppBaseEntity {
  @Column({ name: 'action_type', type: 'varchar', length: 80 })
  actionType!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 80 })
  targetType!: string;

  @Column({ name: 'target_id', type: 'varchar', length: 128 })
  targetId!: string;

  @Column({ type: 'varchar', length: 255 })
  reason!: string;

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState!: Record<string, unknown> | null;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState!: Record<string, unknown> | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id' })
  actor!: UserEntity | null;
}
