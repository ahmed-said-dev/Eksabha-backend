require('dotenv').config({ path: '.env' });
const { Client } = require('pg');

const TOURNAMENT_ID = 'd3b96e44-bbac-46ef-a6e6-cf393a046bbe';

async function main() {
  const client = new Client({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER ?? 'postgres',
    password: String(process.env.DATABASE_PASSWORD ?? 'postgres'),
    database: process.env.DATABASE_NAME ?? 'fantasy_world_cup',
  });

  await client.connect();

  const summary = await client.query(`
    select
      m.number,
      count(f.id)::int as fixtures,
      coalesce(array_remove(array_agg(distinct g.code order by g.code), null), '{}') as groups
    from matchdays m
    left join fixtures f on f.matchday_id = m.id and f.deleted_at is null
    left join groups g on g.id = f.group_id and g.deleted_at is null
    where m.tournament_id = $1
      and m.deleted_at is null
    group by m.number
    order by m.number
  `, [TOURNAMENT_ID]);

  const overflow = await client.query(`
    select
      m.number,
      count(f.id)::int as fixtures
    from fixtures f
    join matchdays m on m.id = f.matchday_id
    where f.tournament_id = $1
      and f.deleted_at is null
      and m.deleted_at is null
      and m.number > 30
    group by m.number
    order by m.number
  `, [TOURNAMENT_ID]);

  console.log(JSON.stringify({ summary: summary.rows, overflow: overflow.rows }, null, 2));

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
