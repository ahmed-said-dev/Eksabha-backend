import 'dotenv/config';
import { DataSource } from 'typeorm';

import { appEntities } from './entities';

const useSsl = process.env.DATABASE_SSL === 'true';

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
  database: process.env.DATABASE_NAME ?? 'fantasy_world_cup',
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  entities: [...appEntities],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.DATABASE_QUERY_LOGGING === 'true',
});
