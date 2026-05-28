import { MigrationInterface, QueryRunner } from 'typeorm';

export class TournamentExternalProviderColumns1744529400000 implements MigrationInterface {
  name = 'TournamentExternalProviderColumns1744529400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "external_league_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "external_season" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "external_season"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "external_league_id"`,
    );
  }
}
