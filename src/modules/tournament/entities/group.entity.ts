import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { TeamEntity } from '../../catalog/entities/team.entity';
import { FixtureEntity } from './fixture.entity';
import { TournamentEntity } from './tournament.entity';

@Entity('groups')
export class GroupEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 8 })
  code!: string;

  @Column({ type: 'varchar', length: 40 })
  label!: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder!: number;

  @ManyToOne(() => TournamentEntity, (tournament) => tournament.groups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournament_id' })
  tournament!: TournamentEntity;

  @OneToMany(() => TeamEntity, (team) => team.group)
  teams!: TeamEntity[];

  @OneToMany(() => FixtureEntity, (fixture) => fixture.group)
  fixtures!: FixtureEntity[];
}
