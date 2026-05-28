import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { CupEntity } from './cup.entity';
import { LeagueMembershipEntity } from './league-membership.entity';

export enum CupEntryStatus {
  ACTIVE = 'active',
  ELIMINATED = 'eliminated',
  WINNER = 'winner',
}

@Entity('cup_entries')
export class CupEntryEntity extends AppBaseEntity {
  @Column({ name: 'seed_number', type: 'int', nullable: true })
  seedNumber!: number | null;

  @Column({ type: 'enum', enum: CupEntryStatus, default: CupEntryStatus.ACTIVE })
  status!: CupEntryStatus;

  @ManyToOne(() => CupEntity, (cup) => cup.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cup_id' })
  cup!: CupEntity;

  @ManyToOne(() => LeagueMembershipEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership!: LeagueMembershipEntity;
}
