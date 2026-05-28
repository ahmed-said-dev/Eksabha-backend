import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaguesAndCupsParityExpansion1745100000000 implements MigrationInterface {
  name = 'LeaguesAndCupsParityExpansion1745100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "leagues_scoring_mode_enum" AS ENUM ('classic', 'head_to_head');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "leagues_status_enum" AS ENUM ('open', 'locked', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "leagues_category_enum" AS ENUM ('general', 'app', 'gameweek', 'monthly', 'custom');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "league_memberships_status_enum" AS ENUM ('active', 'pending', 'eliminated', 'left');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "league_memberships_join_source_enum" AS ENUM ('owner_create', 'private_code', 'public_auto', 'system_seed', 'admin');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "league_pending_entries_status_enum" AS ENUM ('pending', 'activated', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "league_head_to_head_fixtures_status_enum" AS ENUM ('upcoming', 'live', 'finalized', 'bye');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "cups_type_enum" AS ENUM ('general', 'league');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "cups_status_enum" AS ENUM ('upcoming', 'live', 'completed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "cup_entries_status_enum" AS ENUM ('active', 'eliminated', 'winner');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "cup_rounds_status_enum" AS ENUM ('upcoming', 'live', 'completed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "cup_fixtures_status_enum" AS ENUM ('upcoming', 'live', 'finalized');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "scoring_mode" "leagues_scoring_mode_enum" NOT NULL DEFAULT 'classic'`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "status" "leagues_status_enum" NOT NULL DEFAULT 'open'`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "category" "leagues_category_enum" NOT NULL DEFAULT 'custom'`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "description" character varying(500)`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "badge_label" character varying(60)`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "badge_color" character varying(24)`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "monthly_scope_key" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "starts_from_matchday_number" integer`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "is_join_locked" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "allow_auto_join" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "system_key" character varying(120)`);

    await queryRunner.query(`
      UPDATE "leagues"
      SET
        "status" = CASE WHEN "is_archived" = true THEN 'archived'::"leagues_status_enum" ELSE 'open'::"leagues_status_enum" END,
        "category" = CASE
          WHEN "type" = 'global' THEN 'general'::"leagues_category_enum"
          ELSE 'custom'::"leagues_category_enum"
        END,
        "scoring_mode" = 'classic'::"leagues_scoring_mode_enum"
      WHERE 1 = 1
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "leagues_type_enum" ADD VALUE IF NOT EXISTS 'public';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "leagues_type_enum" ADD VALUE IF NOT EXISTS 'country';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "leagues_type_enum" ADD VALUE IF NOT EXISTS 'system';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "league_memberships" ADD COLUMN IF NOT EXISTS "status" "league_memberships_status_enum" NOT NULL DEFAULT 'active'`);
    await queryRunner.query(`ALTER TABLE "league_memberships" ADD COLUMN IF NOT EXISTS "join_source" "league_memberships_join_source_enum" NOT NULL DEFAULT 'private_code'`);
    await queryRunner.query(`ALTER TABLE "league_memberships" ADD COLUMN IF NOT EXISTS "left_at" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE "league_memberships" ADD COLUMN IF NOT EXISTS "entry_name_snapshot" character varying(120)`);
    await queryRunner.query(`ALTER TABLE "league_memberships" ADD COLUMN IF NOT EXISTS "manager_name_snapshot" character varying(120)`);
    await queryRunner.query(`ALTER TABLE "league_memberships" ADD COLUMN IF NOT EXISTS "seed_number" integer`);
    await queryRunner.query(`ALTER TABLE "league_memberships" ADD COLUMN IF NOT EXISTS "is_pending_new_entry" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "league_memberships" ADD COLUMN IF NOT EXISTS "fantasy_team_id" uuid`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_league_memberships_status" ON "league_memberships" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_league_memberships_fantasy_team_id" ON "league_memberships" ("fantasy_team_id")`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "league_memberships"
        ADD CONSTRAINT "FK_league_memberships_fantasy_team_id"
        FOREIGN KEY ("fantasy_team_id") REFERENCES "fantasy_teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`ALTER TABLE "leaderboard_entries" ADD COLUMN IF NOT EXISTS "scope_type" character varying(40) NOT NULL DEFAULT 'overall'`);
    await queryRunner.query(`ALTER TABLE "leaderboard_entries" ADD COLUMN IF NOT EXISTS "scope_key" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "leaderboard_entries" ADD COLUMN IF NOT EXISTS "meta" jsonb NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_leaderboard_entries_scope_type" ON "leaderboard_entries" ("scope_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_leaderboard_entries_scope_key" ON "leaderboard_entries" ("scope_key")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "league_pending_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "status" "league_pending_entries_status_enum" NOT NULL DEFAULT 'pending',
        "activation_matchday_number" integer NOT NULL,
        "source_scope_key" character varying(64),
        "reason" character varying(255),
        "league_id" uuid NOT NULL,
        "membership_id" uuid NOT NULL,
        "activation_matchday_id" uuid,
        CONSTRAINT "PK_league_pending_entries_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_league_pending_entries_league_id" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_league_pending_entries_membership_id" FOREIGN KEY ("membership_id") REFERENCES "league_memberships"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_league_pending_entries_activation_matchday_id" FOREIGN KEY ("activation_matchday_id") REFERENCES "matchdays"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_league_pending_entries_league_id" ON "league_pending_entries" ("league_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_league_pending_entries_status" ON "league_pending_entries" ("status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "league_head_to_head_fixtures" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "round_number" integer NOT NULL,
        "matchday_number" integer NOT NULL,
        "status" "league_head_to_head_fixtures_status_enum" NOT NULL DEFAULT 'upcoming',
        "home_points" integer,
        "away_points" integer,
        "is_bye" boolean NOT NULL DEFAULT false,
        "notes" character varying(255),
        "league_id" uuid NOT NULL,
        "matchday_id" uuid,
        "home_membership_id" uuid,
        "away_membership_id" uuid,
        "winner_membership_id" uuid,
        CONSTRAINT "PK_league_head_to_head_fixtures_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_league_h2h_fixtures_league_id" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_league_h2h_fixtures_matchday_id" FOREIGN KEY ("matchday_id") REFERENCES "matchdays"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_league_h2h_fixtures_home_membership_id" FOREIGN KEY ("home_membership_id") REFERENCES "league_memberships"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_league_h2h_fixtures_away_membership_id" FOREIGN KEY ("away_membership_id") REFERENCES "league_memberships"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_league_h2h_fixtures_winner_membership_id" FOREIGN KEY ("winner_membership_id") REFERENCES "league_memberships"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_league_h2h_fixtures_league_id" ON "league_head_to_head_fixtures" ("league_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_league_h2h_fixtures_matchday_number" ON "league_head_to_head_fixtures" ("matchday_number")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(140) NOT NULL,
        "slug" character varying(180),
        "type" "cups_type_enum" NOT NULL DEFAULT 'general',
        "status" "cups_status_enum" NOT NULL DEFAULT 'upcoming',
        "description" character varying(500),
        "badge_label" character varying(60),
        "start_matchday_number" integer,
        "entry_cutoff_matchday_number" integer,
        "league_id" uuid,
        "tournament_id" uuid,
        CONSTRAINT "PK_cups_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cups_league_id" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cups_tournament_id" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cups_type" ON "cups" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cups_status" ON "cups" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cups_tournament_id" ON "cups" ("tournament_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cup_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "seed_number" integer,
        "status" "cup_entries_status_enum" NOT NULL DEFAULT 'active',
        "cup_id" uuid NOT NULL,
        "membership_id" uuid NOT NULL,
        CONSTRAINT "PK_cup_entries_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cup_entries_cup_membership" UNIQUE ("cup_id", "membership_id"),
        CONSTRAINT "FK_cup_entries_cup_id" FOREIGN KEY ("cup_id") REFERENCES "cups"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cup_entries_membership_id" FOREIGN KEY ("membership_id") REFERENCES "league_memberships"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cup_entries_cup_id" ON "cup_entries" ("cup_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cup_rounds" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(120) NOT NULL,
        "sequence_number" integer NOT NULL,
        "matchday_number" integer,
        "status" "cup_rounds_status_enum" NOT NULL DEFAULT 'upcoming',
        "cup_id" uuid NOT NULL,
        CONSTRAINT "PK_cup_rounds_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cup_rounds_cup_sequence" UNIQUE ("cup_id", "sequence_number"),
        CONSTRAINT "FK_cup_rounds_cup_id" FOREIGN KEY ("cup_id") REFERENCES "cups"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cup_rounds_cup_id" ON "cup_rounds" ("cup_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cup_fixtures" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "status" "cup_fixtures_status_enum" NOT NULL DEFAULT 'upcoming',
        "home_score" integer,
        "away_score" integer,
        "leg_label" character varying(80),
        "cup_id" uuid NOT NULL,
        "round_id" uuid,
        "home_entry_id" uuid,
        "away_entry_id" uuid,
        "winner_entry_id" uuid,
        CONSTRAINT "PK_cup_fixtures_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cup_fixtures_cup_id" FOREIGN KEY ("cup_id") REFERENCES "cups"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cup_fixtures_round_id" FOREIGN KEY ("round_id") REFERENCES "cup_rounds"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cup_fixtures_home_entry_id" FOREIGN KEY ("home_entry_id") REFERENCES "cup_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cup_fixtures_away_entry_id" FOREIGN KEY ("away_entry_id") REFERENCES "cup_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_cup_fixtures_winner_entry_id" FOREIGN KEY ("winner_entry_id") REFERENCES "cup_entries"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cup_fixtures_cup_id" ON "cup_fixtures" ("cup_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cup_fixtures_round_id" ON "cup_fixtures" ("round_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cup_fixtures_round_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cup_fixtures_cup_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cup_fixtures" CASCADE`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cup_rounds_cup_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cup_rounds" CASCADE`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cup_entries_cup_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cup_entries" CASCADE`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cups_tournament_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cups_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cups_type"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cups" CASCADE`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_league_h2h_fixtures_matchday_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_league_h2h_fixtures_league_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "league_head_to_head_fixtures" CASCADE`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_league_pending_entries_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_league_pending_entries_league_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "league_pending_entries" CASCADE`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_leaderboard_entries_scope_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_leaderboard_entries_scope_type"`);
    await queryRunner.query(`ALTER TABLE "leaderboard_entries" DROP COLUMN IF EXISTS "meta"`);
    await queryRunner.query(`ALTER TABLE "leaderboard_entries" DROP COLUMN IF EXISTS "scope_key"`);
    await queryRunner.query(`ALTER TABLE "leaderboard_entries" DROP COLUMN IF EXISTS "scope_type"`);

    await queryRunner.query(`ALTER TABLE "league_memberships" DROP CONSTRAINT IF EXISTS "FK_league_memberships_fantasy_team_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_league_memberships_fantasy_team_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_league_memberships_status"`);
    await queryRunner.query(`ALTER TABLE "league_memberships" DROP COLUMN IF EXISTS "fantasy_team_id"`);
    await queryRunner.query(`ALTER TABLE "league_memberships" DROP COLUMN IF EXISTS "is_pending_new_entry"`);
    await queryRunner.query(`ALTER TABLE "league_memberships" DROP COLUMN IF EXISTS "seed_number"`);
    await queryRunner.query(`ALTER TABLE "league_memberships" DROP COLUMN IF EXISTS "manager_name_snapshot"`);
    await queryRunner.query(`ALTER TABLE "league_memberships" DROP COLUMN IF EXISTS "entry_name_snapshot"`);
    await queryRunner.query(`ALTER TABLE "league_memberships" DROP COLUMN IF EXISTS "left_at"`);
    await queryRunner.query(`ALTER TABLE "league_memberships" DROP COLUMN IF EXISTS "join_source"`);
    await queryRunner.query(`ALTER TABLE "league_memberships" DROP COLUMN IF EXISTS "status"`);

    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "system_key"`);
    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "allow_auto_join"`);
    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "is_join_locked"`);
    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "starts_from_matchday_number"`);
    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "monthly_scope_key"`);
    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "badge_color"`);
    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "badge_label"`);
    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "description"`);
    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "category"`);
    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`ALTER TABLE "leagues" DROP COLUMN IF EXISTS "scoring_mode"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "cup_fixtures_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cup_rounds_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cup_entries_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cups_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cups_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "league_head_to_head_fixtures_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "league_pending_entries_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "league_memberships_join_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "league_memberships_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "leagues_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "leagues_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "leagues_scoring_mode_enum"`);
  }
}
