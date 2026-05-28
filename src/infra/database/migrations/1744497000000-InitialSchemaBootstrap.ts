import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchemaBootstrap1744497000000 implements MigrationInterface {
  name = 'InitialSchemaBootstrap1744497000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`CREATE TYPE "users_account_type_enum" AS ENUM ('guest', 'registered', 'admin')`);
    await queryRunner.query(`CREATE TYPE "users_status_enum" AS ENUM ('active', 'blocked', 'deleted')`);
    await queryRunner.query(`CREATE TYPE "tournaments_current_phase_enum" AS ENUM ('group_stage_md1', 'group_stage_md2', 'group_stage_md3', 'round_of_32', 'round_of_16', 'quarter_finals', 'semi_finals', 'third_place', 'final')`);
    await queryRunner.query(`CREATE TYPE "tournaments_status_enum" AS ENUM ('pre_tournament', 'squad_build_open', 'matchday_open', 'deadline_locked', 'live_scoring', 'finalized', 'archived')`);
    await queryRunner.query(`CREATE TYPE "matchdays_phase_enum" AS ENUM ('group_stage_md1', 'group_stage_md2', 'group_stage_md3', 'round_of_32', 'round_of_16', 'quarter_finals', 'semi_finals', 'third_place', 'final')`);
    await queryRunner.query(`CREATE TYPE "matchdays_status_enum" AS ENUM ('open', 'locked', 'live', 'finalized')`);
    await queryRunner.query(`CREATE TYPE "players_position_enum" AS ENUM ('GK', 'DEF', 'MID', 'FWD')`);
    await queryRunner.query(`CREATE TYPE "fixtures_phase_enum" AS ENUM ('group_stage_md1', 'group_stage_md2', 'group_stage_md3', 'round_of_32', 'round_of_16', 'quarter_finals', 'semi_finals', 'third_place', 'final')`);
    await queryRunner.query(`CREATE TYPE "fixtures_status_enum" AS ENUM ('scheduled', 'live', 'half_time', 'full_time', 'postponed')`);
    await queryRunner.query(`CREATE TYPE "fantasy_teams_active_chip_type_enum" AS ENUM ('wildcard', 'triple_captain', 'bench_boost', 'free_hit')`);
    await queryRunner.query(`CREATE TYPE "chip_activations_chip_type_enum" AS ENUM ('wildcard', 'triple_captain', 'bench_boost', 'free_hit')`);
    await queryRunner.query(`CREATE TYPE "leagues_type_enum" AS ENUM ('global', 'private')`);
    await queryRunner.query(`CREATE TYPE "league_memberships_role_enum" AS ENUM ('owner', 'admin', 'member')`);
    await queryRunner.query(`CREATE TYPE "raw_feed_payloads_status_enum" AS ENUM ('pending', 'processed', 'failed')`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "email" character varying(255),
        "password_hash" character varying(255),
        "account_type" "users_account_type_enum" NOT NULL DEFAULT 'guest',
        "status" "users_status_enum" NOT NULL DEFAULT 'active',
        "last_login_at" TIMESTAMPTZ,
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_profiles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "display_name" character varying(120) NOT NULL,
        "team_name" character varying(120) NOT NULL,
        "avatar_url" character varying(500),
        "locale" character varying(10) NOT NULL DEFAULT 'en',
        "timezone" character varying(80) NOT NULL DEFAULT 'UTC',
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_user_profiles_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_profiles_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_user_profiles_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "token_hash" character varying(255) NOT NULL,
        "issued_at" TIMESTAMPTZ NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        "device_id" character varying(128),
        "ip" character varying(80),
        "user_agent" character varying(500),
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_refresh_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tournaments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(160) NOT NULL,
        "slug" character varying(80) NOT NULL,
        "year" integer NOT NULL,
        "current_phase" "tournaments_current_phase_enum" NOT NULL DEFAULT 'group_stage_md1',
        "current_matchday_number" integer NOT NULL DEFAULT '1',
        "total_groups" integer NOT NULL DEFAULT '12',
        "total_teams" integer NOT NULL DEFAULT '48',
        "status" "tournaments_status_enum" NOT NULL DEFAULT 'pre_tournament',
        "starts_at" TIMESTAMPTZ,
        "ends_at" TIMESTAMPTZ,
        CONSTRAINT "PK_tournaments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tournaments_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "groups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "code" character varying(8) NOT NULL,
        "label" character varying(40) NOT NULL,
        "display_order" integer NOT NULL DEFAULT '0',
        "tournament_id" uuid NOT NULL,
        CONSTRAINT "PK_groups_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_groups_tournament_code" UNIQUE ("tournament_id", "code"),
        CONSTRAINT "FK_groups_tournament_id" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "matchdays" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "number" integer NOT NULL,
        "phase" "matchdays_phase_enum" NOT NULL,
        "status" "matchdays_status_enum" NOT NULL DEFAULT 'open',
        "opens_at" TIMESTAMPTZ,
        "deadline_at" TIMESTAMPTZ NOT NULL,
        "locks_at" TIMESTAMPTZ,
        "tournament_id" uuid NOT NULL,
        CONSTRAINT "PK_matchdays_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_matchdays_tournament_number" UNIQUE ("tournament_id", "number"),
        CONSTRAINT "FK_matchdays_tournament_id" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "teams" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(120) NOT NULL,
        "short_name" character varying(12) NOT NULL,
        "code" character varying(8) NOT NULL,
        "flag_url" character varying(500),
        "external_provider_id" character varying(128),
        "is_eliminated" boolean NOT NULL DEFAULT false,
        "tournament_id" uuid NOT NULL,
        "group_id" uuid,
        CONSTRAINT "PK_teams_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_teams_tournament_id" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_teams_group_id" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "players" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(140) NOT NULL,
        "short_name" character varying(80) NOT NULL,
        "position" "players_position_enum" NOT NULL,
        "external_provider_id" character varying(128),
        "current_price" numeric(6,2) NOT NULL DEFAULT '0',
        "is_injured" boolean NOT NULL DEFAULT false,
        "is_suspended" boolean NOT NULL DEFAULT false,
        "minutes_played" integer NOT NULL DEFAULT '0',
        "total_points" integer NOT NULL DEFAULT '0',
        "is_active" boolean NOT NULL DEFAULT true,
        "team_id" uuid NOT NULL,
        CONSTRAINT "PK_players_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_players_team_id" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "player_prices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "price" numeric(6,2) NOT NULL,
        "effective_at" TIMESTAMPTZ NOT NULL,
        "reason" character varying(120),
        "player_id" uuid NOT NULL,
        CONSTRAINT "PK_player_prices_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_player_prices_player_id" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fixtures" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "phase" "fixtures_phase_enum" NOT NULL,
        "status" "fixtures_status_enum" NOT NULL DEFAULT 'scheduled',
        "kickoff_at" TIMESTAMPTZ NOT NULL,
        "venue" character varying(160) NOT NULL,
        "home_score" integer,
        "away_score" integer,
        "current_minute" integer,
        "tournament_id" uuid NOT NULL,
        "matchday_id" uuid,
        "group_id" uuid,
        "home_team_id" uuid NOT NULL,
        "away_team_id" uuid NOT NULL,
        CONSTRAINT "PK_fixtures_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fixtures_tournament_id" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_fixtures_matchday_id" FOREIGN KEY ("matchday_id") REFERENCES "matchdays"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_fixtures_group_id" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_fixtures_home_team_id" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_fixtures_away_team_id" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fantasy_teams" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(120) NOT NULL,
        "budget_remaining" numeric(6,2) NOT NULL DEFAULT '100',
        "total_budget" numeric(6,2) NOT NULL DEFAULT '100',
        "free_transfers" integer NOT NULL DEFAULT '1',
        "formation_code" character varying(10) NOT NULL DEFAULT '4-4-2',
        "total_points" integer NOT NULL DEFAULT '0',
        "team_value" numeric(6,2) NOT NULL DEFAULT '0',
        "active_chip_type" "fantasy_teams_active_chip_type_enum",
        "user_id" uuid NOT NULL,
        "tournament_id" uuid NOT NULL,
        CONSTRAINT "PK_fantasy_teams_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fantasy_teams_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_fantasy_teams_tournament_id" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fantasy_picks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "position_order" integer NOT NULL,
        "is_captain" boolean NOT NULL DEFAULT false,
        "is_vice_captain" boolean NOT NULL DEFAULT false,
        "is_benched" boolean NOT NULL DEFAULT false,
        "multiplier" integer NOT NULL DEFAULT '1',
        "buy_price" numeric(6,2) NOT NULL,
        "sell_price" numeric(6,2) NOT NULL,
        "live_points" integer,
        "fantasy_team_id" uuid NOT NULL,
        "player_id" uuid NOT NULL,
        CONSTRAINT "PK_fantasy_picks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fantasy_picks_fantasy_team_id" FOREIGN KEY ("fantasy_team_id") REFERENCES "fantasy_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_fantasy_picks_player_id" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "chip_activations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "chip_type" "chip_activations_chip_type_enum" NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "activated_at" TIMESTAMPTZ NOT NULL,
        "consumed_at" TIMESTAMPTZ,
        "fantasy_team_id" uuid NOT NULL,
        "matchday_id" uuid,
        CONSTRAINT "PK_chip_activations_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chip_activations_fantasy_team_id" FOREIGN KEY ("fantasy_team_id") REFERENCES "fantasy_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_chip_activations_matchday_id" FOREIGN KEY ("matchday_id") REFERENCES "matchdays"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "leagues" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(140) NOT NULL,
        "slug" character varying(180),
        "type" "leagues_type_enum" NOT NULL DEFAULT 'private',
        "join_code" character varying(24),
        "is_public" boolean NOT NULL DEFAULT false,
        "is_archived" boolean NOT NULL DEFAULT false,
        "max_members" integer NOT NULL DEFAULT '50',
        "owner_user_id" uuid,
        "tournament_id" uuid,
        CONSTRAINT "PK_leagues_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_leagues_join_code" UNIQUE ("join_code"),
        CONSTRAINT "FK_leagues_owner_user_id" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_leagues_tournament_id" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "league_memberships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "role" "league_memberships_role_enum" NOT NULL DEFAULT 'member',
        "joined_at" TIMESTAMPTZ NOT NULL,
        "league_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_league_memberships_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_league_memberships_league_user" UNIQUE ("league_id", "user_id"),
        CONSTRAINT "FK_league_memberships_league_id" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_league_memberships_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "type" character varying(80) NOT NULL,
        "title" character varying(180) NOT NULL,
        "body" text NOT NULL,
        "payload" jsonb,
        "read_at" TIMESTAMPTZ,
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "raw_feed_payloads" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "provider" character varying(80) NOT NULL,
        "entity_type" character varying(80) NOT NULL,
        "event_type" character varying(80),
        "external_entity_id" character varying(128),
        "payload" jsonb NOT NULL,
        "status" "raw_feed_payloads_status_enum" NOT NULL DEFAULT 'pending',
        "processed_at" TIMESTAMPTZ,
        "error_message" text,
        CONSTRAINT "PK_raw_feed_payloads_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "raw_feed_payloads" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "league_memberships" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "leagues" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chip_activations" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fantasy_picks" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fantasy_teams" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fixtures" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "player_prices" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "players" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "teams" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "matchdays" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "groups" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tournaments" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_sessions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_profiles" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);

    await queryRunner.query(`DROP TYPE IF EXISTS "raw_feed_payloads_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "league_memberships_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "leagues_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "chip_activations_chip_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fantasy_teams_active_chip_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fixtures_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fixtures_phase_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "players_position_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "matchdays_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "matchdays_phase_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tournaments_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tournaments_current_phase_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_account_type_enum"`);
  }
}
