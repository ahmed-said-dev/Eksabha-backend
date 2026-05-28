import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { MatchdayEntity } from '../../tournament/entities/matchday.entity';
import { LeagueEntity } from './league.entity';
import { LeagueMembershipEntity } from './league-membership.entity';

export enum LeagueHeadToHeadFixtureStatus {
  UPCOMING = 'upcoming',
  LIVE = 'live',
  FINALIZED = 'finalized',
  BYE = 'bye',
}

@Entity('league_head_to_head_fixtures')
export class LeagueHeadToHeadFixtureEntity extends AppBaseEntity {
  @Column({ name: 'round_number', type: 'int' })
  roundNumber!: number;

  @Column({ name: 'matchday_number', type: 'int' })
  matchdayNumber!: number;

  @Column({ type: 'enum', enum: LeagueHeadToHeadFixtureStatus, default: LeagueHeadToHeadFixtureStatus.UPCOMING })
  status!: LeagueHeadToHeadFixtureStatus;

  @Column({ name: 'home_points', type: 'int', nullable: true })
  homePoints!: number | null;

  @Column({ name: 'away_points', type: 'int', nullable: true })
  awayPoints!: number | null;

  @Column({ name: 'is_bye', type: 'boolean', default: false })
  isBye!: boolean;

  @Column({ name: 'notes', type: 'varchar', length: 255, nullable: true })
  notes!: string | null;

  @ManyToOne(() => LeagueEntity, (league) => league.headToHeadFixtures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'league_id' })
  league!: LeagueEntity;

  @ManyToOne(() => MatchdayEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'matchday_id' })
  matchday!: MatchdayEntity | null;

  @ManyToOne(() => LeagueMembershipEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'home_membership_id' })
  homeMembership!: LeagueMembershipEntity | null;

  @ManyToOne(() => LeagueMembershipEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'away_membership_id' })
  awayMembership!: LeagueMembershipEntity | null;

  @ManyToOne(() => LeagueMembershipEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'winner_membership_id' })
  winnerMembership!: LeagueMembershipEntity | null;
}
