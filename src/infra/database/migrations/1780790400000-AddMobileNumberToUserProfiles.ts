import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMobileNumberToUserProfiles1780790400000 implements MigrationInterface {
  name = 'AddMobileNumberToUserProfiles1780790400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_profiles" ADD "mobile_number" character varying(32)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_profiles" DROP COLUMN "mobile_number"`);
  }
}
