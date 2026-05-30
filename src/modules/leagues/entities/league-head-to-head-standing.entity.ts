import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { LeagueEntity } from './league.entity';
import { LeagueMembershipEntity } from './league-membership.entity';

@Entity('league_head_to_head_standings')
export class LeagueHeadToHeadStandingEntity extends AppBaseEntity {
  @Column({ name: 'matches_played', type: 'int', default: 0 })
  matchesPlayed!: number;

  @Column({ name: 'wins', type: 'int', default: 0 })
  wins!: number;

  @Column({ name: 'draws', type: 'int', default: 0 })
  draws!: number;

  @Column({ name: 'losses', type: 'int', default: 0 })
  losses!: number;

  @Column({ name: 'points_for', type: 'int', default: 0 })
  pointsFor!: number;

  @Column({ name: 'points_against', type: 'int', default: 0 })
  pointsAgainst!: number;

  @Column({ name: 'league_points', type: 'int', default: 0 })
  leaguePoints!: number;

  @Column({ name: 'rank', type: 'int', nullable: true })
  rank!: number | null;

  @Column({ name: 'is_average', type: 'boolean', default: false })
  isAverage!: boolean;

  @ManyToOne(() => LeagueEntity, (league) => league.headToHeadStandings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'league_id' })
  league!: LeagueEntity;

  @ManyToOne(() => LeagueMembershipEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'membership_id' })
  membership!: LeagueMembershipEntity | null;
}
