import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AppBaseEntity, PlayerPosition } from '../../../common/database';
import { FantasyPickEntity } from '../../fantasy/entities/fantasy-pick.entity';
import { TeamEntity } from './team.entity';
import { PlayerPriceEntity } from './player-price.entity';

@Entity('players')
export class PlayerEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 140 })
  name!: string;

  @Column({ name: 'short_name', type: 'varchar', length: 80 })
  shortName!: string;

  @Column({ type: 'enum', enum: PlayerPosition })
  position!: PlayerPosition;

  @Column({ name: 'external_provider_id', type: 'varchar', length: 128, nullable: true })
  externalProviderId!: string | null;

  @Column({ name: 'current_price', type: 'decimal', precision: 6, scale: 2, default: 0 })
  currentPrice!: string;

  @Column({ name: 'is_injured', type: 'boolean', default: false })
  isInjured!: boolean;

  @Column({ name: 'is_suspended', type: 'boolean', default: false })
  isSuspended!: boolean;

  @Column({ name: 'minutes_played', type: 'int', default: 0 })
  minutesPlayed!: number;

  @Column({ name: 'total_points', type: 'int', default: 0 })
  totalPoints!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ManyToOne(() => TeamEntity, (team) => team.players, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'team_id' })
  team!: TeamEntity;

  @OneToMany(() => PlayerPriceEntity, (playerPrice) => playerPrice.player)
  priceHistory!: PlayerPriceEntity[];

  @OneToMany(() => FantasyPickEntity, (pick) => pick.player)
  fantasyPicks!: FantasyPickEntity[];
}
