import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserProfilePlayerCollections1746600000000 implements MigrationInterface {
  name = 'UserProfilePlayerCollections1746600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "watchlist_player_ids" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "favorite_player_ids" jsonb NOT NULL DEFAULT '[]'::jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "favorite_player_ids"`);
    await queryRunner.query(`ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "watchlist_player_ids"`);
  }
}