/**
 * Standalone script — Scrapes Egyptian Premier League 2025-2026 from Sofascore
 * (round-by-round + incidents + statistics + lineups + logos), then upserts
 * everything into the DB and exports a JSON snapshot.
 *
 * Run:
 *   npx ts-node --project scripts/tsconfig.scripts.json scripts/sync-egypt-league.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { AppModule } from '../src/app.module';
import { TournamentEntity } from '../src/modules/tournament/entities/tournament.entity';
import { MatchdayEntity, MatchdayStatus } from '../src/modules/tournament/entities/matchday.entity';
import { FixtureEntity } from '../src/modules/tournament/entities/fixture.entity';
import { GroupEntity } from '../src/modules/tournament/entities/group.entity';
import { TeamEntity } from '../src/modules/catalog/entities/team.entity';
import { FixtureStatus, TournamentPhase } from '../src/common/database';

/* ── Config ─────────────────────────────────────────── */

const SOFASCORE_BASE = 'https://www.sofascore.com/api/v1';
const SOFASCORE_IMAGE_BASE = 'https://api.sofascore.app/api/v1';
const THESPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const EGYPT_CATEGORY_ID = 305;
const EGYPT_PREMIER_UNIQUE_TOURNAMENT_ID = 808;
const THESPORTSDB_LEAGUE_ID = 4829;
const TARGET_SEASON_LABEL_FRAGMENT = '25/26';
const THESPORTSDB_SEASON = '2025-2026';
const EGYPT_LEAGUE_MAX_MATCHDAY = 30;
const CUTOFF_DATE = new Date('2026-06-30T23:59:59Z');
const DELAY_MS = 250;

const logger = new Logger('SyncEgyptLeague');

const EGYPTIAN_LEAGUE_CANONICAL_TEAM_NAMES = [
  'Al-Mokawloon al-Arab',
  'Al Ahly',
  'Al Ittihad Alexandria',
  'Al Masry',
  'Arab Contractors FC',
  'Ceramica Cleopatra',
  'El Gouna',
  'ENPPI',
  'Ghazl El Mahalla',
  'Haras El Hodoud',
  'Ismaily',
  'Kahrabaa Ismailia',
  'Modern Sport',
  'National Bank of Egypt',
  'Petrojet',
  'Pharco',
  'Pyramids',
  'Smouha',
  "Tala'ea El Gaish",
  'Wadi Degla',
  'Zamalek',
  'ZED',
] as const;

const EGYPTIAN_LEAGUE_TEAM_ALIASES: Record<string, string> = {
  zamaleksc: 'Zamalek',
  pyramidsfc: 'Pyramids',
  pharcofc: 'Pharco',
  elgounafc: 'El Gouna',
  ghazlelmahallafc: 'Ghazl El Mahalla',
  modernsportfc: 'Modern Sport',
  zedfc: 'ZED',
  alittihadalexandria: 'Al Ittihad Alexandria',
  cleopatrafc: 'Ceramica Cleopatra',
  ismailiaelectricityclub: 'Kahrabaa Ismailia',
  smouhasc: 'Smouha',
  enppiclub: 'ENPPI',
  haraselhodoudclub: 'Haras El Hodoud',
  alahlyfc: 'Al Ahly',
  arabcontractors: 'Arab Contractors FC',
  arabcontractorsfc: 'Arab Contractors FC',
};

const EGYPTIAN_LEAGUE_ALLOWED_TEAM_NAMES = new Set(
  EGYPTIAN_LEAGUE_CANONICAL_TEAM_NAMES.map((name) => normalize(name)),
);

/* ── Sofascore types ─────────────────────────────────── */

type SofaTeam = {
  id: number;
  name: string;
  shortName?: string;
};

type SofaEvent = {
  id: number;
  startTimestamp: number;
  roundInfo?: { round?: number };
  status?: {
    type?: string;
    description?: string;
  };
  homeTeam: SofaTeam;
  awayTeam: SofaTeam;
  homeScore?: { current?: number; display?: number };
  awayScore?: { current?: number; display?: number };
  venue?: { stadium?: { name?: string } };
  time?: { currentPeriodStartTimestamp?: number; initial?: number; max?: number; extra?: number };
};

type SofaSeason = {
  id: number;
  name: string;
  year: string;
};

type SofaIncident = {
  id?: number;
  incidentType?: string;
  incidentClass?: string;
  time?: number;
  addedTime?: number;
  isHome?: boolean;
  player?: { id?: number; name?: string; shortName?: string };
  assist1?: { id?: number; name?: string; shortName?: string };
  playerIn?: { id?: number; name?: string; shortName?: string };
  playerOut?: { id?: number; name?: string; shortName?: string };
  homeScore?: number;
  awayScore?: number;
  reason?: string;
  text?: string;
  [key: string]: unknown;
};

type SofaStatisticsResponse = {
  statistics?: Array<{
    period?: string;
    groups?: Array<{
      groupName?: string;
      statisticsItems?: Array<{
        key?: string;
        name?: string;
        home?: string;
        away?: string;
        homeValue?: number;
        awayValue?: number;
      }>;
    }>;
  }>;
};

type SofaLineupsResponse = {
  confirmed?: boolean;
  home?: {
    formation?: string;
    players?: Array<{
      player?: { id?: number; name?: string; shortName?: string; position?: string; jerseyNumber?: string };
      substitute?: boolean;
    }>;
    supportStaff?: Array<{ name?: string; type?: string }>;
  };
  away?: {
    formation?: string;
    players?: Array<{
      player?: { id?: number; name?: string; shortName?: string; position?: string; jerseyNumber?: string };
      substitute?: boolean;
    }>;
    supportStaff?: Array<{ name?: string; type?: string }>;
  };
};

type ScrapedFixtureDump = {
  externalId: string;
  round: number;
  stageGroupCode: string | null;
  stageGroupLabel: string | null;
  kickoffAt: string;
  status: FixtureStatus;
  homeTeam: { name: string; sofaId: number; logoUrl: string };
  awayTeam: { name: string; sofaId: number; logoUrl: string };
  homeScore: number | null;
  awayScore: number | null;
  venue: string;
  statistics: Record<string, unknown> | null;
  lineups: Record<string, unknown> | null;
};

/* ── Helpers ─────────────────────────────────────────── */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '')
    .trim();
}

function isAllowedEgyptianLeagueTeam(name: string) {
  return canonicalizeEgyptianLeagueTeamName(name) !== null;
}

function canonicalizeEgyptianLeagueTeamName(name: string) {
  const normalized = normalize(name);

  const canonical = EGYPTIAN_LEAGUE_CANONICAL_TEAM_NAMES.find(
    (candidate) => normalize(candidate) === normalized,
  );
  if (canonical) {
    return canonical;
  }

  return EGYPTIAN_LEAGUE_TEAM_ALIASES[normalized] ?? null;
}

function resolveStageGroup(input: { tournamentName?: string | null; round?: number | null }) {
  const normalizedTournamentName = String(input.tournamentName ?? '').toLowerCase();

  if (normalizedTournamentName.includes('championship round')) {
    return {
      code: 'TOP',
      label: 'Championship Group',
    };
  }

  if (normalizedTournamentName.includes('relegation round')) {
    return {
      code: 'REL',
      label: 'Relegation Group',
    };
  }

  if (typeof input.round === 'number' && input.round >= 22) {
    return {
      code: 'REL',
      label: 'Relegation Group',
    };
  }

  return {
    code: null,
    label: null,
  };
}

function mapEgyptLeagueRoundNumber(input: { baseRound: number; stageGroupCode: string | null }) {
  if (input.stageGroupCode === 'TOP' || input.stageGroupCode === 'REL') {
    return 20 + input.baseRound;
  }

  return input.baseRound;
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value.replace('%', '').trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapSofaStatus(statusType?: string): FixtureStatus {
  const s = (statusType ?? '').toLowerCase();
  if (s.includes('finished')) return FixtureStatus.FULL_TIME;
  if (s.includes('halftime')) return FixtureStatus.HALF_TIME;
  if (s.includes('inprogress') || s.includes('live')) return FixtureStatus.LIVE;
  if (s.includes('postponed') || s.includes('cancelled')) return FixtureStatus.POSTPONED;
  return FixtureStatus.SCHEDULED;
}

function mapIncidentToEventType(incidentType?: string, reason?: string): string {
  const t = (incidentType ?? '').toLowerCase();
  const r = (reason ?? '').toLowerCase();

  if (t === 'goal') {
    if (r.includes('own')) return 'own_goal';
    if (r.includes('penalty')) return 'penalty_scored';
    return 'goal';
  }
  if (t === 'card') {
    if (r.includes('red')) return 'red_card';
    return 'yellow_card';
  }
  if (t === 'substitution') return 'substitution';
  if (t === 'penalty') {
    if (r.includes('miss')) return 'penalty_missed';
    return 'penalty_scored';
  }
  if (t === 'var') return 'var_review';
  return t || 'goal';
}

function teamLogoUrl(sofaTeamId: number): string {
  return `${SOFASCORE_IMAGE_BASE}/team/${sofaTeamId}/image`;
}

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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'Africa/Cairo',
    });

    this.page = await this.context.newPage();

    const bootstrapTargets = [
      'https://www.sofascore.com/',
      'https://www.sofascore.com/tournament/football/egypt/premier-league/808',
    ];

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 4; attempt++) {
      for (const target of bootstrapTargets) {
        try {
          await this.page.goto(target, {
            waitUntil: 'domcontentloaded',
            timeout: 120_000,
          });
          await this.page.waitForTimeout(1_500 * attempt);
          return;
        } catch (error) {
          lastError = error;
        }
      }

      await this.page.waitForTimeout(2_000 * attempt);
    }

    throw new Error(`SofaBrowserClient init failed after 4 attempts: ${String(lastError)}`);
  }

  async close() {
    await this.context?.close();
    await this.browser?.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  async requestJson<T>(url: string, attempts = 5): Promise<T> {
    if (!this.page) {
      throw new Error('SofaBrowserClient not initialized.');
    }

    let lastError: unknown = null;

    for (let i = 1; i <= attempts; i++) {
      try {
        const result = await this.page.evaluate(async (apiUrl) => {
          const res = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              Accept: 'application/json, text/plain, */*',
            },
            credentials: 'include',
            cache: 'no-store',
          });

          const text = await res.text();
          return {
            ok: res.ok,
            status: res.status,
            text,
          };
        }, url);

        if (!result.ok) {
          throw new Error(`HTTP ${result.status} while fetching ${url}. Body: ${result.text.slice(0, 200)}`);
        }

        return JSON.parse(result.text) as T;
      } catch (error) {
        lastError = error;
        await this.page.waitForTimeout(1_500 * i);
      }
    }

    throw new Error(`Browser request failed for ${url}: ${String(lastError)}`);
  }
}

async function fetchTheSportsDbRoundAvailability(maxRound = EGYPT_LEAGUE_MAX_MATCHDAY) {
  const availableRounds = new Set<number>();

  for (let round = 1; round <= maxRound; round++) {
    try {
      const response = await fetch(
        `${THESPORTSDB_BASE}/eventsround.php?id=${THESPORTSDB_LEAGUE_ID}&r=${round}&s=${encodeURIComponent(THESPORTSDB_SEASON)}`,
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as { events?: Array<unknown> | null };
      if ((payload.events?.length ?? 0) > 0) {
        availableRounds.add(round);
      }
    } catch {
      continue;
    }
  }

  return availableRounds;
}

function normalizeStatisticsPayload(statsPayload: SofaStatisticsResponse | null, incidents: SofaIncident[] | null) {
  if (!statsPayload && !incidents) return null;

  const allItems = (statsPayload?.statistics ?? [])
    .flatMap((p) => p.groups ?? [])
    .flatMap((g) => g.statisticsItems ?? []);

  const findValue = (keys: string[]) => {
    const item = allItems.find((x) => {
      const key = (x.key ?? x.name ?? '').toLowerCase();
      return keys.some((k) => key.includes(k));
    });
    return {
      home: parseNumeric(item?.homeValue ?? item?.home),
      away: parseNumeric(item?.awayValue ?? item?.away),
    };
  };

  const ballPoss = findValue(['ballpossession', 'possession']);
  const totalShots = findValue(['totalshots']);
  const shotsOnGoal = findValue(['shotsongoal']);
  const shotsOffGoal = findValue(['shotsoffgoal']);
  const corners = findValue(['cornerkicks', 'corners']);
  const offsides = findValue(['offsides']);
  const fouls = findValue(['fouls']);
  const yellows = findValue(['yellowcards']);
  const reds = findValue(['redcards']);
  const totalPasses = findValue(['totalpasses']);
  const accuratePasses = findValue(['passesaccurate', 'accuratepasses']);
  const passPct = findValue(['passes', 'passpercentage']);
  const xg = findValue(['expectedgoals', 'xg']);
  const saves = findValue(['goalkeepersaves', 'saves']);

  const normalizedIncidents = (incidents ?? []).map((inc, idx) => ({
    id: String(inc.id ?? idx),
    minute: inc.time ?? 0,
    addedTime: inc.addedTime ?? null,
    incidentType: inc.incidentType ?? null,
    mappedType: mapIncidentToEventType(inc.incidentType, typeof inc.reason === 'string' ? inc.reason : undefined),
    teamSide: inc.isHome === true ? 'home' : inc.isHome === false ? 'away' : null,
    playerId: inc.player?.id ?? inc.playerIn?.id ?? null,
    playerName: inc.player?.name ?? inc.playerIn?.name ?? null,
    assistId: inc.playerOut?.id ?? inc.assist1?.id ?? null,
    assistName: inc.playerOut?.name ?? inc.assist1?.name ?? null,
    reason: typeof inc.reason === 'string' ? inc.reason : null,
    score: {
      home: typeof inc.homeScore === 'number' ? inc.homeScore : null,
      away: typeof inc.awayScore === 'number' ? inc.awayScore : null,
    },
  }));

  return {
    source: 'sofascore',
    incidents: normalizedIncidents,
    home: {
      ball_possession: ballPoss.home,
      total_shots: totalShots.home,
      shots_on_goal: shotsOnGoal.home,
      shots_off_goal: shotsOffGoal.home,
      corner_kicks: corners.home,
      offsides: offsides.home,
      fouls: fouls.home,
      yellow_cards: yellows.home,
      red_cards: reds.home,
      total_passes: totalPasses.home,
      passes_accurate: accuratePasses.home,
      passes_: passPct.home,
      expected_goals: xg.home,
      goalkeeper_saves: saves.home,
    },
    away: {
      ball_possession: ballPoss.away,
      total_shots: totalShots.away,
      shots_on_goal: shotsOnGoal.away,
      shots_off_goal: shotsOffGoal.away,
      corner_kicks: corners.away,
      offsides: offsides.away,
      fouls: fouls.away,
      yellow_cards: yellows.away,
      red_cards: reds.away,
      total_passes: totalPasses.away,
      passes_accurate: accuratePasses.away,
      passes_: passPct.away,
      expected_goals: xg.away,
      goalkeeper_saves: saves.away,
    },
  };
}

function normalizeLineupsPayload(lineupsPayload: SofaLineupsResponse | null) {
  if (!lineupsPayload?.home || !lineupsPayload?.away) return null;

  const mapTeam = (side: NonNullable<SofaLineupsResponse['home']>) => {
    const players = side.players ?? [];
    const startingXI = players.filter((p) => !p.substitute).map((p) => ({
      id: p.player?.id ?? null,
      name: p.player?.name ?? null,
      number: parseNumeric(p.player?.jerseyNumber) ?? null,
      position: p.player?.position ?? null,
    }));
    const substitutes = players.filter((p) => p.substitute).map((p) => ({
      id: p.player?.id ?? null,
      name: p.player?.name ?? null,
      number: parseNumeric(p.player?.jerseyNumber) ?? null,
      position: p.player?.position ?? null,
    }));
    const coach = side.supportStaff?.find((s) => (s.type ?? '').toLowerCase().includes('manager'))?.name ?? null;

    return {
      formation: side.formation ?? null,
      coach,
      startingXI,
      substitutes,
    };
  };

  return {
    source: 'sofascore',
    confirmed: Boolean(lineupsPayload.confirmed),
    home: mapTeam(lineupsPayload.home),
    away: mapTeam(lineupsPayload.away),
  };
}

/* ── Main ────────────────────────────────────────────── */

async function main() {
  process.env.EXTERNAL_FEED_AUTO_SYNC_ENABLED = 'false';
  logger.log('Bootstrapping NestJS application context…');
  const appCtx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const sofaClient = new SofaBrowserClient();
  await sofaClient.init();

  try {
    const tournamentRepo = appCtx.get<Repository<TournamentEntity>>(getRepositoryToken(TournamentEntity));
    const matchdayRepo = appCtx.get<Repository<MatchdayEntity>>(getRepositoryToken(MatchdayEntity));
    const fixtureRepo = appCtx.get<Repository<FixtureEntity>>(getRepositoryToken(FixtureEntity));
    const teamRepo = appCtx.get<Repository<TeamEntity>>(getRepositoryToken(TeamEntity));
    const groupRepo = appCtx.get<Repository<GroupEntity>>(getRepositoryToken(GroupEntity));

  // 1) Find the Egyptian Premier League tournament in DB
  const tournaments = await tournamentRepo.find();
  const tournament = tournaments.find(
    (t) =>
      t.name.toLowerCase().includes('egypt') ||
      t.name.toLowerCase().includes('مصر') ||
      t.competitionKey === 'egyptian-premier-league-current' ||
      t.externalLeagueId === 233,
  );

  if (!tournament) {
    logger.error('Egyptian Premier League tournament not found in DB. Exiting.');
    await appCtx.close();
    process.exit(1);
  }

  logger.log(`Found tournament: "${tournament.name}" (${tournament.id})`);

  // 2) Resolve season + rounds from Sofascore
  const seasonsPayload = await sofaClient.requestJson<{ seasons: SofaSeason[] }>(
    `${SOFASCORE_BASE}/unique-tournament/${EGYPT_PREMIER_UNIQUE_TOURNAMENT_ID}/seasons`,
  );

  const season = seasonsPayload.seasons.find(
    (s) => s.year?.includes(TARGET_SEASON_LABEL_FRAGMENT) || s.name?.includes(TARGET_SEASON_LABEL_FRAGMENT),
  );

  if (!season) {
    throw new Error(`Could not find Egyptian Premier League season containing "${TARGET_SEASON_LABEL_FRAGMENT}"`);
  }

  logger.log(`Using Sofascore season: ${season.name} (id=${season.id})`);

  const roundsPayload = await sofaClient.requestJson<{
    currentRound?: { round?: number };
    rounds?: Array<{ round?: number }>;
  }>(`${SOFASCORE_BASE}/unique-tournament/${EGYPT_PREMIER_UNIQUE_TOURNAMENT_ID}/season/${season.id}/rounds`);

  const currentRound = roundsPayload.currentRound?.round ?? 1;
  const sofaRounds = (roundsPayload.rounds ?? [])
    .map((r) => r.round ?? 0)
    .filter((r) => r > 0)
    .sort((a, b) => a - b);

  const theSportsDbAvailableRounds = await fetchTheSportsDbRoundAvailability();
  const providerMaxRound = Math.max(
    currentRound,
    ...Array.from(theSportsDbAvailableRounds.values()),
  );
  const rounds = sofaRounds.filter((r) => r <= providerMaxRound);

  if (rounds.length === 0) {
    throw new Error('No rounds returned from Sofascore for target season.');
  }

  logger.log(`Rounds to sync: 1..${Math.max(...rounds)} (sofaCurrent=${currentRound}, providerMax=${providerMaxRound})`);

  // 3) Load all teams for this tournament
  const dbTeams = await teamRepo.find({
    where: { tournament: { id: tournament.id } },
    relations: { tournament: true },
  });

  const unwantedTeams = dbTeams.filter((team) => !isAllowedEgyptianLeagueTeam(team.name));
  if (unwantedTeams.length > 0) {
    logger.warn(`Keeping ${unwantedTeams.length} foreign teams untouched in DB, but excluding them from Egyptian League sync scope`);
  }

  const sanitizedDbTeams = dbTeams.filter((team) => isAllowedEgyptianLeagueTeam(team.name));
  logger.log(`Loaded ${sanitizedDbTeams.length} Egyptian League teams from DB`);

  // Build lookup maps
  const teamByNorm = new Map<string, TeamEntity>();
  for (const team of sanitizedDbTeams) {
    for (const field of [team.name, team.shortName, team.code]) {
      if (field) teamByNorm.set(normalize(field), team);
    }
    if (team.externalProviderId) teamByNorm.set(team.externalProviderId, team);
  }

  // 4) Load existing matchdays
  const existingMatchdays = await matchdayRepo.find({
    where: { tournament: { id: tournament.id } },
  });
  const matchdayByNumber = new Map<number, MatchdayEntity>();
  for (const md of existingMatchdays) {
    matchdayByNumber.set(md.number, md);
  }

  const existingGroups = await groupRepo.find({
    where: { tournament: { id: tournament.id } },
    relations: { tournament: true },
  });
  const groupByCode = new Map<string, GroupEntity>();
  for (const group of existingGroups) {
    groupByCode.set(group.code, group);
  }

  // 5) Load existing fixtures (by externalProviderId)
  const existingFixtures = await fixtureRepo.find({
    where: { tournament: { id: tournament.id } },
    relations: { matchday: true, homeTeam: true, awayTeam: true },
  });
  const fixtureByExtId = new Map<string, FixtureEntity>();
  const scrapedFixtureIds = new Set<string>();
  const foreignFixtureIds: string[] = [];
  for (const f of existingFixtures) {
    if (f.externalProviderId?.startsWith('sofa_')) {
      fixtureByExtId.set(f.externalProviderId, f);
      scrapedFixtureIds.add(f.id);
      continue;
    }

    foreignFixtureIds.push(f.id);
  }

  if (foreignFixtureIds.length > 0) {
    logger.warn(`Deleting ${foreignFixtureIds.length} non-scraped fixtures from Egyptian League tournament`);
    await fixtureRepo
      .createQueryBuilder()
      .delete()
      .from(FixtureEntity)
      .where('id IN (:...ids)', { ids: foreignFixtureIds })
      .execute();
  }

  // Stats
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let teamsCreated = 0;
  const scrapedDump: ScrapedFixtureDump[] = [];
  const seenExternalIds = new Set<string>();

  /* ── Inner helpers ─── */

  function resolveTeamSync(
    name: string,
    tsdbId: string,
    badgeUrl: string,
  ): TeamEntity | null {
    const canonicalName = canonicalizeEgyptianLeagueTeamName(name);
    if (!canonicalName) {
      return null;
    }

    // Try by Sofascore external ID first
    const byExtId = teamByNorm.get(tsdbId);
    if (byExtId) return byExtId;

    // Try by normalized name
    const normName = normalize(canonicalName);
    const byName = teamByNorm.get(normName);
    if (byName) {
      if (!byName.externalProviderId) {
        byName.externalProviderId = tsdbId;
        if (badgeUrl && !byName.flagUrl) byName.flagUrl = badgeUrl;
        void teamRepo.save(byName);
        teamByNorm.set(tsdbId, byName);
      }
      return byName;
    }

    // Partial match
    for (const team of sanitizedDbTeams) {
      const candidates = [team.name, team.shortName, team.code].filter(Boolean).map(normalize);
      if (candidates.some((c) => c.includes(normName) || normName.includes(c))) {
        if (!team.externalProviderId) {
          team.externalProviderId = tsdbId;
          if (badgeUrl && !team.flagUrl) team.flagUrl = badgeUrl;
          void teamRepo.save(team);
        }
        teamByNorm.set(tsdbId, team);
        teamByNorm.set(normName, team);
        return team;
      }
    }

    return null;
  }

  async function autoCreateTeam(
    name: string,
    tsdbId: string,
    badgeUrl: string,
  ): Promise<TeamEntity> {
    const canonicalName = canonicalizeEgyptianLeagueTeamName(name);
    if (!canonicalName) {
      throw new Error(`Refusing to create non-Egyptian-league team: ${name}`);
    }

    logger.warn(`  Auto-creating team: "${canonicalName}" (tsdb=${tsdbId})`);
    const safeShortName = canonicalName.length > 12 ? canonicalName.substring(0, 12) : canonicalName;
    const compact = canonicalName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const safeCode = (compact.substring(0, 3) || 'TBD').padEnd(3, 'X').substring(0, 12);
    let team = teamRepo.create({
      name: canonicalName,
      shortName: safeShortName,
      code: safeCode,
      flagUrl: badgeUrl || null,
      externalProviderId: tsdbId,
      isEliminated: false,
      tournament,
      group: null,
    });
    team = await teamRepo.save(team);
    sanitizedDbTeams.push(team);
    teamByNorm.set(tsdbId, team);
    teamByNorm.set(normalize(canonicalName), team);
    teamsCreated++;
    return team;
  }

  async function resolveOrCreateStageGroup(code: string | null, label: string | null) {
    if (!code || !label) {
      return null;
    }

    const existing = groupByCode.get(code);
    if (existing) {
      if (existing.label !== label) {
        existing.label = label;
        await groupRepo.save(existing);
      }
      return existing;
    }

    let group = groupRepo.create({
      code,
      label,
      displayOrder: code === 'TOP' ? 1 : 2,
      tournament,
    });

    group = await groupRepo.save(group);
    groupByCode.set(code, group);
    return group;
  }

  // 6) Fetch round by round from Sofascore
  for (const round of rounds) {
    const url = `${SOFASCORE_BASE}/unique-tournament/${EGYPT_PREMIER_UNIQUE_TOURNAMENT_ID}/season/${season.id}/events/round/${round}`;
    let events: SofaEvent[] = [];

    try {
      const json = await sofaClient.requestJson<{ events: SofaEvent[] | null }>(url);
      events = json.events ?? [];
    } catch (err) {
      logger.warn(`Failed to fetch round ${round}: ${err}`);
      continue;
    }

    if (events.length === 0) {
      logger.log(`Round ${round}: empty`);
      continue;
    }

    // Filter by cutoff date
    const filtered = events.filter((ev) => {
      const d = new Date(ev.startTimestamp * 1000);
      return d <= CUTOFF_DATE;
    });

    logger.log(`Round ${round}: ${events.length} total events, ${filtered.length} within cutoff`);

    const representativeStageGroup = resolveStageGroup({
      tournamentName: (filtered[0] as unknown as { tournament?: { name?: string | null } }).tournament?.name ?? null,
      round,
    });
    const effectiveRoundNumber = mapEgyptLeagueRoundNumber({
      baseRound: round,
      stageGroupCode: representativeStageGroup.code,
    });

    if (effectiveRoundNumber > EGYPT_LEAGUE_MAX_MATCHDAY) {
      logger.log(
        `Round ${round}: skipping effective round ${effectiveRoundNumber} because it exceeds max matchday ${EGYPT_LEAGUE_MAX_MATCHDAY}`,
      );
      continue;
    }

    // Ensure matchday exists
    let matchday = matchdayByNumber.get(effectiveRoundNumber);
    if (!matchday) {
      // Find the earliest kickoff in this round for the deadline
      const kickoffs = filtered
        .map((ev) => new Date(ev.startTimestamp * 1000))
        .sort((a, b) => a.getTime() - b.getTime());
      const earliest = kickoffs[0] ?? new Date();

      matchday = matchdayRepo.create({
        number: effectiveRoundNumber,
        phase: TournamentPhase.REGULAR_SEASON,
        status: MatchdayStatus.OPEN,
        deadlineAt: earliest,
        opensAt: null,
        locksAt: earliest,
        tournament,
      });
      matchday = await matchdayRepo.save(matchday);
      matchdayByNumber.set(effectiveRoundNumber, matchday);
      logger.log(`  Created matchday ${effectiveRoundNumber}`);
    }

    // Upsert each event as a fixture
    for (const ev of filtered) {
      const externalId = `sofa_${ev.id}`;
      const kickoffAt = new Date(ev.startTimestamp * 1000);
      const status = mapSofaStatus(ev.status?.type);
      const homeScore = ev.homeScore?.current ?? ev.homeScore?.display ?? null;
      const awayScore = ev.awayScore?.current ?? ev.awayScore?.display ?? null;
      const venue = ev.venue?.stadium?.name ?? '';
      const homeSofaId = String(ev.homeTeam.id);
      const awaySofaId = String(ev.awayTeam.id);
      const homeLogo = teamLogoUrl(ev.homeTeam.id);
      const awayLogo = teamLogoUrl(ev.awayTeam.id);
      const stageGroup = resolveStageGroup({
        tournamentName: (ev as unknown as { tournament?: { name?: string | null } }).tournament?.name ?? null,
        round: ev.roundInfo?.round ?? null,
      });
      const effectiveFixtureRound = mapEgyptLeagueRoundNumber({
        baseRound: ev.roundInfo?.round ?? round,
        stageGroupCode: stageGroup.code,
      });

      if (effectiveFixtureRound > EGYPT_LEAGUE_MAX_MATCHDAY) {
        logger.log(
          `  Skipping event ${ev.id}: effective round ${effectiveFixtureRound} exceeds max matchday ${EGYPT_LEAGUE_MAX_MATCHDAY}`,
        );
        continue;
      }

      seenExternalIds.add(externalId);

      const canonicalHomeTeamName = canonicalizeEgyptianLeagueTeamName(ev.homeTeam.name);
      const canonicalAwayTeamName = canonicalizeEgyptianLeagueTeamName(ev.awayTeam.name);

      if (!canonicalHomeTeamName || !canonicalAwayTeamName) {
        logger.warn(`  Skipping event ${ev.id}: non-Egyptian league teams detected (${ev.homeTeam.name} vs ${ev.awayTeam.name})`);
        totalSkipped++;
        continue;
      }

      // Resolve teams (auto-create if needed)
      let homeTeam = resolveTeamSync(canonicalHomeTeamName, homeSofaId, homeLogo);
      let awayTeam = resolveTeamSync(canonicalAwayTeamName, awaySofaId, awayLogo);

      if (!homeTeam) {
        homeTeam = await autoCreateTeam(canonicalHomeTeamName, homeSofaId, homeLogo);
      }
      if (!awayTeam) {
        awayTeam = await autoCreateTeam(canonicalAwayTeamName, awaySofaId, awayLogo);
      }

      if (!homeTeam || !awayTeam) {
        logger.warn(`  Skipping event ${ev.id}: could not resolve teams (home=${!!homeTeam}, away=${!!awayTeam})`);
        totalSkipped++;
        continue;
      }

      const group = await resolveOrCreateStageGroup(stageGroup.code, stageGroup.label);
      let matchday = matchdayByNumber.get(effectiveFixtureRound);
      if (!matchday) {
        matchday = matchdayRepo.create({
          number: effectiveFixtureRound,
          phase: TournamentPhase.REGULAR_SEASON,
          status: MatchdayStatus.OPEN,
          deadlineAt: kickoffAt,
          opensAt: null,
          locksAt: kickoffAt,
          tournament,
        });
        matchday = await matchdayRepo.save(matchday);
        matchdayByNumber.set(effectiveFixtureRound, matchday);
        logger.log(`  Created stage matchday ${effectiveFixtureRound}`);
      }

      // Keep team logo up-to-date
      if (homeLogo && homeTeam.flagUrl !== homeLogo) {
        homeTeam.flagUrl = homeLogo;
        await teamRepo.save(homeTeam);
      }
      if (awayLogo && awayTeam.flagUrl !== awayLogo) {
        awayTeam.flagUrl = awayLogo;
        await teamRepo.save(awayTeam);
      }

      // Fetch details (incidents, statistics, lineups)
      let incidents: SofaIncident[] | null = null;
      let statsPayload: SofaStatisticsResponse | null = null;
      let lineupsPayload: SofaLineupsResponse | null = null;

      try {
        const detailEventId = ev.id;
        const [incidentsResp, statsResp, lineupsResp] = await Promise.all([
          sofaClient
            .requestJson<{ incidents?: SofaIncident[] }>(`${SOFASCORE_BASE}/event/${detailEventId}/incidents`)
            .catch(() => ({ incidents: [] })),
          sofaClient
            .requestJson<SofaStatisticsResponse>(`${SOFASCORE_BASE}/event/${detailEventId}/statistics`)
            .catch(() => ({ statistics: [] })),
          sofaClient
            .requestJson<SofaLineupsResponse>(`${SOFASCORE_BASE}/event/${detailEventId}/lineups`)
            .catch(() => ({ home: undefined, away: undefined })),
        ]);

        incidents = incidentsResp.incidents ?? [];
        statsPayload = statsResp;
        lineupsPayload = lineupsResp;
      } catch (err) {
        logger.warn(`  Detail fetch failed for event ${ev.id}: ${String(err)}`);
      }

      const normalizedStatistics = normalizeStatisticsPayload(statsPayload, incidents);
      const normalizedLineups = normalizeLineupsPayload(lineupsPayload);

      // Check if fixture already exists
      let fixture = fixtureByExtId.get(externalId);

      if (fixture) {
        // Update
        let changed = false;
        if (fixture.status !== status) { fixture.status = status; changed = true; }
        if (fixture.homeScore !== homeScore) { fixture.homeScore = homeScore; changed = true; }
        if (fixture.awayScore !== awayScore) { fixture.awayScore = awayScore; changed = true; }
        if (fixture.venue !== venue && venue) { fixture.venue = venue; changed = true; }
        if (!fixture.matchday || fixture.matchday.id !== matchday.id) { fixture.matchday = matchday; changed = true; }
        if ((fixture.group?.id ?? null) !== (group?.id ?? null)) { fixture.group = group; changed = true; }
        if (fixture.kickoffAt.getTime() !== kickoffAt.getTime()) { fixture.kickoffAt = kickoffAt; changed = true; }
        if (normalizedStatistics) { fixture.statistics = normalizedStatistics; changed = true; }
        if (normalizedLineups) { fixture.lineups = normalizedLineups; changed = true; }
        fixture.currentMinute = status === FixtureStatus.LIVE ? ev.time?.initial ?? null : null;

        if (changed) {
          await fixtureRepo.save(fixture);
          totalUpdated++;
        }
      } else {
        // Create
        fixture = fixtureRepo.create({
          phase: TournamentPhase.REGULAR_SEASON,
          status,
          kickoffAt,
          venue: venue || 'TBD',
          homeScore,
          awayScore,
          currentMinute: null,
          externalProviderId: externalId,
          statistics: normalizedStatistics,
          lineups: normalizedLineups,
          tournament,
          matchday,
          group,
          homeTeam,
          awayTeam,
        });
        fixture.currentMinute = status === FixtureStatus.LIVE ? ev.time?.initial ?? null : null;
        fixture = await fixtureRepo.save(fixture);
        fixtureByExtId.set(externalId, fixture);
        totalCreated++;
      }

      scrapedDump.push({
        externalId,
        round: effectiveFixtureRound,
        stageGroupCode: stageGroup.code,
        stageGroupLabel: stageGroup.label,
        kickoffAt: kickoffAt.toISOString(),
        status,
        homeTeam: { name: canonicalHomeTeamName, sofaId: ev.homeTeam.id, logoUrl: homeLogo },
        awayTeam: { name: canonicalAwayTeamName, sofaId: ev.awayTeam.id, logoUrl: awayLogo },
        homeScore,
        awayScore,
        venue: venue || 'TBD',
        statistics: normalizedStatistics,
        lineups: normalizedLineups,
      });

      await sleep(DELAY_MS);
    }
  }

  const staleScrapedFixtureIds = existingFixtures
    .filter((fixture) => fixture.externalProviderId?.startsWith('sofa_'))
    .filter((fixture) => !seenExternalIds.has(fixture.externalProviderId!))
    .map((fixture) => fixture.id);

  if (staleScrapedFixtureIds.length > 0) {
    logger.warn(`Deleting ${staleScrapedFixtureIds.length} stale scraped fixtures that no longer exist in Sofascore`);
    await fixtureRepo
      .createQueryBuilder()
      .delete()
      .from(FixtureEntity)
      .where('id IN (:...ids)', { ids: staleScrapedFixtureIds })
      .execute();
  }

  const overflowFixtureIds = await fixtureRepo
    .createQueryBuilder('fixture')
    .leftJoin('fixture.matchday', 'matchday')
    .where('fixture.tournament_id = :tournamentId', { tournamentId: tournament.id })
    .andWhere('fixture.deleted_at IS NULL')
    .andWhere('matchday.number > :maxMatchday', { maxMatchday: EGYPT_LEAGUE_MAX_MATCHDAY })
    .select('fixture.id', 'id')
    .getRawMany<{ id: string }>();

  if (overflowFixtureIds.length > 0) {
    logger.warn(
      `Deleting ${overflowFixtureIds.length} overflow fixtures assigned beyond matchday ${EGYPT_LEAGUE_MAX_MATCHDAY}`,
    );
    await fixtureRepo
      .createQueryBuilder()
      .delete()
      .from(FixtureEntity)
      .where('id IN (:...ids)', { ids: overflowFixtureIds.map((fixture) => fixture.id) })
      .execute();
  }

  const remainingForeignFixtures = await fixtureRepo.find({
    where: { tournament: { id: tournament.id } },
    relations: { tournament: true },
  });

  const remainingForeignFixtureIds = remainingForeignFixtures
    .filter((fixture) => !fixture.externalProviderId?.startsWith('sofa_'))
    .map((fixture) => fixture.id);

  if (remainingForeignFixtureIds.length > 0) {
    logger.warn(`Final cleanup deleting ${remainingForeignFixtureIds.length} remaining non-scraped fixtures`);
    await fixtureRepo
      .createQueryBuilder()
      .delete()
      .from(FixtureEntity)
      .where('id IN (:...ids)', { ids: remainingForeignFixtureIds })
      .execute();
  }

  const refreshedMatchdays = await matchdayRepo.find({
    where: { tournament: { id: tournament.id } },
    relations: { fixtures: true },
  });

  const emptyMatchdayIds = refreshedMatchdays
    .filter((matchday) => (matchday.fixtures?.length ?? 0) === 0)
    .map((matchday) => matchday.id);

  if (emptyMatchdayIds.length > 0) {
    logger.warn(`Deleting ${emptyMatchdayIds.length} empty matchdays after scraping cleanup`);
    await matchdayRepo
      .createQueryBuilder()
      .delete()
      .from(MatchdayEntity)
      .where('id IN (:...ids)', { ids: emptyMatchdayIds })
      .execute();
  }

  // 7) Export JSON snapshot
  const outDir = join(process.cwd(), 'scripts', 'outputs');
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, 'egypt-premier-league-25-26-sofascore.json');
  await writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: 'sofascore',
        categoryId: EGYPT_CATEGORY_ID,
        uniqueTournamentId: EGYPT_PREMIER_UNIQUE_TOURNAMENT_ID,
        seasonId: season.id,
        cutoffDate: CUTOFF_DATE.toISOString(),
        fixtures: scrapedDump,
      },
      null,
      2,
    ),
    'utf8',
  );

  logger.log(`JSON export written: ${outPath}`);

  logger.log('');
  logger.log('═══════════════════════════════════════');
  logger.log(`  SYNC COMPLETE`);
  logger.log(`  Created:  ${totalCreated} fixtures`);
  logger.log(`  Updated:  ${totalUpdated} fixtures`);
  logger.log(`  Skipped:  ${totalSkipped} fixtures`);
  logger.log(`  Teams created: ${teamsCreated}`);
  logger.log('═══════════════════════════════════════');

    await sofaClient.close();
    await appCtx.close();
    process.exit(0);
  } catch (error) {
    await sofaClient.close();
    await appCtx.close();
    throw error;
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
