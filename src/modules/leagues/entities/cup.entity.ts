import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { TournamentEntity } from '../../tournament/entities/tournament.entity';
import { CupEntryEntity } from './cup-entry.entity';
import { CupFixtureEntity } from './cup-fixture.entity';
import { CupRoundEntity } from './cup-round.entity';
import { LeagueEntity } from './league.entity';

export enum CupType {
  GENERAL = 'general',
  LEAGUE = 'league',
}

export enum CupStatus {
  UPCOMING = 'upcoming',
  LIVE = 'live',
  COMPLETED = 'completed',
}

@Entity('cups')
export class CupEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 140 })
  name!: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  slug!: string | null;

  @Column({ type: 'enum', enum: CupType, default: CupType.GENERAL })
  type!: CupType;

  @Column({ type: 'enum', enum: CupStatus, default: CupStatus.UPCOMING })
  status!: CupStatus;

  @Column({ name: 'description', type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ name: 'badge_label', type: 'varchar', length: 60, nullable: true })
  badgeLabel!: string | null;

  @Column({ name: 'start_matchday_number', type: 'int', nullable: true })
  startMatchdayNumber!: number | null;

  @Column({ name: 'entry_cutoff_matchday_number', type: 'int', nullable: true })
  entryCutoffMatchdayNumber!: number | null;

  @ManyToOne(() => LeagueEntity, (league) => league.cups, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'league_id' })
  league!: LeagueEntity | null;

  @ManyToOne(() => TournamentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tournament_id' })
  tournament!: TournamentEntity | null;

  @OneToMany(() => CupEntryEntity, (entry) => entry.cup)
  entries!: CupEntryEntity[];

  @OneToMany(() => CupRoundEntity, (round) => round.cup)
  rounds!: CupRoundEntity[];

  @OneToMany(() => CupFixtureEntity, (fixture) => fixture.cup)
  fixtures!: CupFixtureEntity[];
}
