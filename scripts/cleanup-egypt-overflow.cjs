require('dotenv').config({ path: '.env' });
const { Client } = require('pg');

const TOURNAMENT_ID = 'd3b96e44-bbac-46ef-a6e6-cf393a046bbe';
const MAX_MATCHDAY = 30;

async function main() {
  const client = new Client({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER ?? 'postgres',
    password: String(process.env.DATABASE_PASSWORD ?? 'postgres'),
    database: process.env.DATABASE_NAME ?? 'fantasy_world_cup',
  });

  await client.connect();

  const fixtureDelete = await client.query(
    `
      delete from fixtures
      where id in (
        select f.id
        from fixtures f
        join matchdays m on m.id = f.matchday_id
        where f.tournament_id = $1
          and f.deleted_at is null
          and m.deleted_at is null
          and m.number > $2
      )
      returning id
    `,
    [TOURNAMENT_ID, MAX_MATCHDAY],
  );

  const matchdayDelete = await client.query(
    `
      delete from matchdays m
      where m.tournament_id = $1
        and m.deleted_at is null
        and m.number > $2
        and not exists (
          select 1
          from fixtures f
          where f.matchday_id = m.id
            and f.deleted_at is null
        )
      returning id, number
    `,
    [TOURNAMENT_ID, MAX_MATCHDAY],
  );

  console.log(
    JSON.stringify(
      {
        deletedFixtures: fixtureDelete.rowCount,
        deletedMatchdays: matchdayDelete.rows,
      },
      null,
      2,
    ),
  );

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
