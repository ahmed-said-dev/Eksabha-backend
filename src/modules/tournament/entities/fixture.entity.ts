import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity, FixtureStatus, TournamentPhase } from '../../../common/database';
import { TeamEntity } from '../../catalog/entities/team.entity';
import { GroupEntity } from './group.entity';
import { MatchdayEntity } from './matchday.entity';
import { TournamentEntity } from './tournament.entity';

@Entity('fixtures')
export class FixtureEntity extends AppBaseEntity {
  @Column({ type: 'enum', enum: TournamentPhase })
  phase!: TournamentPhase;

  @Column({ type: 'enum', enum: FixtureStatus, default: FixtureStatus.SCHEDULED })
  status!: FixtureStatus;

  @Column({ name: 'kickoff_at', type: 'timestamptz' })
  kickoffAt!: Date;

  @Column({ type: 'varchar', length: 160 })
  venue!: string;

  @Column({ name: 'home_score', type: 'int', nullable: true })
  homeScore!: number | null;

  @Column({ name: 'away_score', type: 'int', nullable: true })
  awayScore!: number | null;

  @Column({ name: 'current_minute', type: 'int', nullable: true })
  currentMinute!: number | null;

  @Column({ name: 'external_provider_id', type: 'varchar', length: 128, nullable: true })
  externalProviderId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  statistics!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  lineups!: Record<string, unknown> | null;

  @ManyToOne(() => TournamentEntity, (tournament) => tournament.fixtures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournament_id' })
  tournament!: TournamentEntity;

  @ManyToOne(() => MatchdayEntity, (matchday) => matchday.fixtures, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'matchday_id' })
  matchday!: MatchdayEntity | null;

  @ManyToOne(() => GroupEntity, (group) => group.fixtures, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'group_id' })
  group!: GroupEntity | null;

  @ManyToOne(() => TeamEntity, (team) => team.homeFixtures, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'home_team_id' })
  homeTeam!: TeamEntity;

  @ManyToOne(() => TeamEntity, (team) => team.awayFixtures, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'away_team_id' })
  awayTeam!: TeamEntity;
}
