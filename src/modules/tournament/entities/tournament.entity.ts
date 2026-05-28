import { Column, Entity, OneToMany } from 'typeorm';

import { AppBaseEntity, TournamentPhase } from '../../../common/database';
import { FantasyTeamEntity } from '../../fantasy/entities/fantasy-team.entity';
import { LeagueEntity } from '../../leagues/entities/league.entity';
import { GroupEntity } from './group.entity';
import { MatchdayEntity } from './matchday.entity';
import { FixtureEntity } from './fixture.entity';

export enum TournamentStatus {
  PRE_TOURNAMENT = 'pre_tournament',
  SQUAD_BUILD_OPEN = 'squad_build_open',
  MATCHDAY_OPEN = 'matchday_open',
  DEADLINE_LOCKED = 'deadline_locked',
  LIVE_SCORING = 'live_scoring',
  FINALIZED = 'finalized',
  ARCHIVED = 'archived',
}

@Entity('tournaments')
export class TournamentEntity extends AppBaseEntity {
  @Column({ name: 'competition_key', type: 'varchar', length: 120, nullable: true })
  competitionKey!: string | null;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 32, default: 'world_cup' })
  format!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 80, unique: true })
  slug!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ name: 'current_phase', type: 'enum', enum: TournamentPhase, default: TournamentPhase.GROUP_STAGE_MD1 })
  currentPhase!: TournamentPhase;

  @Column({ name: 'current_matchday_number', type: 'int', default: 1 })
  currentMatchdayNumber!: number;

  @Column({ name: 'visible_team_matchday_number', type: 'int', nullable: true })
  visibleTeamMatchdayNumber!: number | null;

  @Column({ name: 'visible_live_points_matchday_number', type: 'int', nullable: true })
  visibleLivePointsMatchdayNumber!: number | null;

  @Column({ name: 'total_groups', type: 'int', default: 12 })
  totalGroups!: number;

  @Column({ name: 'total_teams', type: 'int', default: 48 })
  totalTeams!: number;

  @Column({ type: 'enum', enum: TournamentStatus, default: TournamentStatus.PRE_TOURNAMENT })
  status!: TournamentStatus;

  @Column({ name: 'external_league_id', type: 'int', nullable: true })
  externalLeagueId!: number | null;

  @Column({ name: 'external_season', type: 'int', nullable: true })
  externalSeason!: number | null;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt!: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt!: Date | null;

  @OneToMany(() => GroupEntity, (group) => group.tournament)
  groups!: GroupEntity[];

  @OneToMany(() => MatchdayEntity, (matchday) => matchday.tournament)
  matchdays!: MatchdayEntity[];

  @OneToMany(() => FixtureEntity, (fixture) => fixture.tournament)
  fixtures!: FixtureEntity[];

  @OneToMany(() => FantasyTeamEntity, (fantasyTeam) => fantasyTeam.tournament)
  fantasyTeams!: FantasyTeamEntity[];

  @OneToMany(() => LeagueEntity, (league) => league.tournament)
  leagues!: LeagueEntity[];
}
