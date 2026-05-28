import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { PlayerEntity } from '../../catalog/entities/player.entity';
import { FixtureEntity } from '../../tournament/entities/fixture.entity';

@Entity('player_score_logs')
export class PlayerScoreLogEntity extends AppBaseEntity {
  @Column({ name: 'total_points', type: 'int', default: 0 })
  totalPoints!: number;

  @Column({ name: 'bonus_points', type: 'int', default: 0 })
  bonusPoints!: number;

  @Column({ name: 'event_summary', type: 'jsonb', default: () => "'[]'" })
  eventSummary!: Array<{
    type: string;
    minute: number;
    points: number;
  }>;

  @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;

  @ManyToOne(() => FixtureEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixture_id' })
  fixture!: FixtureEntity;
}
