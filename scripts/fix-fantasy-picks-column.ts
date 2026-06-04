import 'dotenv/config';
import dataSource from '../src/infra/database/typeorm.datasource';

async function main() {
  const ds = await dataSource.initialize();
  try {
    await ds.query(`ALTER TABLE fantasy_picks ADD COLUMN IF NOT EXISTS player_position VARCHAR(10);`);
    console.log('Added player_position column to fantasy_picks table.');
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
