import 'dotenv/config';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { DataSource, Repository } from 'typeorm';

import { PlayerPosition } from '../src/common/database';
import { WORLD_CUP_2026_FULL_PLAYERS } from '../src/database/seeds/world-cup-2026-full-player-catalog.generated';
import dataSource from '../src/infra/database/typeorm.datasource';
import { PlayerPriceEntity } from '../src/modules/catalog/entities/player-price.entity';
import { PlayerEntity } from '../src/modules/catalog/entities/player.entity';
import { TeamEntity } from '../src/modules/catalog/entities/team.entity';
import { TournamentEntity } from '../src/modules/tournament/entities/tournament.entity';

const WORLD_CUP_TOURNAMENT_KEY = 'world-cup-2026';
const REQUEST_DELAY_MS = 650;

type SofaSearchResult = {
  type?: string;
  score?: number;
  entity?: {
    id?: number;
    name?: string;
    nameCode?: string | null;
    slug?: string | null;
    national?: boolean;
    gender?: string | null;
    sport?: {
      slug?: string | null;
      name?: string | null;
    } | null;
    country?: {
      alpha2?: string | null;
      name?: string | null;
      slug?: string | null;
    } | null;
  };
};

type SofaSearchResponse = {
  results?: SofaSearchResult[];
};

type SofaTeamPlayersResponse = {
  players?: Array<{
    player?: {
      id?: number;
      name?: string;
      shortName?: string | null;
      position?: string | null;
      shirtNumber?: number | string | null;
      proposedMarketValue?: number | null;
      dateOfBirthTimestamp?: number | null;
    };
  }>;
};

type ResolvedSofaTeam = {
  id: number;
  name: string;
};

type ExistingCatalogPlayer = (typeof WORLD_CUP_2026_FULL_PLAYERS)[number];

const TEAM_QUERY_ALIASES: Record<string, string[]> = {
  USA: ['USA', 'United States'],
  KSA: ['Saudi Arabia', 'SAU', 'KSA'],
  ENG: ['England', 'ENG'],
  WAL: ['Wales', 'WAL'],
  IRN: ['Iran', 'IRN'],
  KOR: ['South Korea', 'KOR'],
  CRC: ['Costa Rica', 'CRC'],
  NZL: ['New Zealand', 'NZL'],
  CHN: ['China', 'CHN'],
  CMR: ['Cameroon', 'CMR'],
  CIV: ['Ivory Coast', "Cote d'Ivoire", 'Côte d’Ivoire', 'Côte d Ivoire', 'CIV'],
  COD: ['DR Congo', 'Congo DR', 'Democratic Republic of the Congo', 'COD'],
  CPV: ['Cape Verde', 'Cabo Verde', 'CPV'],
  BIH: ['Bosnia and Herzegovina', 'Bosnia-Herzegovina', 'BIH'],
  CUW: ['Curacao', 'Curaçao', 'CUW'],
};

class SofaBrowserClient {
  private browser: Browser | null = null;

  private context: BrowserContext | null = null;

  private page: Page | null = null;

  async init() {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'Europe/London',
    });

    this.page = await this.context.newPage();
    await this.page.goto('https://www.sofascore.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await this.page.waitForTimeout(1_200);
  }

  async requestJson<T>(path: string): Promise<T> {
    if (!this.page) {
      throw new Error('SofaBrowserClient not initialized.');
    }

    const result = await this.page.evaluate(async (apiPath) => {
      const response = await fetch(`https://www.sofascore.com${apiPath}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
        credentials: 'include',
        cache: 'no-store',
      });

      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
      };
    }, path);

    if (!result.ok) {
      throw new Error(`HTTP ${result.status} while fetching SofaScore ${path}. Body: ${result.text.slice(0, 300)}`);
    }

    await sleep(REQUEST_DELAY_MS);
    return JSON.parse(result.text) as T;
  }

  async close() {
    await this.context?.close();
    await this.browser?.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCompact(value: string | null | undefined) {
  return normalize(value).replace(/\s+/g, '');
}

function getSurname(value: string | null | undefined) {
  const parts = normalize(value).split(' ').filter(Boolean);
  return parts.at(-1) ?? '';
}

function buildShortName(fullName: string, provided?: string | null) {
  const normalizedProvided = provided?.trim();
  if (normalizedProvided) {
    return normalizedProvided.slice(0, 80);
  }

  const segments = fullName.split(' ').filter(Boolean);
  if (segments.length <= 1) {
    return fullName.slice(0, 80);
  }

  return `${segments[0][0]}. ${segments[segments.length - 1]}`.slice(0, 80);
}

function mapSofaPosition(position?: string | null): PlayerPosition {
  switch ((position ?? '').toUpperCase()) {
    case 'G':
    case 'GK':
    case 'GOALKEEPER':
      return PlayerPosition.GOALKEEPER;
    case 'D':
    case 'DEF':
    case 'DEFENDER':
      return PlayerPosition.DEFENDER;
    case 'M':
    case 'MID':
    case 'MIDFIELDER':
      return PlayerPosition.MIDFIELDER;
    case 'F':
    case 'FW':
    case 'FWD':
    case 'FORWARD':
    case 'ATT':
    case 'ATTACKER':
      return PlayerPosition.FORWARD;
    default:
      return PlayerPosition.MIDFIELDER;
  }
}

function toInteger(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function estimateAge(dateOfBirthTimestamp?: number | null) {
  if (!dateOfBirthTimestamp || !Number.isFinite(dateOfBirthTimestamp)) {
    return null;
  }

  const birthDate = new Date(dateOfBirthTimestamp * 1000);
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthOffset = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthOffset < 0 || (monthOffset === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }

  return age;
}

function roundToHalfStep(value: number) {
  return (Math.round(value * 2) / 2).toFixed(2);
}

function estimateFantasyPrice(input: {
  position: PlayerPosition;
  proposedMarketValue?: number | null;
  age?: number | null;
  jerseyNumber?: number | null;
  existingPrice?: string | null;
}) {
  if (input.existingPrice && Number.isFinite(Number(input.existingPrice))) {
    return roundToHalfStep(Number(input.existingPrice));
  }

  if (typeof input.proposedMarketValue === 'number' && Number.isFinite(input.proposedMarketValue) && input.proposedMarketValue > 0) {
    const scaled = Math.max(4, Math.min(14.5, input.proposedMarketValue / 120000));
    return roundToHalfStep(scaled);
  }

  const base =
    input.position === PlayerPosition.GOALKEEPER
      ? 4.5
      : input.position === PlayerPosition.DEFENDER
        ? 5.0
        : input.position === PlayerPosition.MIDFIELDER
          ? 6.5
          : 7.0;

  const age = input.age ?? 25;
  const ageBonus = age >= 24 && age <= 29 ? 0.5 : age >= 30 && age <= 33 ? 0.5 : age <= 21 ? 0 : 0.5;
  const jerseyBonus = typeof input.jerseyNumber === 'number' && input.jerseyNumber > 0 && input.jerseyNumber <= 11 ? 0.5 : 0;
  const computed = Math.max(4, Math.min(12.5, base + ageBonus + jerseyBonus));
  return roundToHalfStep(computed);
}

function getQueryCandidates(team: TeamEntity) {
  return [...new Set([...(TEAM_QUERY_ALIASES[team.code] ?? []), team.code, team.shortName, team.name].filter(Boolean))];
}

function selectBestNationalTeam(team: TeamEntity, candidates: SofaSearchResult[]) {
  const targetName = normalizeCompact(team.name);
  const targetShort = normalizeCompact(team.shortName);
  const targetCode = normalizeCompact(team.code);
  const youthPattern = /(?:^|\s)u\d{1,2}(?:$|\s)/i;

  const ranked = candidates
    .filter((candidate) => candidate.type === 'team')
    .filter((candidate) => candidate.entity?.sport?.slug === 'football')
    .filter((candidate) => candidate.entity?.national === true)
    .filter((candidate) => candidate.entity?.gender !== 'F')
    .filter((candidate) => !youthPattern.test(candidate.entity?.name ?? ''))
    .map((candidate) => {
      const entity = candidate.entity!;
      const normalizedEntityName = normalizeCompact(entity.name);
      const normalizedEntityCode = normalizeCompact(entity.nameCode);

      let score = 0;
      if (normalizedEntityName === targetName) score += 140;
      if (normalizedEntityName === targetShort) score += 120;
      if (normalizedEntityCode === targetCode) score += 130;
      if (normalizedEntityCode === targetShort) score += 110;
      if (normalizedEntityName.includes(targetName) || targetName.includes(normalizedEntityName)) score += 35;
      if (normalizedEntityName.includes(targetShort) || targetShort.includes(normalizedEntityName)) score += 20;
      score += candidate.score ?? 0;

      return {
        score,
        id: entity.id!,
        name: entity.name!,
      };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0] ? { id: ranked[0].id, name: ranked[0].name } : null;
}

async function resolveSofaTeam(client: SofaBrowserClient, team: TeamEntity) {
  if (team.externalProviderId?.startsWith('sofa_team_')) {
    const numeric = Number(team.externalProviderId.replace('sofa_team_', ''));
    if (Number.isFinite(numeric)) {
      return { id: numeric, name: team.name } as ResolvedSofaTeam;
    }
  }

  for (const query of getQueryCandidates(team)) {
    const response = await client.requestJson<SofaSearchResponse>(`/api/v1/search/all?q=${encodeURIComponent(query)}&page=0`);
    const resolved = selectBestNationalTeam(team, response.results ?? []);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

async function fetchSofaTeamPlayers(client: SofaBrowserClient, team: TeamEntity, resolvedTeam: ResolvedSofaTeam) {
  try {
    return await client.requestJson<SofaTeamPlayersResponse>(`/api/v1/team/${resolvedTeam.id}/players`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('HTTP 404')) {
      throw error;
    }

    team.externalProviderId = null;
    const refreshedTeam = await resolveSofaTeam(client, team);
    if (!refreshedTeam || refreshedTeam.id === resolvedTeam.id) {
      throw error;
    }

    return client.requestJson<SofaTeamPlayersResponse>(`/api/v1/team/${refreshedTeam.id}/players`);
  }
}

async function clearStalePlayer(input: {
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
  const appDataSource: DataSource = await dataSource.initialize();
  const sofaClient = new SofaBrowserClient();

  try {
    await sofaClient.init();

    const tournamentRepo = appDataSource.getRepository(TournamentEntity);
    const teamRepo = appDataSource.getRepository(TeamEntity);
    const playerRepo = appDataSource.getRepository(PlayerEntity);
    const playerPriceRepo = appDataSource.getRepository(PlayerPriceEntity);

    const tournament = await tournamentRepo.findOne({ where: { competitionKey: WORLD_CUP_TOURNAMENT_KEY } });
    if (!tournament) {
      throw new Error(`Tournament ${WORLD_CUP_TOURNAMENT_KEY} not found.`);
    }

    const teams = await teamRepo
      .createQueryBuilder('team')
      .leftJoinAndSelect('team.tournament', 'tournament')
      .leftJoinAndSelect('team.group', 'group')
      .where('team.tournament_id = :tournamentId', { tournamentId: tournament.id })
      .orderBy('team.code', 'ASC')
      .getMany();

    const worldCupTeams = teams.filter((team: TeamEntity) => team.group !== null);
    const existingPlayers = await playerRepo
      .createQueryBuilder('player')
      .leftJoinAndSelect('player.team', 'team')
      .where('team.tournament_id = :tournamentId', { tournamentId: tournament.id })
      .getMany();

    const playersByExternalId = new Map<string, PlayerEntity>();
    const playersByExactName = new Map<string, PlayerEntity[]>();
    const playersBySurname = new Map<string, PlayerEntity[]>();

    for (const player of existingPlayers) {
      if (player.externalProviderId) {
        playersByExternalId.set(player.externalProviderId, player);
      }

      const exactKey = `${player.team.id}:${normalizeCompact(player.name)}:${player.position}`;
      const surnameKey = `${player.team.id}:${getSurname(player.name)}:${player.position}`;
      const exactBucket = playersByExactName.get(exactKey) ?? [];
      exactBucket.push(player);
      playersByExactName.set(exactKey, exactBucket);
      const surnameBucket = playersBySurname.get(surnameKey) ?? [];
      surnameBucket.push(player);
      playersBySurname.set(surnameKey, surnameBucket);
    }

    let created = 0;
    let updated = 0;
    let deleted = 0;
    let deactivated = 0;

    for (const team of worldCupTeams) {
      const resolvedTeam = await resolveSofaTeam(sofaClient, team);
      if (!resolvedTeam) {
        throw new Error(`Could not resolve SofaScore team for ${team.name} (${team.code}).`);
      }

      team.externalProviderId = `sofa_team_${resolvedTeam.id}`;
      await teamRepo.save(team);

      const squadResponse = await fetchSofaTeamPlayers(sofaClient, team, resolvedTeam);
      const squad = squadResponse.players ?? [];
      const seenPlayerIds = new Set<string>();

      for (const entry of squad) {
        const remotePlayer = entry.player;
        if (!remotePlayer?.id || !remotePlayer.name) {
          continue;
        }

        const position = mapSofaPosition(remotePlayer.position);
        const externalProviderId = `sofa_player_${remotePlayer.id}`;
        const exactKey = `${team.id}:${normalizeCompact(remotePlayer.name)}:${position}`;
        const surnameKey = `${team.id}:${getSurname(remotePlayer.name)}:${position}`;

        let player = playersByExternalId.get(externalProviderId)
          ?? playersByExactName.get(exactKey)?.[0]
          ?? playersBySurname.get(surnameKey)?.[0]
          ?? null;

        const existingSeedMatch = WORLD_CUP_2026_FULL_PLAYERS.find((seedPlayer) => (
          seedPlayer.teamCode === team.code
          && seedPlayer.position === position
          && (normalizeCompact(seedPlayer.name) === normalizeCompact(remotePlayer.name)
            || getSurname(seedPlayer.name) === getSurname(remotePlayer.name))
        ));

        const isNewPlayer = !player;
        if (!player) {
          player = playerRepo.create();
          created += 1;
        } else {
          updated += 1;
        }

        const playerEntity = player as PlayerEntity;
        const nextPrice = estimateFantasyPrice({
          position,
          proposedMarketValue: remotePlayer.proposedMarketValue,
          age: estimateAge(remotePlayer.dateOfBirthTimestamp),
          jerseyNumber: toInteger(remotePlayer.shirtNumber),
          existingPrice: existingSeedMatch?.price ?? playerEntity.currentPrice ?? null,
        });

        playerEntity.name = remotePlayer.name.trim();
        playerEntity.shortName = buildShortName(remotePlayer.name, remotePlayer.shortName ?? null);
        playerEntity.position = position;
        playerEntity.team = team;
        playerEntity.externalProviderId = externalProviderId;
        playerEntity.currentPrice = nextPrice;
        playerEntity.isActive = true;
        playerEntity.isInjured = false;
        playerEntity.isSuspended = false;
        playerEntity.minutesPlayed = playerEntity.minutesPlayed ?? 0;
        playerEntity.totalPoints = playerEntity.totalPoints ?? 0;

        const savedPlayer = await playerRepo.save(playerEntity);
        playersByExternalId.set(externalProviderId, savedPlayer);
        seenPlayerIds.add(savedPlayer.id);

        const exactBucket = playersByExactName.get(exactKey) ?? [];
        const exactIndex = exactBucket.findIndex((candidate) => candidate.id === savedPlayer.id);
        if (exactIndex >= 0) {
          exactBucket[exactIndex] = savedPlayer;
        } else {
          exactBucket.push(savedPlayer);
        }
        playersByExactName.set(exactKey, exactBucket);

        const surnameBucket = playersBySurname.get(surnameKey) ?? [];
        const surnameIndex = surnameBucket.findIndex((candidate) => candidate.id === savedPlayer.id);
        if (surnameIndex >= 0) {
          surnameBucket[surnameIndex] = savedPlayer;
        } else {
          surnameBucket.push(savedPlayer);
        }
        playersBySurname.set(surnameKey, surnameBucket);

        const latestPrice = await playerPriceRepo
          .createQueryBuilder('playerPrice')
          .leftJoinAndSelect('playerPrice.player', 'player')
          .where('playerPrice.player_id = :playerId', { playerId: savedPlayer.id })
          .orderBy('playerPrice.effectiveAt', 'DESC')
          .addOrderBy('playerPrice.createdAt', 'DESC')
          .getOne();

        if (isNewPlayer || latestPrice?.price !== nextPrice) {
          await playerPriceRepo.save(
            playerPriceRepo.create({
              player: savedPlayer,
              price: nextPrice,
              effectiveAt: new Date(),
              reason: 'sofascore_world_cup_squad_sync',
            }),
          );
        }
      }

      const teamPlayers = await playerRepo
        .createQueryBuilder('player')
        .leftJoinAndSelect('player.team', 'team')
        .where('player.team_id = :teamId', { teamId: team.id })
        .getMany();
      for (const player of teamPlayers) {
        if (seenPlayerIds.has(player.id)) {
          continue;
        }

        const outcome = await clearStalePlayer({ player, playerRepo });
        if (outcome === 'deleted') {
          deleted += 1;
        } else {
          deactivated += 1;
        }
      }

      console.log(`SofaScore sync finished for ${team.name}: ${squad.length} players.`);
    }

    console.log(`SofaScore World Cup sync completed. created=${created} updated=${updated} deleted=${deleted} deactivated=${deactivated}`);
  } finally {
    await sofaClient.close();
    await appDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('SofaScore World Cup sync failed:', error);
  process.exit(1);
});
