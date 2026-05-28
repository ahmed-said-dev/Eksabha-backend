import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompetitionMetadataAndRegularSeasonPhase1744525800000 implements MigrationInterface {
  name = 'CompetitionMetadataAndRegularSeasonPhase1744525800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "competition_key" character varying(120)`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "format" character varying(32) NOT NULL DEFAULT 'world_cup'`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "country" character varying(80)`);

    await queryRunner.query(`
      UPDATE "tournaments"
      SET
        "competition_key" = COALESCE("competition_key", "slug"),
        "format" = COALESCE(NULLIF("format", ''), CASE WHEN "total_groups" > 0 THEN 'world_cup' ELSE 'league' END)
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE "tournaments_current_phase_enum" ADD VALUE IF NOT EXISTS 'regular_season';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE "matchdays_phase_enum" ADD VALUE IF NOT EXISTS 'regular_season';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE "fixtures_phase_enum" ADD VALUE IF NOT EXISTS 'regular_season';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "country"`);
    await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "format"`);
    await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "competition_key"`);
  }
}
