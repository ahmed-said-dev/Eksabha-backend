import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AppBaseEntity, ChipType } from '../../../common/database';
import { TournamentEntity } from '../../tournament/entities/tournament.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { ChipActivationEntity } from './chip-activation.entity';
import { FantasyPickEntity } from './fantasy-pick.entity';

@Entity('fantasy_teams')
export class FantasyTeamEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'budget_remaining', type: 'decimal', precision: 6, scale: 2, default: 100 })
  budgetRemaining!: string;

  @Column({ name: 'total_budget', type: 'decimal', precision: 6, scale: 2, default: 100 })
  totalBudget!: string;

  @Column({ name: 'free_transfers', type: 'int', default: 1 })
  freeTransfers!: number;

  @Column({ name: 'formation_code', type: 'varchar', length: 10, default: '4-4-2' })
  formationCode!: string;

  @Column({ name: 'total_points', type: 'int', default: 0 })
  totalPoints!: number;

  @Column({ name: 'team_value', type: 'decimal', precision: 6, scale: 2, default: 0 })
  teamValue!: string;

  @Column({ name: 'active_chip_type', type: 'enum', enum: ChipType, nullable: true })
  activeChipType!: ChipType | null;

  @ManyToOne(() => UserEntity, (user) => user.fantasyTeams, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => TournamentEntity, (tournament) => tournament.fantasyTeams, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournament_id' })
  tournament!: TournamentEntity;

  @OneToMany(() => FantasyPickEntity, (pick) => pick.fantasyTeam)
  picks!: FantasyPickEntity[];

  @OneToMany(() => ChipActivationEntity, (chipActivation) => chipActivation.fantasyTeam)
  chipActivations!: ChipActivationEntity[];
}
