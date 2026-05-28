import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { TournamentEntity } from '../../tournament/entities/tournament.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { CupEntity } from './cup.entity';
import { LeagueHeadToHeadFixtureEntity } from './league-head-to-head-fixture.entity';
import { LeagueMembershipEntity } from './league-membership.entity';
import { LeaguePendingEntryEntity } from './league-pending-entry.entity';

export enum LeagueType {
  GLOBAL = 'global',
  PRIVATE = 'private',
  PUBLIC = 'public',
  COUNTRY = 'country',
  SYSTEM = 'system',
}

export enum LeagueScoringMode {
  CLASSIC = 'classic',
  HEAD_TO_HEAD = 'head_to_head',
}

export enum LeagueStatus {
  OPEN = 'open',
  LOCKED = 'locked',
  ARCHIVED = 'archived',
}

export enum LeagueCategory {
  GENERAL = 'general',
  APP = 'app',
  GAMEWEEK = 'gameweek',
  MONTHLY = 'monthly',
  CUSTOM = 'custom',
}

@Entity('leagues')
export class LeagueEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 140 })
  name!: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  slug!: string | null;

  @Column({ type: 'enum', enum: LeagueType, default: LeagueType.PRIVATE })
  type!: LeagueType;

  @Column({ name: 'scoring_mode', type: 'enum', enum: LeagueScoringMode, default: LeagueScoringMode.CLASSIC })
  scoringMode!: LeagueScoringMode;

  @Column({ type: 'enum', enum: LeagueStatus, default: LeagueStatus.OPEN })
  status!: LeagueStatus;

  @Column({ type: 'enum', enum: LeagueCategory, default: LeagueCategory.CUSTOM })
  category!: LeagueCategory;

  @Column({ name: 'join_code', type: 'varchar', length: 24, nullable: true, unique: true })
  joinCode!: string | null;

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic!: boolean;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived!: boolean;

  @Column({ name: 'max_members', type: 'int', default: 50 })
  maxMembers!: number;

  @Column({ name: 'description', type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ name: 'badge_label', type: 'varchar', length: 60, nullable: true })
  badgeLabel!: string | null;

  @Column({ name: 'badge_color', type: 'varchar', length: 24, nullable: true })
  badgeColor!: string | null;

  @Column({ name: 'monthly_scope_key', type: 'varchar', length: 32, nullable: true })
  monthlyScopeKey!: string | null;

  @Column({ name: 'starts_from_matchday_number', type: 'int', nullable: true })
  startsFromMatchdayNumber!: number | null;

  @Column({ name: 'is_join_locked', type: 'boolean', default: false })
  isJoinLocked!: boolean;

  @Column({ name: 'allow_auto_join', type: 'boolean', default: false })
  allowAutoJoin!: boolean;

  @Column({ name: 'system_key', type: 'varchar', length: 120, nullable: true })
  systemKey!: string | null;

  @ManyToOne(() => UserEntity, (user) => user.ownedLeagues, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id' })
  owner!: UserEntity | null;

  @ManyToOne(() => TournamentEntity, (tournament) => tournament.leagues, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tournament_id' })
  tournament!: TournamentEntity | null;

  @OneToMany(() => LeagueMembershipEntity, (membership) => membership.league)
  memberships!: LeagueMembershipEntity[];

  @OneToMany(() => LeaguePendingEntryEntity, (pendingEntry) => pendingEntry.league)
  pendingEntries!: LeaguePendingEntryEntity[];

  @OneToMany(() => LeagueHeadToHeadFixtureEntity, (fixture) => fixture.league)
  headToHeadFixtures!: LeagueHeadToHeadFixtureEntity[];

  @OneToMany(() => CupEntity, (cup) => cup.league)
  cups!: CupEntity[];
}
