import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DataSource, Repository } from 'typeorm';

import { PlayerPosition } from '../src/common/database';
import dataSource from '../src/infra/database/typeorm.datasource';
import { PlayerPriceEntity } from '../src/modules/catalog/entities/player-price.entity';
import { PlayerEntity } from '../src/modules/catalog/entities/player.entity';
import { TeamEntity } from '../src/modules/catalog/entities/team.entity';
import { TournamentEntity } from '../src/modules/tournament/entities/tournament.entity';

const WORLD_CUP_TOURNAMENT_KEY = 'world-cup-2026';
const DEFAULT_CSV_PATH = '../assets/CSVs/world_cup_2026_fantasy_players_provisional.csv';

type CsvRow = {
  teamCode: string;
  teamName: string;
  playerName: string;
  shortName: string;
  position: PlayerPosition;
  fantasyPrice: string;
  totalPoints: number;
  minutesPlayed: number;
  isInjured: boolean;
  isSuspended: boolean;
  isActive: boolean;
  externalProviderId: string | null;
};

type CsvTeam = {
  code: string;
  name: string;
  rows: CsvRow[];
};

const REQUIRED_HEADERS = [
  'team_code',
  'team_name',
  'player_name',
  'short_name',
  'position',
  'fantasy_price',
  'total_points',
  'minutes_played',
  'is_injured',
  'is_suspended',
  'is_active',
  'external_provider_id',
] as const;

const FLAG_CODE_BY_TEAM_CODE: Record<string, string> = {
  ALG: 'dz',
  ARG: 'ar',
  AUS: 'au',
  AUT: 'at',
  BEL: 'be',
  BIH: 'ba',
  BRA: 'br',
  CAN: 'ca',
  CIV: 'ci',
  COD: 'cd',
  COL: 'co',
  CPV: 'cv',
  CRO: 'hr',
  CUW: 'cw',
  CZE: 'cz',
  ECU: 'ec',
  EGY: 'eg',
  ENG: 'gb-eng',
  ESP: 'es',
  FRA: 'fr',
  GER: 'de',
  GHA: 'gh',
  HAI: 'ht',
  IRN: 'ir',
  IRQ: 'iq',
  JOR: 'jo',
  JPN: 'jp',
  KOR: 'kr',
  KSA: 'sa',
  MAR: 'ma',
  MEX: 'mx',
  NED: 'nl',
  NOR: 'no',
  NZL: 'nz',
  PAN: 'pa',
  PAR: 'py',
  POR: 'pt',
  QAT: 'qa',
  RSA: 'za',
  SCO: 'gb-sct',
  SEN: 'sn',
  SUI: 'ch',
  SWE: 'se',
  TUN: 'tn',
  TUR: 'tr',
  URU: 'uy',
  USA: 'us',
  UZB: 'uz',
};

function parseBoolean(value: string) {
  return value.trim().toLowerCase() === 'true';
}

function parseCsvLine(line: string) {
  return line.split(',').map((value) => value.trim());
}

function normalizePrice(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid fantasy_price value: ${value}`);
  }

  const rounded = Math.round(parsed * 2) / 2;
  return rounded.toFixed(2);
}

function parsePosition(value: string): PlayerPosition {
  if (value === PlayerPosition.GOALKEEPER || value === PlayerPosition.DEFENDER || value === PlayerPosition.MIDFIELDER || value === PlayerPosition.FORWARD) {
    return value;
  }

  throw new Error(`Unsupported position code in CSV: ${value}`);
}

function parseCsvRows(content: string) {
  const normalized = content.replace(/^\uFEFF/, '').trim();
  const lines = normalized.split(/\r?\n/).filter(Boolean);
  if (!lines.length) {
    throw new Error('CSV file is empty.');
  }

  const header = parseCsvLine(lines[0]);
  if (header.length !== REQUIRED_HEADERS.length || REQUIRED_HEADERS.some((expected, index) => header[index] !== expected)) {
    throw new Error(`CSV header does not match the required schema. Found: ${header.join(', ')}`);
  }

  const rows: CsvRow[] = [];
  for (const line of lines.slice(1)) {
    const columns = parseCsvLine(line);
    if (columns.length !== REQUIRED_HEADERS.length) {
      throw new Error(`Invalid CSV row shape: ${line}`);
    }

    rows.push({
      teamCode: columns[0].toUpperCase(),
      teamName: columns[1],
      playerName: columns[2],
      shortName: columns[3],
      position: parsePosition(columns[4]),
      fantasyPrice: normalizePrice(columns[5]),
      totalPoints: Number.parseInt(columns[6] || '0', 10) || 0,
      minutesPlayed: Number.parseInt(columns[7] || '0', 10) || 0,
      isInjured: parseBoolean(columns[8]),
      isSuspended: parseBoolean(columns[9]),
      isActive: parseBoolean(columns[10]),
      externalProviderId: columns[11] ? columns[11] : null,
    });
  }

  return rows;
}

function buildTeamsFromRows(rows: CsvRow[]) {
  const teamMap = new Map<string, CsvTeam>();
  for (const row of rows) {
    const existing = teamMap.get(row.teamCode);
    if (!existing) {
      teamMap.set(row.teamCode, { code: row.teamCode, name: row.teamName, rows: [row] });
      continue;
    }

    existing.rows.push(row);
  }

  return Array.from(teamMap.values());
}

function buildFlagUrl(teamCode: string) {
  const flagCode = FLAG_CODE_BY_TEAM_CODE[teamCode];
  return flagCode ? `https://flagcdn.com/w80/${flagCode}.png` : null;
}

async function safeRemovePlayer(input: {
  player: PlayerEntity;
  playerRepo: Repository<PlayerEntity>;
}) {
  try {
    await input.playerRepo.delete(input.player.id);
    return 'deleted' as const;
  } catch {
    input.player.isActive = false;
    input.player.externalProviderId = null;
    await input.playerRepo.save(input.player);
    return 'deactivated' as const;
  }
}

async function main() {
  const csvPath = resolve(process.cwd(), process.argv[2] ?? DEFAULT_CSV_PATH);
  const csvContent = await readFile(csvPath, 'utf8');
  const csvRows = parseCsvRows(csvContent);
  const csvTeams = buildTeamsFromRows(csvRows);

  const appDataSource: DataSource = await dataSource.initialize();

  try {
    const tournamentRepo = appDataSource.getRepository(TournamentEntity);
    const teamRepo = appDataSource.getRepository(TeamEntity);
    const playerRepo = appDataSource.getRepository(PlayerEntity);
    const playerPriceRepo = appDataSource.getRepository(PlayerPriceEntity);

    const tournament = await tournamentRepo.findOne({ where: { competitionKey: WORLD_CUP_TOURNAMENT_KEY } });
    if (!tournament) {
      throw new Error(`Tournament ${WORLD_CUP_TOURNAMENT_KEY} not found.`);
    }

    const dbTeams = await teamRepo.find({
      where: { tournament: { id: tournament.id } },
      relations: { tournament: true, group: true },
      order: { code: 'ASC' },
    });

    const worldCupTeams = dbTeams
      .filter((team) => team.group !== null)
      .sort((left, right) => {
        const groupCompare = (left.group?.code ?? '').localeCompare(right.group?.code ?? '');
        return groupCompare !== 0 ? groupCompare : left.code.localeCompare(right.code);
      });

    if (worldCupTeams.length !== csvTeams.length) {
      throw new Error(`CSV contains ${csvTeams.length} teams but the World Cup tournament currently has ${worldCupTeams.length} team slots.`);
    }

    let createdPlayers = 0;
    let updatedPlayers = 0;
    let deletedPlayers = 0;
    let deactivatedPlayers = 0;

    for (let index = 0; index < csvTeams.length; index += 1) {
      const csvTeam = csvTeams[index];
      const dbTeam = worldCupTeams[index];

      dbTeam.code = csvTeam.code;
      dbTeam.shortName = csvTeam.code;
      dbTeam.name = csvTeam.name;
      dbTeam.flagUrl = buildFlagUrl(csvTeam.code);
      dbTeam.externalProviderId = null;
      dbTeam.isEliminated = false;
      await teamRepo.save(dbTeam);

      const existingPlayers = await playerRepo.find({
        where: { team: { id: dbTeam.id } },
        relations: { team: true },
        order: { createdAt: 'ASC' },
      });

      for (let playerIndex = 0; playerIndex < csvTeam.rows.length; playerIndex += 1) {
        const row = csvTeam.rows[playerIndex];
        const existingPlayer = existingPlayers[playerIndex] ?? playerRepo.create();
        const isNewPlayer = !existingPlayers[playerIndex];

        existingPlayer.name = row.playerName;
        existingPlayer.shortName = row.shortName;
        existingPlayer.position = row.position;
        existingPlayer.team = dbTeam;
        existingPlayer.externalProviderId = row.externalProviderId;
        existingPlayer.currentPrice = row.fantasyPrice;
        existingPlayer.isInjured = row.isInjured;
        existingPlayer.isSuspended = row.isSuspended;
        existingPlayer.isActive = row.isActive;
        existingPlayer.minutesPlayed = row.minutesPlayed;
        existingPlayer.totalPoints = row.totalPoints;

        const savedPlayer = await playerRepo.save(existingPlayer);
        if (isNewPlayer) {
          createdPlayers += 1;
        } else {
          updatedPlayers += 1;
        }

        const latestPrice = await playerPriceRepo.findOne({
          where: { player: { id: savedPlayer.id } },
          relations: { player: true },
          order: { effectiveAt: 'DESC', createdAt: 'DESC' },
        });

        if (!latestPrice || latestPrice.price !== row.fantasyPrice) {
          await playerPriceRepo.save(
            playerPriceRepo.create({
              player: savedPlayer,
              price: row.fantasyPrice,
              effectiveAt: new Date(),
              reason: 'world_cup_csv_import',
            }),
          );
        }
      }

      const stalePlayers = existingPlayers.slice(csvTeam.rows.length);
      for (const stalePlayer of stalePlayers) {
        const outcome = await safeRemovePlayer({ player: stalePlayer, playerRepo });
        if (outcome === 'deleted') {
          deletedPlayers += 1;
        } else {
          deactivatedPlayers += 1;
        }
      }

      console.log(`Imported ${csvTeam.rows.length} players into ${dbTeam.code} · ${dbTeam.name}.`);
    }

    console.log(`World Cup CSV import completed. created=${createdPlayers} updated=${updatedPlayers} deleted=${deletedPlayers} deactivated=${deactivatedPlayers}`);
  } finally {
    await appDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('World Cup CSV import failed:', error);
  process.exit(1);
});
