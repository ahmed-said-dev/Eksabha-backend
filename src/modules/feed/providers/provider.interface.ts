/**
 * Shared types for all feed data providers (API-Football, football-data.org, etc.)
 */

export interface ProviderFixture {
  externalId: string;
  date: string;
  venue: string | null;
  statusShort: string | null;
  elapsed: number | null;
  round: string | null;
  homeTeam: { externalId: number; name: string | null };
  awayTeam: { externalId: number; name: string | null };
  goalsHome: number | null;
  goalsAway: number | null;
}

export interface ProviderFixtureEvent {
  elapsed: number | null;
  extraTime: number | null;
  teamExternalId: number | null;
  teamName: string | null;
  playerExternalId: number | null;
  playerName: string | null;
  assistExternalId: number | null;
  assistName: string | null;
  type: string | null;
  detail: string | null;
  comments: string | null;
}

export interface ProviderStatEntry {
  type: string;
  value: number | string | null;
}

export interface ProviderTeamStats {
  teamExternalId: number | null;
  teamName: string | null;
  statistics: ProviderStatEntry[];
}

export interface ProviderLineupPlayer {
  id: number | null;
  name: string | null;
  number: number | null;
  pos: string | null;
}

export interface ProviderTeamLineup {
  teamExternalId: number | null;
  teamName: string | null;
  formation: string | null;
  coachName: string | null;
  startingXI: ProviderLineupPlayer[];
  substitutes: ProviderLineupPlayer[];
}

export interface ProviderFixtureDetail {
  statistics: [ProviderTeamStats, ProviderTeamStats] | null;
  lineups: [ProviderTeamLineup, ProviderTeamLineup] | null;
  events: ProviderFixtureEvent[];
}

export interface IFeedProvider {
  readonly name: string;

  fetchFixtures(leagueId: number, season: number): Promise<ProviderFixture[]>;

  fetchFixtureEvents(externalFixtureId: string): Promise<ProviderFixtureEvent[]>;

  fetchFixtureDetail(externalFixtureId: string): Promise<ProviderFixtureDetail | null>;

  /** Returns true if the provider can still serve requests (not quota-exhausted). */
  isAvailable(): boolean;

  /** Called when a request fails with a quota/rate error so the router can switch. */
  markQuotaExhausted(): void;
}
