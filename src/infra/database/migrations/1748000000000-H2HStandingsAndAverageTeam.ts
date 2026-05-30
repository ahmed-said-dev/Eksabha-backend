import { MigrationInterface, QueryRunner } from 'typeorm';

export class H2HStandingsAndAverageTeam1748000000000 implements MigrationInterface {
  name = 'H2HStandingsAndAverageTeam1748000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add is_average column to league_head_to_head_fixtures
    await queryRunner.query(`
      ALTER TABLE "league_head_to_head_fixtures"
      ADD COLUMN IF NOT EXISTS "is_average" boolean NOT NULL DEFAULT false
    `);

    // Create league_head_to_head_standings table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "league_head_to_head_standings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "matches_played" integer NOT NULL DEFAULT 0,
        "wins" integer NOT NULL DEFAULT 0,
        "draws" integer NOT NULL DEFAULT 0,
        "losses" integer NOT NULL DEFAULT 0,
        "points_for" integer NOT NULL DEFAULT 0,
        "points_against" integer NOT NULL DEFAULT 0,
        "league_points" integer NOT NULL DEFAULT 0,
        "rank" integer,
        "is_average" boolean NOT NULL DEFAULT false,
        "league_id" uuid NOT NULL,
        "membership_id" uuid,
        CONSTRAINT "PK_league_head_to_head_standings_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_h2h_standings_league_id" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_h2h_standings_membership_id" FOREIGN KEY ("membership_id") REFERENCES "league_memberships"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_h2h_standings_league_id" ON "league_head_to_head_standings" ("league_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_h2h_standings_membership_id" ON "league_head_to_head_standings" ("membership_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_h2h_standings_league_points" ON "league_head_to_head_standings" ("league_points")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_h2h_fixtures_is_average" ON "league_head_to_head_fixtures" ("is_average")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_h2h_fixtures_is_average"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_h2h_standings_league_points"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_h2h_standings_membership_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_h2h_standings_league_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "league_head_to_head_standings"`);
    await queryRunner.query(`ALTER TABLE "league_head_to_head_fixtures" DROP COLUMN IF EXISTS "is_average"`);
  }
}
