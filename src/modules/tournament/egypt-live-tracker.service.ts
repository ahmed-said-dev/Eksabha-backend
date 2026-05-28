import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { FixtureStatus } from '../../common/database';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { EgyptLiveStateService } from './egypt-live-state.service';
import { FixtureEntity } from './entities/fixture.entity';

const SOFASCORE_BASE = 'https://www.sofascore.com/api/v1';
const EGYPTIAN_PREMIER_LEAGUE_COMPETITION_KEY = 'egyptian-premier-league-current';
const CANDIDATE_WINDOW_BEFORE_KICKOFF_MS = 15 * 60 * 1000;
const CANDIDATE_WINDOW_AFTER_KICKOFF_MS = 4 * 60 * 60 * 1000;
const MISSED_FIXTURE_CATCHUP_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
const LIVE_FIXTURE_STALE_AFTER_MS = 4 * 60 * 60 * 1000;
const LIVE_STATISTICS_REFRESH_MS = 45 * 1000;
const LINEUPS_LOOKAHEAD_MS = 90 * 60 * 1000;
const LINEUPS_REFRESH_MS = 90 * 1000;
const CONFIRMED_LINEUPS_REFRESH_MS = 15 * 60 * 1000;

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

type SofaEventSummaryResponse = {
  event?: {
    id?: number;
    status?: {
      type?: string;
      description?: string;
    };
    homeScore?: { current?: number; display?: number };
    awayScore?: { current?: number; display?: number };
    time?: {
      currentPeriodStartTimestamp?: number;
      initial?: number;
      max?: number;
      extra?: number;
    };
  };
};

type SofaLineupsResponse = {
  confirmed?: boolean;
  home?: {
    formation?: string | null;
    players?: Array<{
      player?: { id?: number; name?: string; shortName?: string; position?: string; jerseyNumber?: string };
      substitute?: boolean;
    }>;
    supportStaff?: Array<{ name?: string; type?: string }>;
  };
  away?: {
    formation?: string | null;
    players?: Array<{
      player?: { id?: number; name?: string; shortName?: string; position?: string; jerseyNumber?: string };
      substitute?: boolean;
    }>;
    supportStaff?: Array<{ name?: string; type?: string }>;
  };
};

type FixtureRefreshSnapshot = {
  incidentsHash: string | null;
  statisticsHash: string | null;
  lineupsHash: string | null;
  lastStatisticsSyncAt: number | null;
  lastLineupsSyncAt: number | null;
};

type FixtureResultFields = {
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  currentMinute: number | null;
};

type FixtureResultSyncStatus = 'updated' | 'unchanged' | 'skipped' | 'failed';

type FixtureResultSyncEntry = {
  fixtureId: string;
  externalProviderId: string | null;
  status: FixtureResultSyncStatus;
  reason?: string;
  before?: FixtureResultFields;
  after?: FixtureResultFields;
};

type FixtureResultSyncSummary = {
  requestedFixtures: number;
  processedFixtures: number;
  updatedFixtures: number;
  unchangedFixtures: number;
  skippedFixtures: number;
  failedFixtures: number;
  fixtureIds: string[];
  updatedFixtureIds: string[];
  unchangedFixtureIds: string[];
  skippedFixtureIds: string[];
  failedFixtureIds: string[];
  fixtures: FixtureResultSyncEntry[];
};

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value.replace('%', '').trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

function normalizeIncidents(incidents: SofaIncident[] | null) {
  return (incidents ?? []).map((inc, idx) => ({
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
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return { ...(value as Record<string, unknown>) };
}

function sortForStableHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortForStableHash(entry));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortForStableHash((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function buildPayloadHash(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.stringify(sortForStableHash(value));
}

function extractIncidentsFromStatistics(value: unknown) {
  const statistics = asObjectRecord(value);
  const incidents = statistics?.incidents;
  return Array.isArray(incidents) ? incidents.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object') : [];
}

function mergeIncidentsIntoStatistics(
  statistics: Record<string, unknown> | null,
  incidents: Array<Record<string, unknown>>,
) {
  if (!statistics && incidents.length === 0) {
    return null;
  }

  return {
    source: 'sofascore-live',
    ...(statistics ?? {}),
    incidents,
  };
}

function hasConfirmedLineups(lineups: Record<string, unknown> | null) {
  return Boolean(lineups && typeof lineups.confirmed === 'boolean' && lineups.confirmed);
}

function mapSofaStatus(statusType?: string | null, fallbackDescription?: string | null): FixtureStatus {
  const normalized = `${statusType ?? ''} ${fallbackDescription ?? ''}`.trim().toLowerCase();

  if (normalized.includes('finished') || normalized.includes('after penalties') || normalized.includes('ft')) {
    return FixtureStatus.FULL_TIME;
  }

  if (normalized.includes('halftime') || normalized.includes('half time') || normalized.includes('break')) {
    return FixtureStatus.HALF_TIME;
  }

  if (normalized.includes('inprogress') || normalized.includes('live') || normalized.includes('playing')) {
    return FixtureStatus.LIVE;
  }

  if (normalized.includes('postponed') || normalized.includes('cancelled')) {
    return FixtureStatus.POSTPONED;
  }

  return FixtureStatus.SCHEDULED;
}

function resolveCurrentMinute(
  event: SofaEventSummaryResponse['event'] | null | undefined,
  latestIncident: SofaIncident | null,
  previousMinute: number | null,
) {
  if (typeof latestIncident?.time === 'number') {
    return latestIncident.time;
  }

  if (typeof event?.time?.initial === 'number' && typeof event?.time?.currentPeriodStartTimestamp === 'number') {
    const startedAt = event.time.currentPeriodStartTimestamp * 1000;
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60_000));
    return Math.max(event.time.initial, elapsedMinutes + event.time.initial);
  }

  return previousMinute;
}

function normalizeStatusForStaleness(input: {
  kickoffAt: Date;
  now: number;
  nextStatus: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
}) {
  const isPotentiallyStaleLiveStatus = [FixtureStatus.SCHEDULED, FixtureStatus.LIVE, FixtureStatus.HALF_TIME].includes(input.nextStatus);
  const hasResolvedScore = input.homeScore !== null && input.awayScore !== null;
  const isPastStaleWindow = input.kickoffAt.getTime() + LIVE_FIXTURE_STALE_AFTER_MS <= input.now;

  if (isPotentiallyStaleLiveStatus && hasResolvedScore && isPastStaleWindow) {
    return FixtureStatus.FULL_TIME;
  }

  return input.nextStatus;
}

function hasCompletedMatchSignal(input: {
  kickoffAt: Date;
  now: number;
  incidents: SofaIncident[];
  homeScore: number | null;
  awayScore: number | null;
}) {
  const hasResolvedScore = input.homeScore !== null && input.awayScore !== null;
  if (!hasResolvedScore) {
    return false;
  }

  const hasNinetyMinuteIncident = input.incidents.some((incident) => typeof incident.time === 'number' && incident.time >= 90);
  const hasFullTimePeriodIncident = input.incidents.some((incident) =>
    incident.incidentType === 'period' && typeof incident.time === 'number' && incident.time >= 90,
  );
  const isPastStaleWindow = input.kickoffAt.getTime() + LIVE_FIXTURE_STALE_AFTER_MS <= input.now;

  return hasNinetyMinuteIncident || hasFullTimePeriodIncident || isPastStaleWindow;
}

function normalizeStatisticsPayload(statsPayload: SofaStatisticsResponse | null, incidents: SofaIncident[] | null) {
  if (!statsPayload && (!incidents || incidents.length === 0)) return null;

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

  const normalizedIncidents = normalizeIncidents(incidents);

  return {
    source: 'sofascore-live',
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
    source: 'sofascore-live',
    confirmed: Boolean(lineupsPayload.confirmed),
    home: mapTeam(lineupsPayload.home),
    away: mapTeam(lineupsPayload.away),
  };
}

export class SofaBrowserClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

  async init() {
    if (this.page) {
      return;
    }

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initInternal().finally(() => {
      this.initPromise = null;
    });

    await this.initPromise;
  }

  private async initInternal() {
    if (this.page) {
      return;
    }

    await this.close();
    this.browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    this.context = await this.browser.newContext({
      userAgent: this.userAgent,
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
          await this.page.waitForTimeout(1_000 * attempt);
          return;
        } catch (error) {
          lastError = error;
        }
      }

      await this.page.waitForTimeout(1_500 * attempt);
    }

    throw new Error(`SofaBrowserClient init failed after 4 attempts: ${String(lastError)}`);
  }

  async close() {
    await this.page?.close().catch(() => undefined);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  async requestJson<T>(url: string, attempts = 5): Promise<T> {
    await this.init();

    if (!this.page) {
      throw new Error('SofaBrowserClient not initialized.');
    }

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const result = await this.page.evaluate(async (apiUrl) => {
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              Accept: 'application/json, text/plain, */*',
            },
            credentials: 'include',
            cache: 'no-store',
          });

          const text = await response.text();
          return {
            ok: response.ok,
            status: response.status,
            text,
          };
        }, url);

        if (!result.ok) {
          throw new Error(`HTTP ${result.status} while fetching ${url}. Body: ${result.text.slice(0, 200)}`);
        }

        return JSON.parse(result.text) as T;
      } catch (error) {
        lastError = error;

        if (attempt === Math.ceil(attempts / 2)) {
          await this.close();
          await this.init();
        } else {
          await this.page.waitForTimeout(1_200 * attempt);
        }
      }
    }

    throw new Error(`Browser request failed for ${url}: ${String(lastError)}`);
  }
}

@Injectable()
export class EgyptLiveTrackerService implements OnModuleDestroy {
  private readonly logger = new Logger(EgyptLiveTrackerService.name);
  private readonly sofaClient = new SofaBrowserClient();
  private refreshQueue: Promise<void> = Promise.resolve();
  private readonly refreshSnapshots = new Map<string, FixtureRefreshSnapshot>();
  private lastLiveTickHash: string | null = null;

  constructor(
    @InjectRepository(FixtureEntity)
    private readonly fixturesRepository: Repository<FixtureEntity>,
    private readonly realtimeEventsService: RealtimeEventsService,
    private readonly egyptLiveStateService: EgyptLiveStateService,
  ) {}

  async onModuleDestroy() {
    this.refreshSnapshots.clear();
    this.lastLiveTickHash = null;
    await this.sofaClient.close();
  }

  private shouldRefreshStatistics(
    snapshot: FixtureRefreshSnapshot | null,
    fixture: FixtureEntity,
    now: number,
  ) {
    const isActiveFixture =
      fixture.status === FixtureStatus.LIVE
      || fixture.status === FixtureStatus.HALF_TIME
      || typeof fixture.currentMinute === 'number';

    if (!isActiveFixture) {
      return false;
    }

    if (!snapshot?.statisticsHash || snapshot.lastStatisticsSyncAt === null) {
      return true;
    }

    return now - snapshot.lastStatisticsSyncAt >= LIVE_STATISTICS_REFRESH_MS;
  }

  private shouldRefreshLineups(
    snapshot: FixtureRefreshSnapshot | null,
    fixture: FixtureEntity,
    lineups: Record<string, unknown> | null,
    now: number,
  ) {
    if (fixture.kickoffAt.getTime() - now > LINEUPS_LOOKAHEAD_MS) {
      return false;
    }

    if (!lineups || snapshot?.lastLineupsSyncAt === null || !snapshot?.lineupsHash) {
      return true;
    }

    const refreshInterval = hasConfirmedLineups(lineups)
      ? CONFIRMED_LINEUPS_REFRESH_MS
      : LINEUPS_REFRESH_MS;

    return now - snapshot.lastLineupsSyncAt >= refreshInterval;
  }

  private enqueueRefresh<T>(operation: () => Promise<T>) {
    const run = this.refreshQueue
      .catch(() => undefined)
      .then(operation);

    this.refreshQueue = run.then(() => undefined, () => undefined);

    return run;
  }

  async refreshLiveFixtures(): Promise<{ updatedFixtures: number; fixtureIds: string[] }> {
    return this.enqueueRefresh(() => this.refreshLiveFixturesInternal());
  }

  async refreshFixturesByIds(
    fixtureIds: string[],
    options?: { forceFullRefresh?: boolean },
  ): Promise<{ updatedFixtures: number; fixtureIds: string[]; skipped?: boolean; reason?: string }> {
    return this.enqueueRefresh(async () => {
      const uniqueFixtureIds = Array.from(new Set(fixtureIds.filter(Boolean)));
      if (uniqueFixtureIds.length === 0) {
        return {
          updatedFixtures: 0,
          fixtureIds: [],
          skipped: true,
          reason: 'No fixture ids were provided.',
        };
      }

      const fixtures = await this.fixturesRepository.find({
        where: { id: In(uniqueFixtureIds) },
        relations: { tournament: true, homeTeam: true, awayTeam: true, matchday: true, group: true },
        order: { kickoffAt: 'ASC' },
      });

      const trackedFixtures = fixtures.filter((fixture) => fixture.externalProviderId?.startsWith('sofa_'));

      if (trackedFixtures.length === 0) {
        return {
          updatedFixtures: 0,
          fixtureIds: [],
          skipped: true,
          reason: 'No scrape-enabled fixtures were found for the requested ids.',
        };
      }

      await this.sofaClient.init();

      const result = await this.refreshTrackedFixtures(trackedFixtures, Date.now(), options);
      const allCompetitionFixtures = await this.loadCompetitionFixtures();
      this.emitLiveTickSnapshot(allCompetitionFixtures);
      return result;
    });
  }

  async syncFixtureResultsByIds(fixtureIds: string[]): Promise<FixtureResultSyncSummary> {
    return this.enqueueRefresh(async () => {
      const uniqueFixtureIds = Array.from(new Set(fixtureIds.filter(Boolean)));
      if (uniqueFixtureIds.length === 0) {
        return this.buildFixtureResultSyncSummary(0, []);
      }

      const fixtures = await this.fixturesRepository.find({
        where: { id: In(uniqueFixtureIds) },
        relations: { tournament: true, homeTeam: true, awayTeam: true, matchday: true, group: true },
        order: { kickoffAt: 'ASC' },
      });

      const outcomes: FixtureResultSyncEntry[] = [];
      const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

      for (const fixtureId of uniqueFixtureIds) {
        if (fixturesById.has(fixtureId)) {
          continue;
        }

        outcomes.push({
          fixtureId,
          externalProviderId: null,
          status: 'failed',
          reason: 'Fixture not found.',
        });
      }

      const scrapeEnabledFixtures = fixtures.filter((fixture) => fixture.externalProviderId?.startsWith('sofa_'));

      for (const fixture of fixtures) {
        if (fixture.externalProviderId?.startsWith('sofa_')) {
          continue;
        }

        outcomes.push({
          fixtureId: fixture.id,
          externalProviderId: fixture.externalProviderId ?? null,
          status: 'skipped',
          reason: 'Fixture is not linked to a SofaScore provider id.',
        });
      }

      if (scrapeEnabledFixtures.length === 0) {
        return this.buildFixtureResultSyncSummary(uniqueFixtureIds.length, outcomes);
      }

      await this.sofaClient.init();

      for (const fixture of scrapeEnabledFixtures) {
        outcomes.push(await this.syncSingleFixtureResult(fixture));
      }

      const allCompetitionFixtures = await this.loadCompetitionFixtures();
      this.emitLiveTickSnapshot(allCompetitionFixtures);

      return this.buildFixtureResultSyncSummary(uniqueFixtureIds.length, outcomes);
    });
  }

  private loadCompetitionFixtures() {
    return this.fixturesRepository.find({
      where: { tournament: { competitionKey: EGYPTIAN_PREMIER_LEAGUE_COMPETITION_KEY } },
      relations: { tournament: true, homeTeam: true, awayTeam: true, matchday: true, group: true },
      order: { kickoffAt: 'ASC' },
    });
  }

  private buildFixtureResultFields(fixture: FixtureEntity): FixtureResultFields {
    return {
      status: fixture.status,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      currentMinute: fixture.currentMinute,
    };
  }

  private buildFixtureResultSyncSummary(
    requestedFixtures: number,
    outcomes: FixtureResultSyncEntry[],
  ): FixtureResultSyncSummary {
    const updatedFixtureIds = outcomes.filter((entry) => entry.status === 'updated').map((entry) => entry.fixtureId);
    const unchangedFixtureIds = outcomes.filter((entry) => entry.status === 'unchanged').map((entry) => entry.fixtureId);
    const skippedFixtureIds = outcomes.filter((entry) => entry.status === 'skipped').map((entry) => entry.fixtureId);
    const failedFixtureIds = outcomes.filter((entry) => entry.status === 'failed').map((entry) => entry.fixtureId);

    return {
      requestedFixtures,
      processedFixtures: outcomes.length,
      updatedFixtures: updatedFixtureIds.length,
      unchangedFixtures: unchangedFixtureIds.length,
      skippedFixtures: skippedFixtureIds.length,
      failedFixtures: failedFixtureIds.length,
      fixtureIds: updatedFixtureIds,
      updatedFixtureIds,
      unchangedFixtureIds,
      skippedFixtureIds,
      failedFixtureIds,
      fixtures: outcomes,
    };
  }

  private async syncSingleFixtureResult(fixture: FixtureEntity): Promise<FixtureResultSyncEntry> {
    const before = this.buildFixtureResultFields(fixture);
    const externalProviderId = fixture.externalProviderId ?? null;

    if (!externalProviderId?.startsWith('sofa_')) {
      return {
        fixtureId: fixture.id,
        externalProviderId,
        status: 'skipped',
        reason: 'Fixture is not linked to a SofaScore provider id.',
        before,
      };
    }

    const eventId = Number(externalProviderId.replace('sofa_', ''));
    if (!Number.isFinite(eventId)) {
      return {
        fixtureId: fixture.id,
        externalProviderId,
        status: 'failed',
        reason: 'Fixture provider id is not a valid SofaScore event id.',
        before,
      };
    }

    try {
      const previousState = this.egyptLiveStateService.getState(fixture.id);
      const previousStatistics = asObjectRecord(previousState?.statistics) ?? asObjectRecord(fixture.statistics);
      const previousLineups = asObjectRecord(previousState?.lineups) ?? asObjectRecord(fixture.lineups);
      const previousIncidentsHash = buildPayloadHash(
        previousState?.incidents ?? extractIncidentsFromStatistics(previousState?.statistics ?? fixture.statistics),
      );
      const previousStatisticsHash = buildPayloadHash(previousState?.statistics ?? fixture.statistics);
      const previousLineupsHash = buildPayloadHash(previousState?.lineups ?? fixture.lineups);

      const eventResp = await this.sofaClient
        .requestJson<SofaEventSummaryResponse>(`${SOFASCORE_BASE}/event/${eventId}`)
        .catch(() => null);
      const eventSummary = eventResp?.event ?? null;

      if (!eventSummary) {
        return {
          fixtureId: fixture.id,
          externalProviderId,
          status: 'failed',
          reason: 'SofaScore event summary is unavailable for this fixture.',
          before,
        };
      }

      const eventStatus = mapSofaStatus(eventSummary.status?.type, eventSummary.status?.description);
      const incidentsResp = await this.sofaClient
        .requestJson<{ incidents?: SofaIncident[] }>(`${SOFASCORE_BASE}/event/${eventId}/incidents`)
        .catch(() => ({ incidents: [] }));
      const incidents = incidentsResp.incidents ?? [];
      const normalizedIncidents = normalizeIncidents(incidents);
      const incidentsHash = buildPayloadHash(normalizedIncidents);
      const latestIncident = incidents.at(-1) ?? null;

      const statsResp = await this.sofaClient
        .requestJson<SofaStatisticsResponse>(`${SOFASCORE_BASE}/event/${eventId}/statistics`)
        .catch(() => null);
      const normalizedStatistics = normalizeStatisticsPayload(statsResp, incidents);

      const lineupsResp = await this.sofaClient
        .requestJson<SofaLineupsResponse>(`${SOFASCORE_BASE}/event/${eventId}/lineups`)
        .catch(() => null);
      const normalizedLineups = normalizeLineupsPayload(lineupsResp);

      const nextStatistics = normalizedStatistics
        ? normalizedStatistics as unknown as Record<string, unknown>
        : mergeIncidentsIntoStatistics(previousStatistics, normalizedIncidents);
      const nextLineups = normalizedLineups
        ? normalizedLineups as unknown as Record<string, unknown>
        : previousLineups;
      const statisticsHash = buildPayloadHash(nextStatistics);
      const lineupsHash = buildPayloadHash(nextLineups);

      const nextCurrentMinute =
        resolveCurrentMinute(eventSummary, latestIncident, previousState?.currentMinute ?? fixture.currentMinute) ?? null;
      const nextHomeScore =
        typeof latestIncident?.homeScore === 'number'
          ? latestIncident.homeScore
          : eventSummary.homeScore?.current ?? eventSummary.homeScore?.display ?? previousState?.homeScore ?? fixture.homeScore;
      const nextAwayScore =
        typeof latestIncident?.awayScore === 'number'
          ? latestIncident.awayScore
          : eventSummary.awayScore?.current ?? eventSummary.awayScore?.display ?? previousState?.awayScore ?? fixture.awayScore;

      let nextStatus = previousState?.status ?? fixture.status;

      if (eventStatus === FixtureStatus.FULL_TIME || eventStatus === FixtureStatus.POSTPONED) {
        nextStatus = eventStatus;
      } else if (hasCompletedMatchSignal({
        kickoffAt: fixture.kickoffAt,
        now: Date.now(),
        incidents,
        homeScore: nextHomeScore ?? null,
        awayScore: nextAwayScore ?? null,
      })) {
        nextStatus = FixtureStatus.FULL_TIME;
      } else if (eventStatus === FixtureStatus.LIVE) {
        nextStatus = FixtureStatus.LIVE;
      } else if (nextCurrentMinute !== null && nextCurrentMinute > 0) {
        nextStatus = FixtureStatus.LIVE;
      } else if (eventStatus === FixtureStatus.HALF_TIME) {
        nextStatus = FixtureStatus.HALF_TIME;
      } else if (eventStatus === FixtureStatus.SCHEDULED) {
        nextStatus = FixtureStatus.SCHEDULED;
      }

      nextStatus = normalizeStatusForStaleness({
        kickoffAt: fixture.kickoffAt,
        now: Date.now(),
        nextStatus,
        homeScore: nextHomeScore ?? null,
        awayScore: nextAwayScore ?? null,
      });

      const normalizedCurrentMinute = nextStatus === FixtureStatus.FULL_TIME || nextStatus === FixtureStatus.POSTPONED
        ? null
        : nextCurrentMinute;

      const after: FixtureResultFields = {
        status: nextStatus,
        homeScore: nextHomeScore ?? null,
        awayScore: nextAwayScore ?? null,
        currentMinute: normalizedCurrentMinute,
      };

      const hasChanged =
        before.status !== after.status
        || before.homeScore !== after.homeScore
        || before.awayScore !== after.awayScore
        || before.currentMinute !== after.currentMinute
        || previousIncidentsHash !== incidentsHash
        || previousStatisticsHash !== statisticsHash
        || previousLineupsHash !== lineupsHash;

      if (hasChanged) {
        fixture.status = after.status;
        fixture.homeScore = after.homeScore;
        fixture.awayScore = after.awayScore;
        fixture.currentMinute = after.currentMinute;
        fixture.statistics = nextStatistics;
        fixture.lineups = nextLineups;
        await this.fixturesRepository.save(fixture);

        this.realtimeEventsService.emitFixtureUpdated({
          fixtureId: fixture.id,
          status: after.status,
          homeScore: after.homeScore,
          awayScore: after.awayScore,
          currentMinute: after.currentMinute,
        });

        if (
          previousIncidentsHash !== incidentsHash
          || previousStatisticsHash !== statisticsHash
          || previousLineupsHash !== lineupsHash
        ) {
          this.realtimeEventsService.emitFixtureEvent({
            fixtureId: fixture.id,
            events: normalizedIncidents,
            statistics: nextStatistics,
            lineups: nextLineups,
          });
        }
      }

      this.egyptLiveStateService.setState({
        fixtureId: fixture.id,
        status: after.status,
        currentMinute: after.currentMinute,
        homeScore: after.homeScore,
        awayScore: after.awayScore,
        statistics: nextStatistics,
        lineups: nextLineups,
        incidents: normalizedIncidents,
      });

      return {
        fixtureId: fixture.id,
        externalProviderId,
        status: hasChanged ? 'updated' : 'unchanged',
        reason: hasChanged ? undefined : 'No fixture result changes were detected.',
        before,
        after,
      };
    } catch (error) {
      return {
        fixtureId: fixture.id,
        externalProviderId,
        status: 'failed',
        reason: `Result sync failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        before,
      };
    }
  }

  private async refreshLiveFixturesInternal(): Promise<{ updatedFixtures: number; fixtureIds: string[] }> {
    const fixtures = await this.loadCompetitionFixtures();

    const now = Date.now();
    const candidateFixtures = fixtures.filter((fixture) => {
      if (!fixture.externalProviderId?.startsWith('sofa_')) {
        return false;
      }

      const kickoffAt = fixture.kickoffAt.getTime();
      const diff = now - kickoffAt;

      const withinRegularWindow =
        diff >= -CANDIDATE_WINDOW_BEFORE_KICKOFF_MS
        && diff <= CANDIDATE_WINDOW_AFTER_KICKOFF_MS;

      const needsCatchupRefresh =
        fixture.status === FixtureStatus.SCHEDULED
        && diff > CANDIDATE_WINDOW_AFTER_KICKOFF_MS
        && diff <= MISSED_FIXTURE_CATCHUP_WINDOW_MS;

      return withinRegularWindow || needsCatchupRefresh;
    });

    const staleLiveFixtures = fixtures.filter((fixture) => {
      const kickoffAt = fixture.kickoffAt.getTime();
      const diff = now - kickoffAt;
      return (
        (fixture.status === FixtureStatus.LIVE || fixture.status === FixtureStatus.HALF_TIME)
        && diff > LIVE_FIXTURE_STALE_AFTER_MS
      );
    });

    for (const fixture of staleLiveFixtures) {
      fixture.status = FixtureStatus.FULL_TIME;
      fixture.currentMinute = null;
      this.egyptLiveStateService.clearState(fixture.id);
      this.refreshSnapshots.delete(fixture.id);
      await this.fixturesRepository.save(fixture);

      this.realtimeEventsService.emitFixtureUpdated({
        fixtureId: fixture.id,
        status: fixture.status,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        currentMinute: fixture.currentMinute,
      });
    }

    if (candidateFixtures.length === 0) {
      this.emitLiveTickSnapshot(fixtures);
      return { updatedFixtures: 0, fixtureIds: [] };
    }

    await this.sofaClient.init();

    const result = await this.refreshTrackedFixtures(candidateFixtures, now);
    this.emitLiveTickSnapshot(fixtures);

    return result;
  }

  private async refreshTrackedFixtures(
    candidateFixtures: FixtureEntity[],
    now: number,
    options?: { forceFullRefresh?: boolean },
  ): Promise<{ updatedFixtures: number; fixtureIds: string[] }> {
    const updatedFixtureIds: string[] = [];

    for (const fixture of candidateFixtures) {
      const externalProviderId = fixture.externalProviderId;
      if (!externalProviderId) {
        continue;
      }

      const eventId = Number(externalProviderId.replace('sofa_', ''));
      if (!Number.isFinite(eventId)) {
        continue;
      }

      try {
        const previousState = this.egyptLiveStateService.getState(fixture.id);
        const previousSnapshot = this.refreshSnapshots.get(fixture.id) ?? null;
        const previousIncidentsHash = previousSnapshot?.incidentsHash
          ?? buildPayloadHash(previousState?.incidents ?? extractIncidentsFromStatistics(previousState?.statistics ?? fixture.statistics));
        const previousStatisticsHash = previousSnapshot?.statisticsHash
          ?? buildPayloadHash(previousState?.statistics ?? fixture.statistics);
        const previousLineupsHash = previousSnapshot?.lineupsHash
          ?? buildPayloadHash(previousState?.lineups ?? fixture.lineups);

        const eventResp = await this.sofaClient
          .requestJson<SofaEventSummaryResponse>(`${SOFASCORE_BASE}/event/${eventId}`)
          .catch(() => null);
        const eventSummary = eventResp?.event ?? null;
        const eventStatus = mapSofaStatus(eventSummary?.status?.type, eventSummary?.status?.description);

        const incidentsResp = await this.sofaClient
          .requestJson<{ incidents?: SofaIncident[] }>(`${SOFASCORE_BASE}/event/${eventId}/incidents`)
          .catch(() => ({ incidents: [] }));
        const incidents = incidentsResp.incidents ?? [];
        const normalizedIncidents = normalizeIncidents(incidents);
        const incidentsHash = buildPayloadHash(normalizedIncidents);

        let nextStatistics = asObjectRecord(previousState?.statistics) ?? asObjectRecord(fixture.statistics);
        let nextLineups = asObjectRecord(previousState?.lineups) ?? asObjectRecord(fixture.lineups);
        let lastStatisticsSyncAt = previousSnapshot?.lastStatisticsSyncAt ?? null;
        let lastLineupsSyncAt = previousSnapshot?.lastLineupsSyncAt ?? null;

        if (options?.forceFullRefresh || this.shouldRefreshStatistics(previousSnapshot, fixture, now)) {
          const statsResp = await this.sofaClient
            .requestJson<SofaStatisticsResponse>(`${SOFASCORE_BASE}/event/${eventId}/statistics`)
            .catch(() => null);

          const normalizedStatistics = normalizeStatisticsPayload(statsResp, incidents);
          if (normalizedStatistics) {
            nextStatistics = normalizedStatistics as unknown as Record<string, unknown>;
          }

          lastStatisticsSyncAt = now;
        } else if (incidentsHash !== previousIncidentsHash) {
          nextStatistics = mergeIncidentsIntoStatistics(nextStatistics, normalizedIncidents);
        }

        if (options?.forceFullRefresh || this.shouldRefreshLineups(previousSnapshot, fixture, nextLineups, now)) {
          const lineupsResp = await this.sofaClient
            .requestJson<SofaLineupsResponse>(`${SOFASCORE_BASE}/event/${eventId}/lineups`)
            .catch(() => null);

          const normalizedLineups = normalizeLineupsPayload(lineupsResp);
          if (normalizedLineups) {
            nextLineups = normalizedLineups as unknown as Record<string, unknown>;
          }

          lastLineupsSyncAt = now;
        }

        if (incidentsHash !== previousIncidentsHash) {
          nextStatistics = mergeIncidentsIntoStatistics(nextStatistics, normalizedIncidents);
        }

        const statisticsHash = buildPayloadHash(nextStatistics);
        const lineupsHash = buildPayloadHash(nextLineups);

        const latestIncident = incidents.at(-1) ?? null;
        const latestMinute = resolveCurrentMinute(
          eventSummary,
          latestIncident,
          previousState?.currentMinute ?? fixture.currentMinute,
        );

        const homeScore = typeof latestIncident?.homeScore === 'number'
          ? latestIncident.homeScore
          : eventSummary?.homeScore?.current ?? eventSummary?.homeScore?.display ?? previousState?.homeScore ?? fixture.homeScore;
        const awayScore = typeof latestIncident?.awayScore === 'number'
          ? latestIncident.awayScore
          : eventSummary?.awayScore?.current ?? eventSummary?.awayScore?.display ?? previousState?.awayScore ?? fixture.awayScore;

        let nextStatus = previousState?.status ?? fixture.status;

        if (eventStatus === FixtureStatus.FULL_TIME || eventStatus === FixtureStatus.POSTPONED) {
          nextStatus = eventStatus;
        } else if (hasCompletedMatchSignal({
          kickoffAt: fixture.kickoffAt,
          now,
          incidents,
          homeScore: homeScore ?? null,
          awayScore: awayScore ?? null,
        })) {
          nextStatus = FixtureStatus.FULL_TIME;
        } else if (eventStatus === FixtureStatus.LIVE) {
          nextStatus = FixtureStatus.LIVE;
        } else if (latestMinute !== null && latestMinute > 0) {
          nextStatus = FixtureStatus.LIVE;
        } else if (eventStatus === FixtureStatus.HALF_TIME) {
          nextStatus = FixtureStatus.HALF_TIME;
        } else if (eventStatus === FixtureStatus.SCHEDULED) {
          nextStatus = FixtureStatus.SCHEDULED;
        }

        nextStatus = normalizeStatusForStaleness({
          kickoffAt: fixture.kickoffAt,
          now,
          nextStatus,
          homeScore: homeScore ?? null,
          awayScore: awayScore ?? null,
        });

        const normalizedCurrentMinute = nextStatus === FixtureStatus.FULL_TIME || nextStatus === FixtureStatus.POSTPONED
          ? null
          : latestMinute ?? null;

        const shouldPersistFixture =
          fixture.status !== nextStatus
          || fixture.homeScore !== (homeScore ?? null)
          || fixture.awayScore !== (awayScore ?? null)
          || previousStatisticsHash !== statisticsHash
          || previousLineupsHash !== lineupsHash;

        const shouldEmitFixtureUpdated =
          previousState?.status !== nextStatus
          || previousState?.currentMinute !== normalizedCurrentMinute
          || previousState?.homeScore !== (homeScore ?? null)
          || previousState?.awayScore !== (awayScore ?? null);

        const shouldEmitFixtureEvent =
          previousIncidentsHash !== incidentsHash
          || previousStatisticsHash !== statisticsHash
          || previousLineupsHash !== lineupsHash;

        if (shouldPersistFixture) {
          fixture.currentMinute = normalizedCurrentMinute;
          fixture.homeScore = homeScore ?? null;
          fixture.awayScore = awayScore ?? null;
          fixture.status = nextStatus;
          fixture.statistics = nextStatistics;
          fixture.lineups = nextLineups;
          await this.fixturesRepository.save(fixture);
        }

        this.egyptLiveStateService.setState({
          fixtureId: fixture.id,
          status: nextStatus,
          currentMinute: normalizedCurrentMinute,
          homeScore: homeScore ?? null,
          awayScore: awayScore ?? null,
          statistics: nextStatistics,
          lineups: nextLineups,
          incidents: normalizedIncidents,
        });

        this.refreshSnapshots.set(fixture.id, {
          incidentsHash,
          statisticsHash,
          lineupsHash,
          lastStatisticsSyncAt,
          lastLineupsSyncAt,
        });

        if (shouldEmitFixtureUpdated) {
          this.realtimeEventsService.emitFixtureUpdated({
            fixtureId: fixture.id,
            status: nextStatus,
            homeScore: homeScore ?? null,
            awayScore: awayScore ?? null,
            currentMinute: normalizedCurrentMinute,
          });
        }

        if (shouldEmitFixtureEvent) {
          this.realtimeEventsService.emitFixtureEvent({
            fixtureId: fixture.id,
            incidents: normalizedIncidents,
            statistics: nextStatistics,
            lineups: nextLineups,
          });
        }

        if (shouldPersistFixture || shouldEmitFixtureUpdated || shouldEmitFixtureEvent) {
          updatedFixtureIds.push(fixture.id);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to refresh live fixture ${fixture.id}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    return {
      updatedFixtures: updatedFixtureIds.length,
      fixtureIds: updatedFixtureIds,
    };
  }

  private emitLiveTickSnapshot(fixtures: FixtureEntity[]) {
    const liveFixtures = fixtures
      .map((fixture) => {
        const liveState = this.egyptLiveStateService.getState(fixture.id);

        return {
          fixtureId: fixture.id,
          status: liveState?.status ?? fixture.status,
          homeScore: liveState?.homeScore ?? fixture.homeScore,
          awayScore: liveState?.awayScore ?? fixture.awayScore,
          currentMinute: liveState?.currentMinute ?? fixture.currentMinute,
          homeTeamName: fixture.homeTeam?.shortName,
          awayTeamName: fixture.awayTeam?.shortName,
          kickoffAt: fixture.kickoffAt.getTime(),
        };
      })
      .filter((fixture) => fixture.status === FixtureStatus.LIVE || fixture.status === FixtureStatus.HALF_TIME)
      .sort((left, right) => left.kickoffAt - right.kickoffAt)
      .map(({ kickoffAt: _kickoffAt, ...fixture }) => fixture);

    const payload = {
      liveCount: liveFixtures.length,
      fixtures: liveFixtures,
    };
    const payloadHash = buildPayloadHash(payload);

    if (payloadHash === this.lastLiveTickHash) {
      return;
    }

    this.lastLiveTickHash = payloadHash;
    this.realtimeEventsService.emitLiveMatchTick(payload);
  }
}
