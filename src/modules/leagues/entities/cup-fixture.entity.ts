import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { CupEntity } from './cup.entity';
import { CupEntryEntity } from './cup-entry.entity';
import { CupRoundEntity } from './cup-round.entity';

export enum CupFixtureStatus {
  UPCOMING = 'upcoming',
  LIVE = 'live',
  FINALIZED = 'finalized',
}

@Entity('cup_fixtures')
export class CupFixtureEntity extends AppBaseEntity {
  @Column({ type: 'enum', enum: CupFixtureStatus, default: CupFixtureStatus.UPCOMING })
  status!: CupFixtureStatus;

  @Column({ name: 'home_score', type: 'int', nullable: true })
  homeScore!: number | null;

  @Column({ name: 'away_score', type: 'int', nullable: true })
  awayScore!: number | null;

  @Column({ name: 'leg_label', type: 'varchar', length: 80, nullable: true })
  legLabel!: string | null;

  @ManyToOne(() => CupEntity, (cup) => cup.fixtures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cup_id' })
  cup!: CupEntity;

  @ManyToOne(() => CupRoundEntity, (round) => round.fixtures, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'round_id' })
  round!: CupRoundEntity | null;

  @ManyToOne(() => CupEntryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'home_entry_id' })
  homeEntry!: CupEntryEntity | null;

  @ManyToOne(() => CupEntryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'away_entry_id' })
  awayEntry!: CupEntryEntity | null;

  @ManyToOne(() => CupEntryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'winner_entry_id' })
  winnerEntry!: CupEntryEntity | null;
}
