import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  IFeedProvider,
  ProviderFixture,
  ProviderFixtureDetail,
  ProviderFixtureEvent,
} from './provider.interface';

const LEAGUE_ID_TO_TSPORTSDB: Record<number, string> = {
  233: '4829',
};

@Injectable()
export class TheSportsDbProvider implements IFeedProvider {
  readonly name = 'the-sports-db';
  private readonly logger = new Logger(TheSportsDbProvider.name);

  constructor(private readonly configService: ConfigService) {}

  isAvailable(): boolean {
    return true;
  }

  markQuotaExhausted(): void {
    return;
  }

  async fetchFixtures(leagueId: number, season: number): Promise<ProviderFixture[]> {
    const league = LEAGUE_ID_TO_TSPORTSDB[leagueId];
    if (!league) {
      this.logger.warn(`No TheSportsDB mapping for leagueId=${leagueId}`);
      return [];
    }

    const seasonLabel = this.toSeasonLabel(season);

    const [seasonData, nextData, pastData] = await Promise.all([
      this.request<{ events?: TheSportsDbEvent[] }>(`/eventsseason.php?id=${league}&s=${encodeURIComponent(seasonLabel)}`),
      this.request<{ events?: TheSportsDbEvent[] }>(`/eventsnextleague.php?id=${league}`),
      this.request<{ events?: TheSportsDbEvent[] }>(`/eventspastleague.php?id=${league}`),
    ]);

    const merged = [
      ...(seasonData.events ?? []),
      ...(pastData.events ?? []),
      ...(nextData.events ?? []),
    ];

    const byId = new Map<string, ProviderFixture>();
    for (const row of merged) {
      const fixture = this.mapEvent(row);
      if (fixture) {
        byId.set(fixture.externalId, fixture);
      }
    }

    return Array.from(byId.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async fetchFixtureEvents(_externalFixtureId: string): Promise<ProviderFixtureEvent[]> {
    return [];
  }

  async fetchFixtureDetail(_externalFixtureId: string): Promise<ProviderFixtureDetail | null> {
    return { events: [], statistics: null, lineups: null };
  }

  private mapEvent(row: TheSportsDbEvent): ProviderFixture | null {
    const idEvent = row.idEvent ? String(row.idEvent) : null;
    const homeId = row.idHomeTeam ? Number(row.idHomeTeam) : null;
    const awayId = row.idAwayTeam ? Number(row.idAwayTeam) : null;

    if (!idEvent || !homeId || !awayId) {
      return null;
    }

    const date = this.combineDateAndTime(row.dateEvent, row.strTime);

    return {
      externalId: `tsdb-${idEvent}`,
      date,
      venue: row.strVenue ?? null,
      statusShort: this.mapStatus(row.strStatus),
      elapsed: null,
      round: row.intRound ? `Round ${row.intRound}` : null,
      homeTeam: {
        externalId: homeId,
        name: row.strHomeTeam ?? null,
      },
      awayTeam: {
        externalId: awayId,
        name: row.strAwayTeam ?? null,
      },
      goalsHome: this.toNullableNumber(row.intHomeScore),
      goalsAway: this.toNullableNumber(row.intAwayScore),
    };
  }

  private mapStatus(status?: string | null): string | null {
    const normalized = String(status ?? '').toLowerCase();

    if (!normalized) return 'NS';
    if (normalized.includes('match finished') || normalized.includes('finished') || normalized.includes('ft')) return 'FT';
    if (normalized.includes('postponed')) return 'PST';
    if (normalized.includes('cancel')) return 'CANC';
    if (normalized.includes('abandon') || normalized.includes('suspend')) return 'ABD';
    if (normalized.includes('half')) return 'HT';
    if (normalized.includes('live') || normalized.includes('in play') || normalized.includes('1st') || normalized.includes('2nd')) return '1H';

    return 'NS';
  }

  private combineDateAndTime(dateEvent?: string | null, strTime?: string | null): string {
    if (!dateEvent) {
      return new Date().toISOString();
    }

    const normalizedTime = strTime && strTime.length > 0 ? strTime : '00:00:00';
    const iso = `${dateEvent}T${normalizedTime.endsWith('Z') ? normalizedTime : `${normalizedTime}Z`}`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? new Date(`${dateEvent}T00:00:00.000Z`).toISOString() : parsed.toISOString();
  }

  private toSeasonLabel(season: number): string {
    return `${season}-${season + 1}`;
  }

  private toNullableNumber(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('THE_SPORTS_DB_BASE_URL', 'https://www.thesportsdb.com/api/v1/json');
  }

  private getApiKey(): string {
    return this.configService.get<string>('THE_SPORTS_DB_API_KEY', '3');
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.getBaseUrl()}/${this.getApiKey()}${path}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TheSportsDB request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}

type TheSportsDbEvent = {
  idEvent?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strVenue?: string | null;
  strStatus?: string | null;
  intRound?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
};
