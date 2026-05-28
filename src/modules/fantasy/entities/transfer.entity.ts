import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { PlayerEntity } from '../../catalog/entities/player.entity';
import { MatchdayEntity } from '../../tournament/entities/matchday.entity';
import { FantasyTeamEntity } from './fantasy-team.entity';

@Entity('transfers')
export class TransferEntity extends AppBaseEntity {
  @Column({ name: 'cost_hit', type: 'int', default: 0 })
  costHit!: number;

  @Column({ name: 'transferred_at', type: 'timestamptz' })
  transferredAt!: Date;

  @ManyToOne(() => FantasyTeamEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_team_id' })
  fantasyTeam!: FantasyTeamEntity;

  @ManyToOne(() => PlayerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'player_out_id' })
  playerOut!: PlayerEntity;

  @ManyToOne(() => PlayerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'player_in_id' })
  playerIn!: PlayerEntity;

  @ManyToOne(() => MatchdayEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'matchday_id' })
  matchday!: MatchdayEntity | null;
}
