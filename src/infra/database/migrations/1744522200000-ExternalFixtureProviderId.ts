import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExternalFixtureProviderId1744522200000 implements MigrationInterface {
  name = 'ExternalFixtureProviderId1744522200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "fixtures" ADD COLUMN IF NOT EXISTS "external_provider_id" character varying(128)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_fixtures_external_provider_id" ON "fixtures" ("external_provider_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fixtures_external_provider_id"`);
    await queryRunner.query(`ALTER TABLE "fixtures" DROP COLUMN IF EXISTS "external_provider_id"`);
  }
}
