import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayerPositionToFantasyPicks1780480676000 implements MigrationInterface {
  name = 'AddPlayerPositionToFantasyPicks1780480676000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add player_position column as nullable first
    await queryRunner.query(`
      ALTER TABLE "fantasy_picks"
      ADD COLUMN IF NOT EXISTS "player_position" character varying
    `);

    // Populate player_position from the players table (including soft-deleted)
    await queryRunner.query(`
      UPDATE "fantasy_picks" fp
      SET "player_position" = p.position
      FROM "players" p
      WHERE fp.player_id = p.id
      AND fp.player_position IS NULL
    `);

    // Create index for player_position
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fantasy_picks_player_position" ON "fantasy_picks" ("player_position")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fantasy_picks_player_position"`);
    await queryRunner.query(`ALTER TABLE "fantasy_picks" DROP COLUMN IF EXISTS "player_position"`);
  }
}
