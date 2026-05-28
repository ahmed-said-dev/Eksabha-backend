import { Column, Entity, OneToMany, OneToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { RefreshSessionEntity } from '../../auth/entities/refresh-session.entity';
import { FantasyTeamEntity } from '../../fantasy/entities/fantasy-team.entity';
import { LeagueEntity } from '../../leagues/entities/league.entity';
import { LeagueMembershipEntity } from '../../leagues/entities/league-membership.entity';
import { NotificationEntity } from '../../notifications/entities/notification.entity';
import { UserProfileEntity } from './user-profile.entity';

export enum UserAccountType {
  GUEST = 'guest',
  REGISTERED = 'registered',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
  DELETED = 'deleted',
}

@Entity('users')
export class UserEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email!: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'account_type', type: 'enum', enum: UserAccountType, default: UserAccountType.GUEST })
  accountType!: UserAccountType;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @OneToOne(() => UserProfileEntity, (profile) => profile.user)
  profile!: UserProfileEntity;

  @OneToMany(() => RefreshSessionEntity, (session) => session.user)
  refreshSessions!: RefreshSessionEntity[];

  @OneToMany(() => FantasyTeamEntity, (fantasyTeam) => fantasyTeam.user)
  fantasyTeams!: FantasyTeamEntity[];

  @OneToMany(() => LeagueMembershipEntity, (membership) => membership.user)
  leagueMemberships!: LeagueMembershipEntity[];

  @OneToMany(() => NotificationEntity, (notification) => notification.user)
  notifications!: NotificationEntity[];

  @OneToMany(() => LeagueEntity, (league) => league.owner)
  ownedLeagues!: LeagueEntity[];
}
