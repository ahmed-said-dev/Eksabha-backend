import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds indexes on hot foreign-key / filter columns across the schema.
 *
 * Postgres does NOT create indexes on foreign-key columns automatically, so
 * every query that filters by fixture_id, player_id, tournament_id,
 * matchday_id, user_id, league_id, fantasy_team_id, etc. was running a
 * sequential scan. This migration adds targeted indexes that every hot query
 * path relies on.
 *
 * Uses CREATE INDEX IF NOT EXISTS so it is safe to run multiple times and
 * on environments where some indexes already exist.
 */
export class HotPathIndexes1746700000000 implements MigrationInterface {
  name = 'HotPathIndexes1746700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      // tournaments / competition lookups
      `CREATE INDEX IF NOT EXISTS "IDX_tournaments_competition_key" ON "tournaments" ("competition_key")`,
      `CREATE INDEX IF NOT EXISTS "IDX_tournaments_slug" ON "tournaments" ("slug")`,

      // matchdays
      `CREATE INDEX IF NOT EXISTS "IDX_matchdays_tournament_id" ON "matchdays" ("tournament_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_matchdays_status" ON "matchdays" ("status")`,

      // groups
      `CREATE INDEX IF NOT EXISTS "IDX_groups_tournament_id" ON "groups" ("tournament_id")`,

      // teams
      `CREATE INDEX IF NOT EXISTS "IDX_teams_tournament_id" ON "teams" ("tournament_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_teams_group_id" ON "teams" ("group_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_teams_external_provider_id" ON "teams" ("external_provider_id")`,

      // players
      `CREATE INDEX IF NOT EXISTS "IDX_players_team_id" ON "players" ("team_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_players_external_provider_id" ON "players" ("external_provider_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_players_is_active" ON "players" ("is_active")`,
      `CREATE INDEX IF NOT EXISTS "IDX_players_position" ON "players" ("position")`,

      // player_prices
      `CREATE INDEX IF NOT EXISTS "IDX_player_prices_player_id" ON "player_prices" ("player_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_player_prices_player_id_effective_at" ON "player_prices" ("player_id", "effective_at")`,

      // fixtures
      `CREATE INDEX IF NOT EXISTS "IDX_fixtures_tournament_id" ON "fixtures" ("tournament_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fixtures_matchday_id" ON "fixtures" ("matchday_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fixtures_group_id" ON "fixtures" ("group_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fixtures_home_team_id" ON "fixtures" ("home_team_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fixtures_away_team_id" ON "fixtures" ("away_team_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fixtures_status" ON "fixtures" ("status")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fixtures_kickoff_at" ON "fixtures" ("kickoff_at")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fixtures_tournament_id_kickoff_at" ON "fixtures" ("tournament_id", "kickoff_at")`,

      // player_score_logs
      `CREATE INDEX IF NOT EXISTS "IDX_player_score_logs_fixture_id" ON "player_score_logs" ("fixture_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_player_score_logs_player_id" ON "player_score_logs" ("player_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_player_score_logs_fixture_id_player_id" ON "player_score_logs" ("fixture_id", "player_id")`,

      // player_score_events
      `CREATE INDEX IF NOT EXISTS "IDX_player_score_events_fixture_id" ON "player_score_events" ("fixture_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_player_score_events_player_id" ON "player_score_events" ("player_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_player_score_events_player_score_log_id" ON "player_score_events" ("player_score_log_id")`,

      // fixture_scoring_runs
      `CREATE INDEX IF NOT EXISTS "IDX_fixture_scoring_runs_fixture_id" ON "fixture_scoring_runs" ("fixture_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fixture_scoring_runs_status" ON "fixture_scoring_runs" ("status")`,

      // fantasy_teams
      `CREATE INDEX IF NOT EXISTS "IDX_fantasy_teams_user_id" ON "fantasy_teams" ("user_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fantasy_teams_tournament_id" ON "fantasy_teams" ("tournament_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fantasy_teams_user_tournament" ON "fantasy_teams" ("user_id", "tournament_id")`,

      // fantasy_picks
      `CREATE INDEX IF NOT EXISTS "IDX_fantasy_picks_fantasy_team_id" ON "fantasy_picks" ("fantasy_team_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_fantasy_picks_player_id" ON "fantasy_picks" ("player_id")`,

      // transfers
      `CREATE INDEX IF NOT EXISTS "IDX_transfers_fantasy_team_id" ON "transfers" ("fantasy_team_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_transfers_matchday_id" ON "transfers" ("matchday_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_transfers_player_in_id" ON "transfers" ("player_in_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_transfers_player_out_id" ON "transfers" ("player_out_id")`,

      // chip_activations
      `CREATE INDEX IF NOT EXISTS "IDX_chip_activations_fantasy_team_id" ON "chip_activations" ("fantasy_team_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_chip_activations_matchday_id" ON "chip_activations" ("matchday_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_chip_activations_chip_type" ON "chip_activations" ("chip_type")`,

      // leaderboard_entries
      `CREATE INDEX IF NOT EXISTS "IDX_leaderboard_entries_matchday_id" ON "leaderboard_entries" ("matchday_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_leaderboard_entries_league_id" ON "leaderboard_entries" ("league_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_leaderboard_entries_fantasy_team_id" ON "leaderboard_entries" ("fantasy_team_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_leaderboard_entries_scope" ON "leaderboard_entries" ("scope")`,
      `CREATE INDEX IF NOT EXISTS "IDX_leaderboard_entries_scope_matchday" ON "leaderboard_entries" ("scope", "matchday_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_leaderboard_entries_league_scope" ON "leaderboard_entries" ("league_id", "scope", "scope_type", "scope_key")`,

      // league_memberships
      `CREATE INDEX IF NOT EXISTS "IDX_league_memberships_league_id" ON "league_memberships" ("league_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_league_memberships_user_id" ON "league_memberships" ("user_id")`,

      // notifications
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_user_id" ON "notifications" ("user_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_type" ON "notifications" ("type")`,
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_read_at" ON "notifications" ("read_at")`,
      `CREATE INDEX IF NOT EXISTS "IDX_notifications_created_at" ON "notifications" ("created_at")`,

      // refresh_sessions
      `CREATE INDEX IF NOT EXISTS "IDX_refresh_sessions_user_id" ON "refresh_sessions" ("user_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_refresh_sessions_token_hash" ON "refresh_sessions" ("token_hash")`,
      `CREATE INDEX IF NOT EXISTS "IDX_refresh_sessions_expires_at" ON "refresh_sessions" ("expires_at")`,

      // user_profiles
      `CREATE INDEX IF NOT EXISTS "IDX_user_profiles_user_id" ON "user_profiles" ("user_id")`,

      // admin_audit_logs
      `CREATE INDEX IF NOT EXISTS "IDX_admin_audit_logs_action_type" ON "admin_audit_logs" ("action_type")`,
      `CREATE INDEX IF NOT EXISTS "IDX_admin_audit_logs_created_at" ON "admin_audit_logs" ("created_at")`,
    ];

    for (const statement of statements) {
      try {
        await queryRunner.query(statement);
      } catch (error) {
        // Table may not exist in older deployments (e.g. optional tables); skip with note.
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(`[HotPathIndexes] Skipped: ${statement} — ${message}`);
      }
    }

    await queryRunner.query(`ANALYZE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dropStatements = [
      `DROP INDEX IF EXISTS "IDX_tournaments_competition_key"`,
      `DROP INDEX IF EXISTS "IDX_tournaments_slug"`,
      `DROP INDEX IF EXISTS "IDX_matchdays_tournament_id"`,
      `DROP INDEX IF EXISTS "IDX_matchdays_status"`,
      `DROP INDEX IF EXISTS "IDX_groups_tournament_id"`,
      `DROP INDEX IF EXISTS "IDX_teams_tournament_id"`,
      `DROP INDEX IF EXISTS "IDX_teams_group_id"`,
      `DROP INDEX IF EXISTS "IDX_teams_external_provider_id"`,
      `DROP INDEX IF EXISTS "IDX_players_team_id"`,
      `DROP INDEX IF EXISTS "IDX_players_external_provider_id"`,
      `DROP INDEX IF EXISTS "IDX_players_is_active"`,
      `DROP INDEX IF EXISTS "IDX_players_position"`,
      `DROP INDEX IF EXISTS "IDX_player_prices_player_id"`,
      `DROP INDEX IF EXISTS "IDX_player_prices_player_id_effective_at"`,
      `DROP INDEX IF EXISTS "IDX_fixtures_tournament_id"`,
      `DROP INDEX IF EXISTS "IDX_fixtures_matchday_id"`,
      `DROP INDEX IF EXISTS "IDX_fixtures_group_id"`,
      `DROP INDEX IF EXISTS "IDX_fixtures_home_team_id"`,
      `DROP INDEX IF EXISTS "IDX_fixtures_away_team_id"`,
      `DROP INDEX IF EXISTS "IDX_fixtures_status"`,
      `DROP INDEX IF EXISTS "IDX_fixtures_kickoff_at"`,
      `DROP INDEX IF EXISTS "IDX_fixtures_tournament_id_kickoff_at"`,
      `DROP INDEX IF EXISTS "IDX_player_score_logs_fixture_id"`,
      `DROP INDEX IF EXISTS "IDX_player_score_logs_player_id"`,
      `DROP INDEX IF EXISTS "IDX_player_score_logs_fixture_id_player_id"`,
      `DROP INDEX IF EXISTS "IDX_player_score_events_fixture_id"`,
      `DROP INDEX IF EXISTS "IDX_player_score_events_player_id"`,
      `DROP INDEX IF EXISTS "IDX_player_score_events_player_score_log_id"`,
      `DROP INDEX IF EXISTS "IDX_fixture_scoring_runs_fixture_id"`,
      `DROP INDEX IF EXISTS "IDX_fixture_scoring_runs_status"`,
      `DROP INDEX IF EXISTS "IDX_fantasy_teams_user_id"`,
      `DROP INDEX IF EXISTS "IDX_fantasy_teams_tournament_id"`,
      `DROP INDEX IF EXISTS "IDX_fantasy_teams_user_tournament"`,
      `DROP INDEX IF EXISTS "IDX_fantasy_picks_fantasy_team_id"`,
      `DROP INDEX IF EXISTS "IDX_fantasy_picks_player_id"`,
      `DROP INDEX IF EXISTS "IDX_transfers_fantasy_team_id"`,
      `DROP INDEX IF EXISTS "IDX_transfers_matchday_id"`,
      `DROP INDEX IF EXISTS "IDX_transfers_player_in_id"`,
      `DROP INDEX IF EXISTS "IDX_transfers_player_out_id"`,
      `DROP INDEX IF EXISTS "IDX_chip_activations_fantasy_team_id"`,
      `DROP INDEX IF EXISTS "IDX_chip_activations_matchday_id"`,
      `DROP INDEX IF EXISTS "IDX_chip_activations_chip_type"`,
      `DROP INDEX IF EXISTS "IDX_leaderboard_entries_matchday_id"`,
      `DROP INDEX IF EXISTS "IDX_leaderboard_entries_league_id"`,
      `DROP INDEX IF EXISTS "IDX_leaderboard_entries_fantasy_team_id"`,
      `DROP INDEX IF EXISTS "IDX_leaderboard_entries_scope"`,
      `DROP INDEX IF EXISTS "IDX_leaderboard_entries_scope_matchday"`,
      `DROP INDEX IF EXISTS "IDX_leaderboard_entries_league_scope"`,
      `DROP INDEX IF EXISTS "IDX_league_memberships_league_id"`,
      `DROP INDEX IF EXISTS "IDX_league_memberships_user_id"`,
      `DROP INDEX IF EXISTS "IDX_notifications_user_id"`,
      `DROP INDEX IF EXISTS "IDX_notifications_type"`,
      `DROP INDEX IF EXISTS "IDX_notifications_read_at"`,
      `DROP INDEX IF EXISTS "IDX_notifications_created_at"`,
      `DROP INDEX IF EXISTS "IDX_refresh_sessions_user_id"`,
      `DROP INDEX IF EXISTS "IDX_refresh_sessions_token_hash"`,
      `DROP INDEX IF EXISTS "IDX_refresh_sessions_expires_at"`,
      `DROP INDEX IF EXISTS "IDX_user_profiles_user_id"`,
      `DROP INDEX IF EXISTS "IDX_admin_audit_logs_action_type"`,
      `DROP INDEX IF EXISTS "IDX_admin_audit_logs_created_at"`,
    ];

    for (const statement of dropStatements) {
      try {
        await queryRunner.query(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(`[HotPathIndexes] Drop skipped: ${statement} — ${message}`);
      }
    }
  }
}
