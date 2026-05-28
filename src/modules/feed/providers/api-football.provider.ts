import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  IFeedProvider,
  ProviderFixture,
  ProviderFixtureDetail,
  ProviderFixtureEvent,
  ProviderTeamLineup,
  ProviderTeamStats,
} from './provider.interface';

@Injectable()
export class ApiFootballProvider implements IFeedProvider {
  readonly name = 'api-football';
  private readonly logger = new Logger(ApiFootballProvider.name);
  private quotaExhaustedUntil: Date | null = null;
  private dailyRequestCount = 0;
  private lastResetDate: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  // ──────────────────────────── availability ────────────────────────────

  isAvailable(): boolean {
    if (!this.getApiKey()) return false;
    if (this.quotaExhaustedUntil && new Date() < this.quotaExhaustedUntil) return false;
    return true;
  }

  markQuotaExhausted(): void {
    // Block for 1 hour then retry
    this.quotaExhaustedUntil = new Date(Date.now() + 60 * 60 * 1000);
    this.logger.warn('API-Football quota exhausted, blocking for 1 hour.');
  }

  getDailyRequestCount(): number {
    this.resetDailyCounterIfNeeded();
    return this.dailyRequestCount;
  }

  // ──────────────────────────── fixtures ────────────────────────────

  async fetchFixtures(leagueId: number, season: number): Promise<ProviderFixture[]> {
    const data = await this.request<{
      response?: Array<{
        fixture?: {
          id: number;
          date: string;
          venue?: { name?: string | null } | null;
          status?: { short?: string | null; elapsed?: number | null } | null;
        };
        league?: { round?: string | null } | null;
        teams?: {
          home?: { id?: number | null; name?: string | null } | null;
          away?: { id?: number | null; name?: string | null } | null;
        };
        goals?: { home?: number | null; away?: number | null } | null;
      }>;
    }>(`/fixtures?league=${leagueId}&season=${season}`);

    const fromSeason = this.mapFixturesResponse(data.response ?? []);
    if (fromSeason.length > 0) {
      return fromSeason;
    }

    const [nextData, lastData] = await Promise.all([
      this.request<{
        response?: Array<{
          fixture?: {
            id: number;
            date: string;
            venue?: { name?: string | null } | null;
            status?: { short?: string | null; elapsed?: number | null } | null;
          };
          league?: { round?: string | null } | null;
          teams?: {
            home?: { id?: number | null; name?: string | null } | null;
            away?: { id?: number | null; name?: string | null } | null;
          };
          goals?: { home?: number | null; away?: number | null } | null;
        }>;
      }>(`/fixtures?league=${leagueId}&next=80`),
      this.request<{
        response?: Array<{
          fixture?: {
            id: number;
            date: string;
            venue?: { name?: string | null } | null;
            status?: { short?: string | null; elapsed?: number | null } | null;
          };
          league?: { round?: string | null } | null;
          teams?: {
            home?: { id?: number | null; name?: string | null } | null;
            away?: { id?: number | null; name?: string | null } | null;
          };
          goals?: { home?: number | null; away?: number | null } | null;
        }>;
      }>(`/fixtures?league=${leagueId}&last=80`),
    ]);

    const merged = [...this.mapFixturesResponse(lastData.response ?? []), ...this.mapFixturesResponse(nextData.response ?? [])];
    const byId = new Map<string, ProviderFixture>();
    for (const fixture of merged) {
      byId.set(fixture.externalId, fixture);
    }

    return Array.from(byId.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  private mapFixturesResponse(
    rows: Array<{
      fixture?: {
        id: number;
        date: string;
        venue?: { name?: string | null } | null;
        status?: { short?: string | null; elapsed?: number | null } | null;
      };
      league?: { round?: string | null } | null;
      teams?: {
        home?: { id?: number | null; name?: string | null } | null;
        away?: { id?: number | null; name?: string | null } | null;
      };
      goals?: { home?: number | null; away?: number | null } | null;
    }>,
  ): ProviderFixture[] {
    return rows
      .filter((item) => item.fixture?.id && item.teams?.home?.id && item.teams?.away?.id)
      .map((item) => ({
        externalId: String(item.fixture!.id),
        date: item.fixture!.date,
        venue: item.fixture!.venue?.name ?? null,
        statusShort: item.fixture!.status?.short ?? null,
        elapsed: item.fixture!.status?.elapsed ?? null,
        round: item.league?.round ?? null,
        homeTeam: {
          externalId: item.teams!.home!.id!,
          name: item.teams!.home!.name ?? null,
        },
        awayTeam: {
          externalId: item.teams!.away!.id!,
          name: item.teams!.away!.name ?? null,
        },
        goalsHome: item.goals?.home ?? null,
        goalsAway: item.goals?.away ?? null,
      }));
  }

  // ──────────────────────────── events ────────────────────────────

  async fetchFixtureEvents(externalFixtureId: string): Promise<ProviderFixtureEvent[]> {
    const data = await this.request<{
      response?: Array<{
        time?: { elapsed?: number | null; extra?: number | null } | null;
        team?: { id?: number | null; name?: string | null } | null;
        player?: { id?: number | null; name?: string | null } | null;
        assist?: { id?: number | null; name?: string | null } | null;
        type?: string | null;
        detail?: string | null;
        comments?: string | null;
      }>;
    }>(`/fixtures/events?fixture=${externalFixtureId}`);

    return (data.response ?? []).map((e) => ({
      elapsed: e.time?.elapsed ?? null,
      extraTime: e.time?.extra ?? null,
      teamExternalId: e.team?.id ?? null,
      teamName: e.team?.name ?? null,
      playerExternalId: e.player?.id ?? null,
      playerName: e.player?.name ?? null,
      assistExternalId: e.assist?.id ?? null,
      assistName: e.assist?.name ?? null,
      type: e.type ?? null,
      detail: e.detail ?? null,
      comments: e.comments ?? null,
    }));
  }

  // ──────────────────────────── detail (stats + lineups + events) ────────────────────────────

  async fetchFixtureDetail(externalFixtureId: string): Promise<ProviderFixtureDetail | null> {
    const [events, stats, lineups] = await Promise.all([
      this.fetchFixtureEvents(externalFixtureId),
      this.fetchFixtureStatistics(externalFixtureId),
      this.fetchFixtureLineups(externalFixtureId),
    ]);

    return { events, statistics: stats, lineups };
  }

  // ──────────────────────────── statistics ────────────────────────────

  private async fetchFixtureStatistics(
    externalFixtureId: string,
  ): Promise<[ProviderTeamStats, ProviderTeamStats] | null> {
    const data = await this.request<{
      response?: Array<{
        team?: { id?: number; name?: string };
        statistics?: Array<{ type?: string; value?: number | string | null }>;
      }>;
    }>(`/fixtures/statistics?fixture=${externalFixtureId}`);

    const arr = data.response ?? [];
    if (arr.length < 2) return null;

    const mapTeam = (entry: (typeof arr)[0]): ProviderTeamStats => ({
      teamExternalId: entry.team?.id ?? null,
      teamName: entry.team?.name ?? null,
      statistics: (entry.statistics ?? []).map((s) => ({
        type: s.type ?? '',
        value: s.value ?? null,
      })),
    });

    return [mapTeam(arr[0]), mapTeam(arr[1])];
  }

  // ──────────────────────────── lineups ────────────────────────────

  private async fetchFixtureLineups(
    externalFixtureId: string,
  ): Promise<[ProviderTeamLineup, ProviderTeamLineup] | null> {
    const data = await this.request<{
      response?: Array<{
        team?: { id?: number; name?: string };
        formation?: string | null;
        startXI?: Array<{ player?: { id?: number; name?: string; number?: number; pos?: string } }>;
        substitutes?: Array<{ player?: { id?: number; name?: string; number?: number; pos?: string } }>;
        coach?: { id?: number; name?: string };
      }>;
    }>(`/fixtures/lineups?fixture=${externalFixtureId}`);

    const arr = data.response ?? [];
    if (arr.length < 2) return null;

    const mapTeam = (entry: (typeof arr)[0]): ProviderTeamLineup => ({
      teamExternalId: entry.team?.id ?? null,
      teamName: entry.team?.name ?? null,
      formation: entry.formation ?? null,
      coachName: entry.coach?.name ?? null,
      startingXI: (entry.startXI ?? []).map((p) => ({
        id: p.player?.id ?? null,
        name: p.player?.name ?? null,
        number: p.player?.number ?? null,
        pos: p.player?.pos ?? null,
      })),
      substitutes: (entry.substitutes ?? []).map((p) => ({
        id: p.player?.id ?? null,
        name: p.player?.name ?? null,
        number: p.player?.number ?? null,
        pos: p.player?.pos ?? null,
      })),
    });

    return [mapTeam(arr[0]), mapTeam(arr[1])];
  }

  // ──────────────────────────── HTTP helper ────────────────────────────

  private getApiKey(): string | null {
    const key = this.configService.get<string>('EXTERNAL_FEED_API_KEY');
    return key && key.trim().length > 0 ? key.trim() : null;
  }

  private getBaseUrl(): string {
    return this.configService.get<string>(
      'EXTERNAL_FEED_BASE_URL',
      'https://v3.football.api-sports.io',
    );
  }

  private async request<T>(path: string): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('EXTERNAL_FEED_API_KEY is not configured.');
    }

    this.resetDailyCounterIfNeeded();
    this.dailyRequestCount++;

    const url = `${this.getBaseUrl()}${path}`;
    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey },
    });

    if (response.status === 429) {
      this.markQuotaExhausted();
      throw new Error('API-Football rate limit exceeded (429).');
    }

    if (!response.ok) {
      throw new Error(`API-Football request failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as T & { errors?: Record<string, unknown> };

    if (json && typeof json === 'object' && json.errors && Object.keys(json.errors).length > 0) {
      const message = Object.entries(json.errors)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join('; ');
      throw new Error(`API-Football payload error: ${message}`);
    }

    return json;
  }

  private resetDailyCounterIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastResetDate !== today) {
      this.dailyRequestCount = 0;
      this.lastResetDate = today;
      // Also clear quota exhaustion at day boundary
      this.quotaExhaustedUntil = null;
    }
  }
}
