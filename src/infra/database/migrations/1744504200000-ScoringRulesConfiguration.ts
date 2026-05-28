import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScoringRulesConfiguration1744504200000 implements MigrationInterface {
  name = 'ScoringRulesConfiguration1744504200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "scoring_rule_sets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(120) NOT NULL,
        "code" character varying(80) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT false,
        "version" integer NOT NULL DEFAULT '1',
        CONSTRAINT "PK_scoring_rule_sets_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_scoring_rule_sets_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "scoring_rules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "event_type" character varying(80) NOT NULL,
        "position" "players_position_enum" NOT NULL,
        "points" integer NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "description" character varying(255),
        "rule_set_id" uuid NOT NULL,
        CONSTRAINT "PK_scoring_rules_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_scoring_rules_rule_set_event_position" UNIQUE ("rule_set_id", "event_type", "position"),
        CONSTRAINT "FK_scoring_rules_rule_set_id" FOREIGN KEY ("rule_set_id") REFERENCES "scoring_rule_sets"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "scoring_rules" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scoring_rule_sets" CASCADE`);
  }
}
