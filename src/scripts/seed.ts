import 'dotenv/config';
import { DataSource } from 'typeorm';

import dataSource from '../infra/database/typeorm.datasource';
import { runAppSeed } from '../database/seeds/app.seed';

async function bootstrapSeed() {
  const appDataSource: DataSource = await dataSource.initialize();

  try {
    const result = await runAppSeed(appDataSource);
    console.log('Seed completed successfully:', result);
  } finally {
    await appDataSource.destroy();
  }
}

bootstrapSeed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
