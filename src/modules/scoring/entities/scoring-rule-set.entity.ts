import { Column, Entity, OneToMany } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { ScoringRuleEntity } from './scoring-rule.entity';

@Entity('scoring_rule_sets')
export class ScoringRuleSetEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @OneToMany(() => ScoringRuleEntity, (rule) => rule.ruleSet)
  rules!: ScoringRuleEntity[];
}
