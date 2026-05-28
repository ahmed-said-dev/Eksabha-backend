import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { MatchdayEntity } from '../../tournament/entities/matchday.entity';
import { LeagueEntity } from './league.entity';
import { LeagueMembershipEntity } from './league-membership.entity';

export enum LeaguePendingEntryStatus {
  PENDING = 'pending',
  ACTIVATED = 'activated',
  CANCELLED = 'cancelled',
}

@Entity('league_pending_entries')
export class LeaguePendingEntryEntity extends AppBaseEntity {
  @Column({ type: 'enum', enum: LeaguePendingEntryStatus, default: LeaguePendingEntryStatus.PENDING })
  status!: LeaguePendingEntryStatus;

  @Column({ name: 'activation_matchday_number', type: 'int' })
  activationMatchdayNumber!: number;

  @Column({ name: 'source_scope_key', type: 'varchar', length: 64, nullable: true })
  sourceScopeKey!: string | null;

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @ManyToOne(() => LeagueEntity, (league) => league.pendingEntries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'league_id' })
  league!: LeagueEntity;

  @ManyToOne(() => LeagueMembershipEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_id' })
  membership!: LeagueMembershipEntity;

  @ManyToOne(() => MatchdayEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'activation_matchday_id' })
  activationMatchday!: MatchdayEntity | null;
}
