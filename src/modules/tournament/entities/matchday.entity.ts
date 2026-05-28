import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AppBaseEntity, TournamentPhase } from '../../../common/database';
import { ChipActivationEntity } from '../../fantasy/entities/chip-activation.entity';
import { FixtureEntity } from './fixture.entity';
import { TournamentEntity } from './tournament.entity';

export enum MatchdayStatus {
  OPEN = 'open',
  LOCKED = 'locked',
  LIVE = 'live',
  FINALIZED = 'finalized',
}

@Entity('matchdays')
export class MatchdayEntity extends AppBaseEntity {
  @Column({ type: 'int' })
  number!: number;

  @Column({ type: 'enum', enum: TournamentPhase })
  phase!: TournamentPhase;

  @Column({ type: 'enum', enum: MatchdayStatus, default: MatchdayStatus.OPEN })
  status!: MatchdayStatus;

  @Column({ name: 'opens_at', type: 'timestamptz', nullable: true })
  opensAt!: Date | null;

  @Column({ name: 'deadline_at', type: 'timestamptz' })
  deadlineAt!: Date;

  @Column({ name: 'locks_at', type: 'timestamptz', nullable: true })
  locksAt!: Date | null;

  @ManyToOne(() => TournamentEntity, (tournament) => tournament.matchdays, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournament_id' })
  tournament!: TournamentEntity;

  @OneToMany(() => FixtureEntity, (fixture) => fixture.matchday)
  fixtures!: FixtureEntity[];

  @OneToMany(() => ChipActivationEntity, (chipActivation) => chipActivation.matchday)
  chipActivations!: ChipActivationEntity[];
}
