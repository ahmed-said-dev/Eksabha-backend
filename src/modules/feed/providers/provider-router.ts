import { Injectable, Logger } from '@nestjs/common';

import { ApiFootballProvider } from './api-football.provider';
import { FootballDataOrgProvider } from './football-data-org.provider';
import { TheSportsDbProvider } from './the-sports-db.provider';
import {
  IFeedProvider,
  ProviderFixture,
  ProviderFixtureDetail,
  ProviderFixtureEvent,
} from './provider.interface';

/**
 * Routes feed requests through available providers with automatic fallback.
 *
 * Priority: API-Football (primary) → football-data.org (fallback).
 * Switches automatically on quota exhaustion (429) or provider errors.
 */
@Injectable()
export class ProviderRouter {
  private readonly logger = new Logger(ProviderRouter.name);
  private readonly providers: IFeedProvider[];

  constructor(
    private readonly apiFootball: ApiFootballProvider,
    private readonly footballDataOrg: FootballDataOrgProvider,
    private readonly theSportsDb: TheSportsDbProvider,
  ) {
    this.providers = [this.apiFootball, this.footballDataOrg, this.theSportsDb];
  }

  // ──────────────────────────── public API ────────────────────────────

  async fetchFixtures(leagueId: number, season: number): Promise<{ provider: string; fixtures: ProviderFixture[] }> {
    return this.tryProviders('fetchFixtures', async (provider) => {
      const fixtures = await provider.fetchFixtures(leagueId, season);
      if (fixtures.length === 0) {
        throw new Error(`Provider ${provider.name} returned 0 fixtures for league=${leagueId}, season=${season}.`);
      }
      return { provider: provider.name, fixtures };
    });
  }

  async fetchFixtureEvents(externalFixtureId: string): Promise<{ provider: string; events: ProviderFixtureEvent[] }> {
    return this.tryProviders('fetchFixtureEvents', async (provider) => {
      const events = await provider.fetchFixtureEvents(externalFixtureId);
      return { provider: provider.name, events };
    });
  }

  async fetchFixtureDetail(externalFixtureId: string): Promise<{ provider: string; detail: ProviderFixtureDetail | null }> {
    return this.tryProviders('fetchFixtureDetail', async (provider) => {
      const detail = await provider.fetchFixtureDetail(externalFixtureId);
      return { provider: provider.name, detail };
    });
  }

  // ──────────────────────────── status ────────────────────────────

  getStatus() {
    return {
      providers: this.providers.map((p) => ({
        name: p.name,
        available: p.isAvailable(),
        ...(p.name === 'api-football'
          ? { dailyRequests: (this.apiFootball as ApiFootballProvider).getDailyRequestCount() }
          : {}),
      })),
    };
  }

  // ──────────────────────────── routing logic ────────────────────────────

  private async tryProviders<T>(
    operation: string,
    fn: (provider: IFeedProvider) => Promise<T>,
  ): Promise<T> {
    const available = this.providers.filter((p) => p.isAvailable());

    if (available.length === 0) {
      throw new Error(`No feed providers available for ${operation}.`);
    }

    let lastError: Error | null = null;

    for (const provider of available) {
      try {
        const result = await fn(provider);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `Provider ${provider.name} failed for ${operation}: ${lastError.message}. Trying next...`,
        );

        // If it's a rate limit error, mark as exhausted
        if (lastError.message.includes('429') || lastError.message.includes('rate limit')) {
          provider.markQuotaExhausted();
        }
      }
    }

    throw lastError ?? new Error(`All providers failed for ${operation}.`);
  }
}
