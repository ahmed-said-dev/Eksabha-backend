import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { PlayerEntity } from '../../catalog/entities/player.entity';
import { FantasyTeamSnapshotEntity } from './fantasy-team-snapshot.entity';

@Entity('fantasy_pick_snapshots')
export class FantasyPickSnapshotEntity extends AppBaseEntity {
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

  @ManyToOne(() => FantasyTeamSnapshotEntity, (snapshot) => snapshot.picks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fantasy_team_snapshot_id' })
  fantasyTeamSnapshot!: FantasyTeamSnapshotEntity;

  @ManyToOne(() => PlayerEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;
}
