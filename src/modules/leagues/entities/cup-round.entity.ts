import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { CupEntity } from './cup.entity';
import { CupFixtureEntity } from './cup-fixture.entity';

export enum CupRoundStatus {
  UPCOMING = 'upcoming',
  LIVE = 'live',
  COMPLETED = 'completed',
}

@Entity('cup_rounds')
export class CupRoundEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'sequence_number', type: 'int' })
  sequenceNumber!: number;

  @Column({ name: 'matchday_number', type: 'int', nullable: true })
  matchdayNumber!: number | null;

  @Column({ type: 'enum', enum: CupRoundStatus, default: CupRoundStatus.UPCOMING })
  status!: CupRoundStatus;

  @ManyToOne(() => CupEntity, (cup) => cup.rounds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cup_id' })
  cup!: CupEntity;

  @OneToMany(() => CupFixtureEntity, (fixture) => fixture.round)
  fixtures!: CupFixtureEntity[];
}
