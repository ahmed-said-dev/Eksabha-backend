import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { PlayerEntity } from '../../catalog/entities/player.entity';
import { FantasyTeamEntity } from './fantasy-team.entity';

@Entity('fantasy_picks')
export class FantasyPickEntity extends AppBaseEntity {
  @Column({ name: 'position_order', type: 'int' })
  positionOrder!: number;

  @Column({ name: 'is_captain', type: 'boolean', default: false })
  isCaptain!: boolean;

  @Column({ name: 'is_vice_captain', type: 'boolean', default: false })
  isViceCaptain!: boolean;

  @Column({ name: 'is_benched', type: 'boolean', default: false })
  isBenched!: boolean;

  @Column({ type: 'int', default: 1 })
  multiplier!: number;

  @Column({ name: 'buy_price', type: 'decimal', precision: 6, scale: 2 })
  buyPrice!: string;

  @Column({ name: 'sell_price', type: 'decimal', precision: 6, scale: 2 })
  sellPrice!: string;

  @Column({ name: 'live_points', type: 'int', nullable: true })
  livePoints!: number | null;

  @ManyToOne(() => FantasyTeamEntity, (fantasyTeam) => fantasyTeam.picks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_team_id' })
  fantasyTeam!: FantasyTeamEntity;

  @Column({ name: 'player_id', type: 'uuid' })
  playerId!: string;

  @ManyToOne(() => PlayerEntity, (player) => player.fantasyPicks, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;
}
