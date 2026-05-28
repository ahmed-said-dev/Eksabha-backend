import 'dotenv/config';

import { DataSource } from 'typeorm';

import dataSource from '../src/infra/database/typeorm.datasource';
import { TournamentEntity } from '../src/modules/tournament/entities/tournament.entity';
import { MatchdayEntity } from '../src/modules/tournament/entities/matchday.entity';

const WORLD_CUP_TOURNAMENT_KEY = 'world-cup-2026';

async function main() {
  const appDataSource: DataSource = await dataSource.initialize();

  try {
    const tournamentRepo = appDataSource.getRepository(TournamentEntity);
    const matchdayRepo = appDataSource.getRepository(MatchdayEntity);

    const tournament = await tournamentRepo.findOne({
      where: { competitionKey: WORLD_CUP_TOURNAMENT_KEY },
    });

    if (!tournament) {
      throw new Error(`Tournament ${WORLD_CUP_TOURNAMENT_KEY} not found.`);
    }

    const matchdays = await matchdayRepo
      .createQueryBuilder('matchday')
      .leftJoin('matchday.tournament', 'tournament')
      .where('tournament.id = :tournamentId', { tournamentId: tournament.id })
      .orderBy('matchday.number', 'ASC')
      .getMany();

    const matchdayIds = matchdays.map((matchday) => matchday.id);
    const currentMatchday = matchdays.find((matchday) => matchday.number === tournament.currentMatchdayNumber) ?? null;

    console.log(`Resetting stale More history for tournament ${WORLD_CUP_TOURNAMENT_KEY} (${tournament.id})`);

    const deletedPlayerScoreEvents = matchdayIds.length > 0
      ? await appDataSource.query(
        `
          DELETE FROM player_score_events
          WHERE fixture_id IN (
            SELECT id FROM fixtures WHERE matchday_id = ANY($1::uuid[])
          )
        `,
        [matchdayIds],
      )
      : [];

    const deletedPlayerScoreLogs = matchdayIds.length > 0
      ? await appDataSource.query(
        `
          DELETE FROM player_score_logs
          WHERE fixture_id IN (
            SELECT id FROM fixtures WHERE matchday_id = ANY($1::uuid[])
          )
        `,
        [matchdayIds],
      )
      : [];

    const deletedTransfers = matchdayIds.length > 0
      ? await appDataSource.query(
        `DELETE FROM transfers WHERE matchday_id = ANY($1::uuid[])`,
        [matchdayIds],
      )
      : [];

    await appDataSource.query(
      `DELETE FROM leaderboard_entries WHERE fantasy_team_id IN (SELECT id FROM fantasy_teams WHERE tournament_id = $1)`,
      [tournament.id],
    );

    await appDataSource.query(
      `
        UPDATE fantasy_teams
        SET total_points = 0
        WHERE tournament_id = $1
      `,
      [tournament.id],
    );

    if (currentMatchday) {
      await appDataSource.query(
        `
          INSERT INTO leaderboard_entries (
            rank,
            previous_rank,
            total_points,
            matchday_points,
            scope,
            fantasy_team_id,
            league_id,
            matchday_id,
            scope_type,
            scope_key,
            meta,
            created_at,
            updated_at
          )
          SELECT
            ranking.rank,
            NULL,
            0,
            0,
            'global',
            ranking.id,
            NULL,
            NULL,
            'overall',
            NULL,
            '{}'::jsonb,
            NOW(),
            NOW()
          FROM (
            SELECT fantasy_team.id, ROW_NUMBER() OVER (ORDER BY fantasy_team.created_at ASC, fantasy_team.id ASC) AS rank
            FROM fantasy_teams fantasy_team
            WHERE fantasy_team.tournament_id = $1
          ) ranking
        `,
        [tournament.id],
      );

      await appDataSource.query(
        `
          INSERT INTO leaderboard_entries (
            rank,
            previous_rank,
            total_points,
            matchday_points,
            scope,
            fantasy_team_id,
            league_id,
            matchday_id,
            scope_type,
            scope_key,
            meta,
            created_at,
            updated_at
          )
          SELECT
            ranking.rank,
            NULL,
            0,
            0,
            'global',
            ranking.id,
            NULL,
            $2,
            'overall',
            NULL,
            '{}'::jsonb,
            NOW(),
            NOW()
          FROM (
            SELECT fantasy_team.id, ROW_NUMBER() OVER (ORDER BY fantasy_team.created_at ASC, fantasy_team.id ASC) AS rank
            FROM fantasy_teams fantasy_team
            WHERE fantasy_team.tournament_id = $1
          ) ranking
        `,
        [tournament.id, currentMatchday.id],
      );
    }

    const fantasyTeamCountResult = await appDataSource.query(
      `SELECT COUNT(*)::int AS count FROM fantasy_teams WHERE tournament_id = $1`,
      [tournament.id],
    ) as Array<{ count: number }>;

    console.log(`Matchdays scanned: ${matchdayIds.length}`);
    console.log(`Player score events cleanup executed: ${deletedPlayerScoreEvents !== null}`);
    console.log(`Player score logs cleanup executed: ${deletedPlayerScoreLogs !== null}`);
    console.log(`Transfers cleanup executed: ${deletedTransfers !== null}`);
    console.log(`Fantasy teams reset: ${fantasyTeamCountResult[0]?.count ?? 0}`);
    console.log(`Current matchday baseline rebuilt: ${currentMatchday ? currentMatchday.number : 'skipped'}`);
  } finally {
    await appDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Reset world cup more history failed:', error);
  process.exit(1);
});
