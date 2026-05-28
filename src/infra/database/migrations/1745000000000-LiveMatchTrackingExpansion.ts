import { MigrationInterface, QueryRunner } from 'typeorm';

export class LiveMatchTrackingExpansion1745000000000 implements MigrationInterface {
  name = 'LiveMatchTrackingExpansion1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tournament-level API-Football mapping
    await queryRunner.query(`ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "external_league_id" integer`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "external_season" integer`);

    // Fixture-level match statistics (possession, shots, corners, etc.)
    await queryRunner.query(`ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "statistics" jsonb`);

    // Fixture-level lineups
    await queryRunner.query(`ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "lineups" jsonb`);

    // Backfill known league IDs from competition keys
    await queryRunner.query(`
      UPDATE "tournaments"
      SET "external_league_id" = CASE
        WHEN "competition_key" = 'world-cup-2026' OR "slug" = 'world-cup-2026' THEN 1
        WHEN "competition_key" = 'egyptian-premier-league-current' OR "slug" LIKE '%egypt%' THEN 233
        ELSE NULL
      END,
      "external_season" = COALESCE("year", 2026)
      WHERE "external_league_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fixtures" DROP COLUMN IF EXISTS "lineups"`);
    await queryRunner.query(`ALTER TABLE "fixtures" DROP COLUMN IF EXISTS "statistics"`);
    await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "external_season"`);
    await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "external_league_id"`);
  }
}
