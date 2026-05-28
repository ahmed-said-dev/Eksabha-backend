import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScoringAndLeaderboardExpansion1744500600000 implements MigrationInterface {
  name = 'ScoringAndLeaderboardExpansion1744500600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "fixture_scoring_runs_status_enum" AS ENUM ('pending', 'processing', 'completed', 'failed')`);

    await queryRunner.query(`
      CREATE TABLE "transfers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "cost_hit" integer NOT NULL DEFAULT '0',
        "transferred_at" TIMESTAMPTZ NOT NULL,
        "fantasy_team_id" uuid NOT NULL,
        "player_out_id" uuid NOT NULL,
        "player_in_id" uuid NOT NULL,
        "matchday_id" uuid,
        CONSTRAINT "PK_transfers_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transfers_fantasy_team_id" FOREIGN KEY ("fantasy_team_id") REFERENCES "fantasy_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_transfers_player_out_id" FOREIGN KEY ("player_out_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_transfers_player_in_id" FOREIGN KEY ("player_in_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_transfers_matchday_id" FOREIGN KEY ("matchday_id") REFERENCES "matchdays"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "player_score_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "total_points" integer NOT NULL DEFAULT '0',
        "bonus_points" integer NOT NULL DEFAULT '0',
        "event_summary" jsonb NOT NULL DEFAULT '[]',
        "player_id" uuid NOT NULL,
        "fixture_id" uuid NOT NULL,
        CONSTRAINT "PK_player_score_logs_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_player_score_logs_player_fixture" UNIQUE ("player_id", "fixture_id"),
        CONSTRAINT "FK_player_score_logs_player_id" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_player_score_logs_fixture_id" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "player_score_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "type" character varying(80) NOT NULL,
        "points" integer NOT NULL,
        "minute" integer NOT NULL,
        "details" jsonb NOT NULL DEFAULT '{}',
        "player_score_log_id" uuid NOT NULL,
        "player_id" uuid NOT NULL,
        "fixture_id" uuid NOT NULL,
        CONSTRAINT "PK_player_score_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_player_score_events_player_score_log_id" FOREIGN KEY ("player_score_log_id") REFERENCES "player_score_logs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_player_score_events_player_id" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_player_score_events_fixture_id" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fixture_scoring_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "status" "fixture_scoring_runs_status_enum" NOT NULL DEFAULT 'pending',
        "started_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "error_message" text,
        "fixture_id" uuid NOT NULL,
        CONSTRAINT "PK_fixture_scoring_runs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fixture_scoring_runs_fixture_id" FOREIGN KEY ("fixture_id") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "leaderboard_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "scope" character varying(20) NOT NULL DEFAULT 'global',
        "rank" integer NOT NULL,
        "previous_rank" integer,
        "total_points" integer NOT NULL DEFAULT '0',
        "matchday_points" integer NOT NULL DEFAULT '0',
        "fantasy_team_id" uuid NOT NULL,
        "league_id" uuid,
        "matchday_id" uuid,
        CONSTRAINT "PK_leaderboard_entries_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_leaderboard_entries_fantasy_team_id" FOREIGN KEY ("fantasy_team_id") REFERENCES "fantasy_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_leaderboard_entries_league_id" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_leaderboard_entries_matchday_id" FOREIGN KEY ("matchday_id") REFERENCES "matchdays"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "leaderboard_entries" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fixture_scoring_runs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "player_score_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "player_score_logs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transfers" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fixture_scoring_runs_status_enum"`);
  }
}
