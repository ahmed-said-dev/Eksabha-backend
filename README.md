# Fantasy World Cup Backend

Production-oriented NestJS backend for the fantasy football platform.

## Stack

- [`NestJS`](WorldCupFantasy/backend/package.json:29)
- [`PostgreSQL`](WorldCupFantasy/backend/.env.example:6)
- [`Redis`](WorldCupFantasy/backend/.env.example:12)
- [`TypeORM`](WorldCupFantasy/backend/package.json:29)
- [`BullMQ`](WorldCupFantasy/backend/package.json:29)
- [`WebSockets`](WorldCupFantasy/backend/src/modules/realtime/realtime.gateway.ts:1)

## Prerequisites

- [`Node.js 20+`](https://nodejs.org/)
- [`WSL 2`](https://learn.microsoft.com/windows/wsl/install)
- [`Docker Desktop`](https://www.docker.com/products/docker-desktop/)

## First-time local setup

1. Copy [`backend/.env.example`](WorldCupFantasy/backend/.env.example:1) to [`backend/.env`](WorldCupFantasy/backend/.env.example:1).
2. Install dependencies:

```bash
npm install
```

3. Start local infrastructure:

```bash
docker compose up -d
```

4. Run database migrations:

```bash
npm run db:migration:run
```

5. Seed sample data:

```bash
npm run db:seed
```

6. Start the API in development mode:

```bash
npm run start:dev
```

## Useful commands

```bash
npm run build
npm run lint
npm run test
npm run db:migration:run
npm run db:migration:revert
npm run db:seed
npm run db:reset
npm run compose:up
npm run compose:down
```

## Current implementation checkpoint

The backend currently includes:

- environment validation in [`env.validation.ts`](WorldCupFantasy/backend/src/common/config/env.validation.ts:1)
- TypeORM database bootstrap in [`database.module.ts`](WorldCupFantasy/backend/src/infra/database/database.module.ts:1)
- Redis and queue bootstrap in [`cache.module.ts`](WorldCupFantasy/backend/src/infra/cache/cache.module.ts:1) and [`queue.module.ts`](WorldCupFantasy/backend/src/infra/queue/queue.module.ts:1)
- realtime gateway in [`realtime.gateway.ts`](WorldCupFantasy/backend/src/modules/realtime/realtime.gateway.ts:1)
- initial schema migration in [`1744497000000-InitialSchemaBootstrap.ts`](WorldCupFantasy/backend/src/infra/database/migrations/1744497000000-InitialSchemaBootstrap.ts:1)
- auth flow in [`auth.service.ts`](WorldCupFantasy/backend/src/modules/auth/auth.service.ts:1)
- seed runner in [`seed.ts`](WorldCupFantasy/backend/src/scripts/seed.ts:1)

## Notes

- If [`docker compose up -d`](WorldCupFantasy/backend/docker-compose.yml:1) fails, make sure Docker Desktop is open and the Linux engine is healthy.
- If Docker is healthy, the expected local database settings already match [`backend/.env.example`](WorldCupFantasy/backend/.env.example:1).
