import { ConfigService } from '@nestjs/config';

export type ActiveCompetitionFormat = 'world_cup' | 'league';

export type ActiveCompetitionConfig = {
  key: string;
  name: string;
  slug: string;
  format: ActiveCompetitionFormat;
  country: string | null;
  year: number;
  currentPhase: string;
  currentMatchdayNumber: number;
  totalGroups: number;
  totalTeams: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

const PRESET_COMPETITIONS: Record<string, Omit<ActiveCompetitionConfig, 'key'>> = {
  'world-cup-2026': {
    name: 'FIFA World Cup 2026',
    slug: 'world-cup-2026',
    format: 'world_cup',
    country: null,
    year: 2026,
    currentPhase: 'group_stage_md1',
    currentMatchdayNumber: 1,
    totalGroups: 12,
    totalTeams: 48,
    startsAt: new Date('2026-06-11T18:00:00.000Z'),
    endsAt: new Date('2026-07-19T18:00:00.000Z'),
  },
  'egyptian-premier-league-current': {
    name: 'Egyptian Premier League',
    slug: 'egyptian-premier-league-current',
    format: 'league',
    country: 'Egypt',
    year: 2026,
    currentPhase: 'regular_season',
    currentMatchdayNumber: 1,
    totalGroups: 0,
    totalTeams: 18,
    startsAt: null,
    endsAt: null,
  },
};

type EnvReader = {
  get<T = string | number | boolean | null | undefined>(key: string): T | undefined;
};

function readValue(source: EnvReader | Record<string, string | undefined>, key: string) {
  if ('get' in source && typeof source.get === 'function') {
    return source.get<string | number | boolean | null | undefined>(key);
  }

  return (source as Record<string, string | undefined>)[key];
}

function readString(source: EnvReader | Record<string, string | undefined>, key: string, fallback = '') {
  const value = readValue(source, key);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function readNullableString(source: EnvReader | Record<string, string | undefined>, key: string) {
  const value = readValue(source, key);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(source: EnvReader | Record<string, string | undefined>, key: string, fallback: number) {
  const value = readValue(source, key);

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readDate(source: EnvReader | Record<string, string | undefined>, key: string) {
  const value = readNullableString(source, key);
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** API-Football league ID mapping for known competition keys */
export const COMPETITION_LEAGUE_IDS: Record<string, { leagueId: number; season: number }> = {
  'world-cup-2026': { leagueId: 1, season: 2026 },
  'egyptian-premier-league-current': { leagueId: 233, season: 2025 },
};

export function resolveLeagueId(competitionKey: string | null | undefined): { leagueId: number; season: number } | null {
  if (!competitionKey) return null;
  return COMPETITION_LEAGUE_IDS[competitionKey] ?? null;
}

export function readActiveCompetitionConfig(configService: ConfigService): ActiveCompetitionConfig {
  return readActiveCompetitionConfigFromSource(configService);
}

export function readActiveCompetitionConfigFromEnv(env: Record<string, string | undefined>) {
  return readActiveCompetitionConfigFromSource(env);
}

function readActiveCompetitionConfigFromSource(source: EnvReader | Record<string, string | undefined>): ActiveCompetitionConfig {
  const key = readString(source, 'ACTIVE_COMPETITION_KEY', 'world-cup-2026');
  const preset = PRESET_COMPETITIONS[key];

  return {
    key,
    name: readString(source, 'ACTIVE_COMPETITION_NAME', preset?.name ?? 'FIFA World Cup 2026'),
    slug: readString(source, 'ACTIVE_COMPETITION_SLUG', preset?.slug ?? 'world-cup-2026'),
    format: readString(source, 'ACTIVE_COMPETITION_FORMAT', preset?.format ?? 'world_cup') as ActiveCompetitionFormat,
    country: readNullableString(source, 'ACTIVE_COMPETITION_COUNTRY') ?? preset?.country ?? null,
    year: readNumber(source, 'ACTIVE_COMPETITION_YEAR', preset?.year ?? 2026),
    currentPhase: readString(source, 'ACTIVE_COMPETITION_CURRENT_PHASE', preset?.currentPhase ?? 'group_stage_md1'),
    currentMatchdayNumber: readNumber(source, 'ACTIVE_COMPETITION_CURRENT_MATCHDAY_NUMBER', preset?.currentMatchdayNumber ?? 1),
    totalGroups: readNumber(source, 'ACTIVE_COMPETITION_TOTAL_GROUPS', preset?.totalGroups ?? 12),
    totalTeams: readNumber(source, 'ACTIVE_COMPETITION_TOTAL_TEAMS', preset?.totalTeams ?? 48),
    startsAt: readDate(source, 'ACTIVE_COMPETITION_STARTS_AT') ?? preset?.startsAt ?? null,
    endsAt: readDate(source, 'ACTIVE_COMPETITION_ENDS_AT') ?? preset?.endsAt ?? null,
  };
}
