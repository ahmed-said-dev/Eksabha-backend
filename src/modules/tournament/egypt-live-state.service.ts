import { Injectable } from '@nestjs/common';

import { FixtureStatus } from '../../common/database';

export type EgyptLiveFixtureState = {
  fixtureId: string;
  status: FixtureStatus;
  currentMinute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  statistics: Record<string, unknown> | null;
  lineups: Record<string, unknown> | null;
  incidents: Array<Record<string, unknown>>;
  updatedAt: string;
};

@Injectable()
export class EgyptLiveStateService {
  private readonly liveStates = new Map<string, EgyptLiveFixtureState>();

  setState(input: Omit<EgyptLiveFixtureState, 'updatedAt'>) {
    const state: EgyptLiveFixtureState = {
      ...input,
      updatedAt: new Date().toISOString(),
    };

    this.liveStates.set(input.fixtureId, state);
    return state;
  }

  getState(fixtureId: string) {
    return this.liveStates.get(fixtureId) ?? null;
  }

  getStates() {
    return [...this.liveStates.values()];
  }

  hasState(fixtureId: string) {
    return this.liveStates.has(fixtureId);
  }

  clearState(fixtureId: string) {
    this.liveStates.delete(fixtureId);
  }

  clearStates(fixtureIds: Iterable<string>) {
    for (const fixtureId of fixtureIds) {
      this.liveStates.delete(fixtureId);
    }
  }
}
