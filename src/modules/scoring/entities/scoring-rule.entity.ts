import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity, PlayerPosition } from '../../../common/database';
import { ScoringRuleSetEntity } from './scoring-rule-set.entity';

@Entity('scoring_rules')
export class ScoringRuleEntity extends AppBaseEntity {
  @Column({ name: 'event_type', type: 'varchar', length: 80 })
  eventType!: string;

  @Column({ type: 'enum', enum: PlayerPosition })
  position!: PlayerPosition;

  @Column({ type: 'int' })
  points!: number;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @ManyToOne(() => ScoringRuleSetEntity, (ruleSet) => ruleSet.rules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_set_id' })
  ruleSet!: ScoringRuleSetEntity;
}
