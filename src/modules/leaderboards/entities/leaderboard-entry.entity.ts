import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { FantasyTeamEntity } from '../../fantasy/entities/fantasy-team.entity';
import { LeagueEntity } from '../../leagues/entities/league.entity';
import { MatchdayEntity } from '../../tournament/entities/matchday.entity';

@Entity('leaderboard_entries')
export class LeaderboardEntryEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 20, default: 'global' })
  scope!: string;

  @Column({ name: 'scope_type', type: 'varchar', length: 40, default: 'overall' })
  scopeType!: string;

  @Column({ name: 'scope_key', type: 'varchar', length: 64, nullable: true })
  scopeKey!: string | null;

  @Column({ type: 'int' })
  rank!: number;

  @Column({ name: 'previous_rank', type: 'int', nullable: true })
  previousRank!: number | null;

  @Column({ name: 'total_points', type: 'int', default: 0 })
  totalPoints!: number;

  @Column({ name: 'matchday_points', type: 'int', default: 0 })
  matchdayPoints!: number;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  meta!: Record<string, unknown>;

  @ManyToOne(() => FantasyTeamEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_team_id' })
  fantasyTeam!: FantasyTeamEntity;

  @ManyToOne(() => LeagueEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'league_id' })
  league!: LeagueEntity | null;

  @ManyToOne(() => MatchdayEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'matchday_id' })
  matchday!: MatchdayEntity | null;
}
