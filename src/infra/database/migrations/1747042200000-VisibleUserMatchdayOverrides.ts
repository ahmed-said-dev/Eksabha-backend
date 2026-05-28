import { MigrationInterface, QueryRunner } from 'typeorm';

export class VisibleUserMatchdayOverrides1747042200000 implements MigrationInterface {
  name = 'VisibleUserMatchdayOverrides1747042200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tournaments"
      ADD COLUMN IF NOT EXISTS "visible_team_matchday_number" integer,
      ADD COLUMN IF NOT EXISTS "visible_live_points_matchday_number" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tournaments"
      DROP COLUMN IF EXISTS "visible_live_points_matchday_number",
      DROP COLUMN IF EXISTS "visible_team_matchday_number"
    `);
  }
}