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

/**
 * football-data.org v4 provider (free tier: 10 req/min).
 *
 * Competition codes: WC = World Cup, PL = Premier League, etc.
 * League IDs from API-Football are mapped to competition codes internally.
 */
const LEAGUE_ID_TO_COMPETITION: Record<number, string> = {
  1: 'WC',      // FIFA World Cup
  2: 'CL',      // Champions League
  3: 'EL',      // Europa League
  39: 'PL',     // Premier League
  140: 'PD',    // La Liga
  135: 'SA',    // Serie A
  78: 'BL1',    // Bundesliga
  61: 'FL1',    // Ligue 1
  88: 'DED',    // Eredivisie
  94: 'PPL',    // Primeira Liga
};

@Injectable()
export class FootballDataOrgProvider implements IFeedProvider {
  readonly name = 'football-data-org';
  private readonly logger = new Logger(FootballDataOrgProvider.name);
  private quotaExhaustedUntil: Date | null = null;

  constructor(private readonly configService: ConfigService) {}

  // ──────────────────────────── availability ────────────────────────────

  isAvailable(): boolean {
    if (!this.getApiKey()) return false;
    if (this.quotaExhaustedUntil && new Date() < this.quotaExhaustedUntil) return false;
    return true;
  }

  markQuotaExhausted(): void {
    // Block for 2 minutes (rate limit is per-minute)
    this.quotaExhaustedUntil = new Date(Date.now() + 2 * 60 * 1000);
    this.logger.warn('football-data.org rate limited, blocking for 2 minutes.');
  }

  // ──────────────────────────── fixtures ────────────────────────────

  async fetchFixtures(leagueId: number, _season: number): Promise<ProviderFixture[]> {
    const competitionCode = LEAGUE_ID_TO_COMPETITION[leagueId];
    if (!competitionCode) {
      this.logger.warn(`No football-data.org mapping for leagueId=${leagueId}`);
      return [];
    }

    const data = await this.request<{
      matches?: Array<{
        id: number;
        utcDate: string;
        venue?: string | null;
        status: string;
        matchday?: number | null;
        stage?: string | null;
        group?: string | null;
        homeTeam: { id: number; name: string };
        awayTeam: { id: number; name: string };
        score: {
          fullTime: { home: number | null; away: number | null };
          halfTime: { home: number | null; away: number | null };
        };
        minute?: number | null;
      }>;
    }>(`/competitions/${competitionCode}/matches`);

    return (data.matches ?? []).map((m) => ({
      externalId: `fdo-${m.id}`,
      date: m.utcDate,
      venue: m.venue ?? null,
      statusShort: this.mapStatus(m.status),
      elapsed: m.minute ?? null,
      round: m.stage
        ? `${m.stage}${m.matchday ? ` - ${m.matchday}` : ''}${m.group ? ` ${m.group}` : ''}`
        : null,
      homeTeam: { externalId: m.homeTeam.id, name: m.homeTeam.name },
      awayTeam: { externalId: m.awayTeam.id, name: m.awayTeam.name },
      goalsHome: m.score.fullTime.home,
      goalsAway: m.score.fullTime.away,
    }));
  }

  // ──────────────────────────── events ────────────────────────────

  async fetchFixtureEvents(externalFixtureId: string): Promise<ProviderFixtureEvent[]> {
    const matchId = this.extractMatchId(externalFixtureId);
    if (!matchId) return [];

    // football-data.org doesn't have a dedicated events endpoint on free tier
    // We extract from the match detail head2head endpoint
    const detail = await this.fetchFixtureDetail(externalFixtureId);
    return detail?.events ?? [];
  }

  // ──────────────────────────── detail ────────────────────────────

  async fetchFixtureDetail(externalFixtureId: string): Promise<ProviderFixtureDetail | null> {
    const matchId = this.extractMatchId(externalFixtureId);
    if (!matchId) return null;

    const data = await this.request<{
      id: number;
      homeTeam: { id: number; name: string };
      awayTeam: { id: number; name: string };
      goals?: Array<{
        minute: number;
        injuryTime?: number | null;
        type: string;
        team: { id: number; name: string };
        scorer: { id: number; name: string };
        assist?: { id: number; name: string } | null;
      }>;
      bookings?: Array<{
        minute: number;
        team: { id: number; name: string };
        player: { id: number; name: string };
        card: string;
      }>;
      substitutions?: Array<{
        minute: number;
        team: { id: number; name: string };
        playerOut: { id: number; name: string };
        playerIn: { id: number; name: string };
      }>;
      statistics?: {
        home: Record<string, number | string | null>;
        away: Record<string, number | string | null>;
      } | null;
      lineups?: Array<{
        team: { id: number; name: string };
        formation: string | null;
        coach: { id: number; name: string } | null;
        startingXI: Array<{ id: number; name: string; shirtNumber: number; position: string }>;
        bench: Array<{ id: number; name: string; shirtNumber: number; position: string }>;
      }>;
    }>(`/matches/${matchId}`);

    // Build events from goals, bookings, substitutions
    const events: ProviderFixtureEvent[] = [];

    for (const goal of data.goals ?? []) {
      events.push({
        elapsed: goal.minute,
        extraTime: goal.injuryTime ?? null,
        teamExternalId: goal.team.id,
        teamName: goal.team.name,
        playerExternalId: goal.scorer.id,
        playerName: goal.scorer.name,
        assistExternalId: goal.assist?.id ?? null,
        assistName: goal.assist?.name ?? null,
        type: 'Goal',
        detail: goal.type === 'OWN' ? 'Own Goal' : goal.type === 'PENALTY' ? 'Penalty' : 'Normal Goal',
        comments: null,
      });
    }

    for (const booking of data.bookings ?? []) {
      events.push({
        elapsed: booking.minute,
        extraTime: null,
        teamExternalId: booking.team.id,
        teamName: booking.team.name,
        playerExternalId: booking.player.id,
        playerName: booking.player.name,
        assistExternalId: null,
        assistName: null,
        type: 'Card',
        detail: booking.card === 'YELLOW' ? 'Yellow Card' : 'Red Card',
        comments: null,
      });
    }

    for (const sub of data.substitutions ?? []) {
      events.push({
        elapsed: sub.minute,
        extraTime: null,
        teamExternalId: sub.team.id,
        teamName: sub.team.name,
        playerExternalId: sub.playerIn.id,
        playerName: sub.playerIn.name,
        assistExternalId: sub.playerOut.id,
        assistName: sub.playerOut.name,
        type: 'subst',
        detail: 'Substitution',
        comments: null,
      });
    }

    events.sort((a, b) => (a.elapsed ?? 0) - (b.elapsed ?? 0));

    // Build statistics
    let statistics: [ProviderTeamStats, ProviderTeamStats] | null = null;
    if (data.statistics) {
      const mapStats = (raw: Record<string, number | string | null>): ProviderTeamStats['statistics'] =>
        Object.entries(raw).map(([key, value]) => ({ type: key, value }));

      statistics = [
        { teamExternalId: data.homeTeam.id, teamName: data.homeTeam.name, statistics: mapStats(data.statistics.home) },
        { teamExternalId: data.awayTeam.id, teamName: data.awayTeam.name, statistics: mapStats(data.statistics.away) },
      ];
    }

    // Build lineups
    let lineups: [ProviderTeamLineup, ProviderTeamLineup] | null = null;
    if (data.lineups && data.lineups.length >= 2) {
      const mapLineup = (entry: (typeof data.lineups)[0]): ProviderTeamLineup => ({
        teamExternalId: entry.team.id,
        teamName: entry.team.name,
        formation: entry.formation,
        coachName: entry.coach?.name ?? null,
        startingXI: entry.startingXI.map((p) => ({
          id: p.id,
          name: p.name,
          number: p.shirtNumber,
          pos: p.position,
        })),
        substitutes: entry.bench.map((p) => ({
          id: p.id,
          name: p.name,
          number: p.shirtNumber,
          pos: p.position,
        })),
      });

      lineups = [mapLineup(data.lineups[0]), mapLineup(data.lineups[1])];
    }

    return { events, statistics, lineups };
  }

  // ──────────────────────────── helpers ────────────────────────────

  private mapStatus(status: string): string | null {
    switch (status) {
      case 'IN_PLAY':
        return '1H';
      case 'PAUSED':
        return 'HT';
      case 'FINISHED':
        return 'FT';
      case 'POSTPONED':
        return 'PST';
      case 'CANCELLED':
        return 'CANC';
      case 'SUSPENDED':
        return 'ABD';
      case 'TIMED':
      case 'SCHEDULED':
      default:
        return 'NS';
    }
  }

  private extractMatchId(externalFixtureId: string): string | null {
    if (externalFixtureId.startsWith('fdo-')) {
      return externalFixtureId.slice(4);
    }
    return null;
  }

  private getApiKey(): string | null {
    const key = this.configService.get<string>('FOOTBALL_DATA_ORG_API_KEY');
    return key && key.trim().length > 0 ? key.trim() : null;
  }

  private getBaseUrl(): string {
    return this.configService.get<string>(
      'FOOTBALL_DATA_ORG_BASE_URL',
      'https://api.football-data.org/v4',
    );
  }

  private async request<T>(path: string): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('FOOTBALL_DATA_ORG_API_KEY is not configured.');
    }

    const url = `${this.getBaseUrl()}${path}`;
    const response = await fetch(url, {
      headers: { 'X-Auth-Token': apiKey },
    });

    if (response.status === 429) {
      this.markQuotaExhausted();
      throw new Error('football-data.org rate limit exceeded (429).');
    }

    if (!response.ok) {
      throw new Error(`football-data.org request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}
