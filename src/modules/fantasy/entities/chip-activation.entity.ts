import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity, ChipType } from '../../../common/database';
import { MatchdayEntity } from '../../tournament/entities/matchday.entity';
import { FantasyTeamEntity } from './fantasy-team.entity';

@Entity('chip_activations')
export class ChipActivationEntity extends AppBaseEntity {
  @Column({ name: 'chip_type', type: 'enum', enum: ChipType })
  chipType!: ChipType;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'activated_at', type: 'timestamptz' })
  activatedAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @ManyToOne(() => FantasyTeamEntity, (fantasyTeam) => fantasyTeam.chipActivations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_team_id' })
  fantasyTeam!: FantasyTeamEntity;

  @ManyToOne(() => MatchdayEntity, (matchday) => matchday.chipActivations, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'matchday_id' })
  matchday!: MatchdayEntity | null;
}
