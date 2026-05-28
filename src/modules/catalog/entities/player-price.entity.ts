import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { PlayerEntity } from './player.entity';

@Entity('player_prices')
export class PlayerPriceEntity extends AppBaseEntity {
  @Column({ type: 'decimal', precision: 6, scale: 2 })
  price!: string;

  @Column({ name: 'effective_at', type: 'timestamptz' })
  effectiveAt!: Date;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reason!: string | null;

  @ManyToOne(() => PlayerEntity, (player) => player.priceHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;
}
