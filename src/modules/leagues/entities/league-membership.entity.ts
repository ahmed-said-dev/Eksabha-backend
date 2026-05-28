import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { FantasyTeamEntity } from '../../fantasy/entities/fantasy-team.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { LeagueEntity } from './league.entity';
import { CupEntryEntity } from './cup-entry.entity';
import { LeaguePendingEntryEntity } from './league-pending-entry.entity';

export enum LeagueMembershipRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum LeagueMembershipStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  ELIMINATED = 'eliminated',
  LEFT = 'left',
}

export enum LeagueJoinSource {
  OWNER_CREATE = 'owner_create',
  PRIVATE_CODE = 'private_code',
  PUBLIC_AUTO = 'public_auto',
  SYSTEM_SEED = 'system_seed',
  ADMIN = 'admin',
}

@Entity('league_memberships')
export class LeagueMembershipEntity extends AppBaseEntity {
  @Column({ type: 'enum', enum: LeagueMembershipRole, default: LeagueMembershipRole.MEMBER })
  role!: LeagueMembershipRole;

  @Column({ type: 'enum', enum: LeagueMembershipStatus, default: LeagueMembershipStatus.ACTIVE })
  status!: LeagueMembershipStatus;

  @Column({ name: 'join_source', type: 'enum', enum: LeagueJoinSource, default: LeagueJoinSource.PRIVATE_CODE })
  joinSource!: LeagueJoinSource;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt!: Date | null;

  @Column({ name: 'entry_name_snapshot', type: 'varchar', length: 120, nullable: true })
  entryNameSnapshot!: string | null;

  @Column({ name: 'manager_name_snapshot', type: 'varchar', length: 120, nullable: true })
  managerNameSnapshot!: string | null;

  @Column({ name: 'seed_number', type: 'int', nullable: true })
  seedNumber!: number | null;

  @Column({ name: 'is_pending_new_entry', type: 'boolean', default: false })
  isPendingNewEntry!: boolean;

  @ManyToOne(() => LeagueEntity, (league) => league.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'league_id' })
  league!: LeagueEntity;

  @ManyToOne(() => UserEntity, (user) => user.leagueMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => FantasyTeamEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'fantasy_team_id' })
  fantasyTeam!: FantasyTeamEntity | null;
}
