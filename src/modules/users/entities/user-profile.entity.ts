import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

import { AppBaseEntity } from '../../../common/database';
import { UserEntity } from './user.entity';

@Entity('user_profiles')
export class UserProfileEntity extends AppBaseEntity {
  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName!: string;

  @Column({ name: 'team_name', type: 'varchar', length: 120 })
  teamName!: string;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  locale!: string;

  @Column({ type: 'varchar', length: 80, default: 'UTC' })
  timezone!: string;

  @Column({ name: 'watchlist_player_ids', type: 'jsonb', default: () => "'[]'" })
  watchlistPlayerIds!: string[];

  @Column({ name: 'favorite_player_ids', type: 'jsonb', default: () => "'[]'" })
  favoritePlayerIds!: string[];

  @OneToOne(() => UserEntity, (user) => user.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;
}
