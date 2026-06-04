import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DataSource, In, Repository } from 'typeorm';

import { PlayerPosition } from '../src/common/database';
import dataSource from '../src/infra/database/typeorm.datasource';
import { PlayerPriceEntity } from '../src/modules/catalog/entities/player-price.entity';
import { PlayerEntity } from '../src/modules/catalog/entities/player.entity';
import { TeamEntity } from '../src/modules/catalog/entities/team.entity';
import { TournamentEntity } from '../src/modules/tournament/entities/tournament.entity';

const WORLD_CUP_TOURNAMENT_KEY = 'world-cup-2026';
const DEFAULT_JSON_PATH = '../.deepseek/pastes/8.md';

const SQUAD_ID_TO_TEAM_CODE: Record<number, string> = {
  1: 'ALG', 2: 'ARG', 3: 'AUS', 4: 'AUT', 5: 'BEL', 6: 'BIH',
  7: 'BRA', 8: 'CPV', 9: 'CAN', 10: 'COL', 11: 'COD', 12: 'CIV',
  13: 'CRO', 14: 'CUW', 15: 'CZE', 16: 'ECU', 17: 'EGY', 18: 'ENG',
  19: 'FRA', 20: 'GER', 21: 'GHA', 22: 'HAI', 23: 'IRN', 24: 'IRQ',
  25: 'JPN', 26: 'JOR', 27: 'KOR', 28: 'MEX', 29: 'MAR', 30: 'NED',
  31: 'NZL', 32: 'NOR', 33: 'PAN', 34: 'PAR', 35: 'POR', 36: 'QAT',
  37: 'KSA', 38: 'SCO', 39: 'SEN', 40: 'RSA', 41: 'ESP', 42: 'SWE',
  43: 'SUI', 44: 'TUN', 45: 'TUR', 46: 'URU', 47: 'USA', 48: 'UZB',
};

type JsonPlayer = {
  id: number;
  firstName: string;
  lastName: string;
  knownName: string | null;
  squadId: number;
  position: string;
  price: number;
  status: string;
};

function buildFullName(p: JsonPlayer) {
  const first = p.firstName.trim();
  const last = p.lastName.trim();
  if (!first) return last;
  if (!last) return first;
  return `${first} ${last}`;
}

function buildShortName(p: JsonPlayer) {
  if (p.knownName?.trim()) return p.knownName.trim().slice(0, 80);
  const clean = buildFullName(p).replace(/\s+/g, ' ');
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length <= 1) return clean.slice(0, 80);
  return `${parts[0][0]}. ${parts[parts.length - 1]}`.slice(0, 80);
}

function mapPosition(position: string): PlayerPosition {
  const upper = position.toUpperCase();
  if (upper === 'GK' || upper === 'DEF' || upper === 'MID' || upper === 'FWD') {
    return upper as PlayerPosition;
  }
  throw new Error(`Unknown position: ${position}`);
}

async function main() {
  const jsonPath = resolve(process.cwd(), process.argv[2] ?? DEFAULT_JSON_PATH);
  console.log(`Reading JSON from: ${jsonPath}`);
  const rawContent = await readFile(jsonPath, 'utf8');
  const jsonPlayers: JsonPlayer[] = JSON.parse(rawContent);

  console.log(`Parsed ${jsonPlayers.length} players from JSON.`);

  const appDataSource: DataSource = await dataSource.initialize();

  try {
    const tournamentRepo = appDataSource.getRepository(TournamentEntity);
    const teamRepo = appDataSource.getRepository(TeamEntity);
    const playerRepo = appDataSource.getRepository(PlayerEntity);
    const playerPriceRepo = appDataSource.getRepository(PlayerPriceEntity);

    const tournament = await tournamentRepo.findOne({
      where: { competitionKey: WORLD_CUP_TOURNAMENT_KEY },
    });

    if (!tournament) {
      throw new Error(`Tournament ${WORLD_CUP_TOURNAMENT_KEY} not found.`);
    }

    // Load all World Cup teams
    const dbTeams = await teamRepo.find({
      where: { tournament: { id: tournament.id } },
      order: { code: 'ASC' },
    });

    const teamsByCode = new Map(dbTeams.map((t) => [t.code, t]));

    // Group JSON players by squadId (team)
    const playersBySquad = new Map<number, JsonPlayer[]>();
    for (const p of jsonPlayers) {
      const list = playersBySquad.get(p.squadId) ?? [];
      list.push(p);
      playersBySquad.set(p.squadId, list);
    }

    let created = 0;
    let updated = 0;
    let deactivated = 0;
    let skipped = 0;

    for (const [squadId, squadPlayers] of playersBySquad) {
      const teamCode = SQUAD_ID_TO_TEAM_CODE[squadId];
      if (!teamCode) {
        console.warn(`Unknown squadId ${squadId}, skipping ${squadPlayers.length} players.`);
        skipped += squadPlayers.length;
        continue;
      }

      const dbTeam = teamsByCode.get(teamCode);
      if (!dbTeam) {
        console.warn(`Team ${teamCode} not found in DB, skipping ${squadPlayers.length} players.`);
        skipped += squadPlayers.length;
        continue;
      }

      // Track which external IDs are in this JSON batch
      const jsonExternalIds = new Set(squadPlayers.map((p) => String(p.id)));

      // Load existing players for this team
      const existingPlayers = await playerRepo.find({
        where: { team: { id: dbTeam.id } },
        relations: { team: true },
      });

      const existingByExternalId = new Map<string, PlayerEntity>();
      for (const p of existingPlayers) {
        if (p.externalProviderId) {
          existingByExternalId.set(p.externalProviderId, p);
        }
      }

      for (const jp of squadPlayers) {
        const externalId = String(jp.id);
        let player = existingByExternalId.get(externalId);
        const isNew = !player;

        if (isNew) {
          player = playerRepo.create();
          player.team = dbTeam;
          player.minutesPlayed = 0;
          player.totalPoints = 0;
          created += 1;
        } else {
          updated += 1;
        }

        const entity = player!;
        const fullName = buildFullName(jp);
        const shortName = buildShortName(jp);
        const position = mapPosition(jp.position);
        const price = jp.price.toFixed(2);

        entity.name = fullName;
        entity.shortName = shortName;
        entity.position = position;
        entity.externalProviderId = externalId;
        entity.currentPrice = price;
        entity.isActive = true;
        entity.isInjured = false;
        entity.isSuspended = false;

        const savedPlayer = await playerRepo.save(entity);

        // Record price history if new or price changed
        const latestPrice = await playerPriceRepo.findOne({
          where: { player: { id: (savedPlayer as PlayerEntity).id } },
          order: { effectiveAt: 'DESC', createdAt: 'DESC' },
        });

        if (isNew || !latestPrice || latestPrice.price !== price) {
          await playerPriceRepo.save([
            playerPriceRepo.create({
              player: savedPlayer as PlayerEntity,
              price,
              effectiveAt: new Date(),
              reason: 'json_bulk_import_2026',
            }),
          ]);
        }
      }

      // Deactivate players NOT in the JSON for this team
      for (const existing of existingPlayers) {
        if (existing.externalProviderId && jsonExternalIds.has(existing.externalProviderId)) {
          continue; // Player is in the JSON, skip
        }
        if (existing.isActive) {
          existing.isActive = false;
          existing.externalProviderId = null;
          await playerRepo.save(existing);
          deactivated += 1;
        }
      }

      console.log(`  ${teamCode} (squad ${squadId}): ${squadPlayers.length} players synced.`);
    }

    console.log(`\nImport complete:`);
    console.log(`  Created:  ${created}`);
    console.log(`  Updated:  ${updated}`);
    console.log(`  Deactivated: ${deactivated}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Total in JSON: ${jsonPlayers.length}`);
  } finally {
    await appDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('JSON import failed:', error);
  process.exit(1);
});