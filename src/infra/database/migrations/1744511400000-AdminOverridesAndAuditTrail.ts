import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminOverridesAndAuditTrail1744511400000 implements MigrationInterface {
  name = 'AdminOverridesAndAuditTrail1744511400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "action_type" character varying(80) NOT NULL,
        "target_type" character varying(80) NOT NULL,
        "target_id" character varying(128) NOT NULL,
        "reason" character varying(255) NOT NULL,
        "before_state" jsonb,
        "after_state" jsonb,
        "actor_user_id" uuid,
        CONSTRAINT "PK_admin_audit_logs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_admin_audit_logs_actor_user_id" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "manual_scoring_adjustments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "event_type" character varying(80) NOT NULL,
        "minute" integer NOT NULL,
        "points" integer NOT NULL,
        "reason" character varying(255) NOT NULL,
        "details" jsonb NOT NULL DEFAULT '{}',
        "fixture_id" uuid NOT NULL,
        "player_id" uuid NOT NULL,
        "created_by_user_id" uuid,
        CONSTRAINT "PK_manual_scoring_adjustments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_manual_scoring_adjustments_fixture_id" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_manual_scoring_adjustments_player_id" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_manual_scoring_adjustments_created_by_user_id" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fixture_corrections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "reason" character varying(255) NOT NULL,
        "home_score" integer,
        "away_score" integer,
        "current_minute" integer,
        "status" "fixtures_status_enum",
        "notes" text,
        "fixture_id" uuid NOT NULL,
        "created_by_user_id" uuid,
        CONSTRAINT "PK_fixture_corrections_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fixture_corrections_fixture_id" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_fixture_corrections_created_by_user_id" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "fixture_corrections" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "manual_scoring_adjustments" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_audit_logs" CASCADE`);
  }
}
