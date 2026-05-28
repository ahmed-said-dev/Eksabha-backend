import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeadlineSnapshotsAndLocks1744507800000 implements MigrationInterface {
  name = 'DeadlineSnapshotsAndLocks1744507800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fantasy_team_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "name" character varying(120) NOT NULL,
        "formation_code" character varying(10) NOT NULL,
        "budget_remaining" numeric(6,2) NOT NULL,
        "total_budget" numeric(6,2) NOT NULL,
        "team_value" numeric(6,2) NOT NULL,
        "free_transfers" integer NOT NULL DEFAULT '0',
        "active_chip_type" "fantasy_teams_active_chip_type_enum",
        "captured_at" TIMESTAMPTZ NOT NULL,
        "fantasy_team_id" uuid NOT NULL,
        "matchday_id" uuid NOT NULL,
        CONSTRAINT "PK_fantasy_team_snapshots_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fantasy_team_snapshots_team_matchday" UNIQUE ("fantasy_team_id", "matchday_id"),
        CONSTRAINT "FK_fantasy_team_snapshots_fantasy_team_id" FOREIGN KEY ("fantasy_team_id") REFERENCES "fantasy_teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_fantasy_team_snapshots_matchday_id" FOREIGN KEY ("matchday_id") REFERENCES "matchdays"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "fantasy_pick_snapshots" (
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
        "fantasy_team_snapshot_id" uuid NOT NULL,
        "player_id" uuid NOT NULL,
        CONSTRAINT "PK_fantasy_pick_snapshots_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fantasy_pick_snapshots_snapshot_id" FOREIGN KEY ("fantasy_team_snapshot_id") REFERENCES "fantasy_team_snapshots"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_fantasy_pick_snapshots_player_id" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "matchday_locks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        "locked_at" TIMESTAMPTZ NOT NULL,
        "unlocked_at" TIMESTAMPTZ,
        "is_active" boolean NOT NULL DEFAULT true,
        "reason" character varying(255),
        "matchday_id" uuid NOT NULL,
        "locked_by_user_id" uuid,
        CONSTRAINT "PK_matchday_locks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_matchday_locks_matchday_id" FOREIGN KEY ("matchday_id") REFERENCES "matchdays"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_matchday_locks_locked_by_user_id" FOREIGN KEY ("locked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "matchday_locks" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fantasy_pick_snapshots" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fantasy_team_snapshots" CASCADE`);
  }
}
