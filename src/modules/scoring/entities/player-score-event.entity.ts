import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { PlayerEntity } from '../../catalog/entities/player.entity';
import { FixtureEntity } from '../../tournament/entities/fixture.entity';
import { PlayerScoreLogEntity } from './player-score-log.entity';

@Entity('player_score_events')
export class PlayerScoreEventEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 80 })
  type!: string;

  @Column({ type: 'int' })
  points!: number;

  @Column({ type: 'int' })
  minute!: number;

  @Column({ name: 'details', type: 'jsonb', default: () => "'{}'" })
  details!: Record<string, unknown>;

  @ManyToOne(() => PlayerScoreLogEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_score_log_id' })
  playerScoreLog!: PlayerScoreLogEntity;

  @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player!: PlayerEntity;

  @ManyToOne(() => FixtureEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fixture_id' })
  fixture!: FixtureEntity;
}
