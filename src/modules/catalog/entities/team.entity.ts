import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { FixtureEntity } from '../../tournament/entities/fixture.entity';
import { GroupEntity } from '../../tournament/entities/group.entity';
import { TournamentEntity } from '../../tournament/entities/tournament.entity';
import { PlayerEntity } from './player.entity';

@Entity('teams')
export class TeamEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'short_name', type: 'varchar', length: 12 })
  shortName!: string;

  @Column({ type: 'varchar', length: 8 })
  code!: string;

  @Column({ name: 'flag_url', type: 'varchar', length: 500, nullable: true })
  flagUrl!: string | null;

  @Column({ name: 'external_provider_id', type: 'varchar', length: 128, nullable: true })
  externalProviderId!: string | null;

  @Column({ name: 'is_eliminated', type: 'boolean', default: false })
  isEliminated!: boolean;

  @ManyToOne(() => TournamentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournament_id' })
  tournament!: TournamentEntity;

  @ManyToOne(() => GroupEntity, (group) => group.teams, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'group_id' })
  group!: GroupEntity | null;

  @OneToMany(() => PlayerEntity, (player) => player.team)
  players!: PlayerEntity[];

  @OneToMany(() => FixtureEntity, (fixture) => fixture.homeTeam)
  homeFixtures!: FixtureEntity[];

  @OneToMany(() => FixtureEntity, (fixture) => fixture.awayTeam)
  awayFixtures!: FixtureEntity[];
}
