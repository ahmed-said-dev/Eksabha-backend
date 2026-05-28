import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AppBaseEntity, ChipType } from '../../../common/database';
import { MatchdayEntity } from '../../tournament/entities/matchday.entity';
import { FantasyPickSnapshotEntity } from './fantasy-pick-snapshot.entity';
import { FantasyTeamEntity } from './fantasy-team.entity';

@Entity('fantasy_team_snapshots')
export class FantasyTeamSnapshotEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'formation_code', type: 'varchar', length: 10 })
  formationCode!: string;

  @Column({ name: 'budget_remaining', type: 'decimal', precision: 6, scale: 2 })
  budgetRemaining!: string;

  @Column({ name: 'total_budget', type: 'decimal', precision: 6, scale: 2 })
  totalBudget!: string;

  @Column({ name: 'team_value', type: 'decimal', precision: 6, scale: 2 })
  teamValue!: string;

  @Column({ name: 'free_transfers', type: 'int', default: 0 })
  freeTransfers!: number;

  @Column({ name: 'active_chip_type', type: 'enum', enum: ChipType, nullable: true })
  activeChipType!: ChipType | null;

  @Column({ name: 'captured_at', type: 'timestamptz' })
  capturedAt!: Date;

  @ManyToOne(() => FantasyTeamEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_team_id' })
  fantasyTeam!: FantasyTeamEntity;

  @ManyToOne(() => MatchdayEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'matchday_id' })
  matchday!: MatchdayEntity;

  @OneToMany(() => FantasyPickSnapshotEntity, (pickSnapshot) => pickSnapshot.fantasyTeamSnapshot)
  picks!: FantasyPickSnapshotEntity[];
}
