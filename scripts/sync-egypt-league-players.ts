import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AppModule } from '../src/app.module';
import { PlayerPosition } from '../src/common/database';
import { PlayerEntity } from '../src/modules/catalog/entities/player.entity';
import { TeamEntity } from '../src/modules/catalog/entities/team.entity';
import { FixtureEntity } from '../src/modules/tournament/entities/fixture.entity';
import { TournamentEntity } from '../src/modules/tournament/entities/tournament.entity';

const SOFASCORE_BASE = 'https://www.sofascore.com/api/v1';
const EGYPT_PREMIER_TOURNAMENT_KEY = 'egyptian-premier-league-current';
const EGYPTIAN_TEAM_SOFASCORE_IDS: Record<string, number> = {
  'al ahly': 6910,
  zamalek: 42368,
  pyramids: 175002,
  'al masry': 43560,
  'ceramica cleopatra': 140795,
  ismaily: 42366,
  'wadi degla': 43568,
  'al ittihad alexandria': 58319,
  'al-mokawloon al-arab': 42365,
  'arab contractors fc': 42365,
  zed: 139852,
  smouha: 43563,
  "tala'ea el gaish": 43561,
  'modern sport': 265830,
  petrojet: 43567,
  'kahrabaa ismailia': 153475,
  'el gouna': 43565,
  'national bank of egypt': 266626,
  'bank al ahly': 266626,
  'ghazl el mahalla': 140794,
  pharco: 241703,
  enppi: 43564,
  'haras el hodoud': 43566,
};

type SofaFixtureSnapshot = {
  fixtures?: Array<{
    homeTeam?: { name?: string; sofaId?: number };
    awayTeam?: { name?: string; sofaId?: number };
  }>;
};
const EGYPTIAN_TEAM_NAME_ALLOWLIST = new Set([
  'al ahly',
  'zamalek',
  'pyramids',
  'al masry',
  'ceramica cleopatra',
  'ismaily',
  'wadi degla',
  'al ittihad alexandria',
  'al-mokawloon al-arab',
  'arab contractors fc',
  'zed',
  'smouha',
  "tala'ea el gaish",
  'modern sport',
  'petrojet',
  'kahrabaa ismailia',
  'el gouna',
  'national bank of egypt',
  'bank al ahly',
  'ghazl el mahalla',
  'pharco',
  'enppi',
  'haras el hodoud',
]);

type SofaTeamPlayersResponse = {
  players?: Array<{
    player?: {
      id?: number;
      name?: string;
      shortName?: string;
      position?: string;
      shirtNumber?: number | string;
      proposedMarketValue?: number | null;
      dateOfBirthTimestamp?: number | null;
      height?: number | null;
      preferredFoot?: string | null;
      country?: {
        name?: string | null;
      } | null;
    };
  }>;
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
      timezoneId: 'Africa/Cairo',
    });

    this.page = await this.context.newPage();
    await this.page.goto('https://www.sofascore.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await this.page.waitForTimeout(1_000);
  }

  async requestJson<T>(url: string): Promise<T> {
    if (!this.page) {
      throw new Error('SofaBrowserClient not initialized.');
    }

    const result = await this.page.evaluate(async (apiUrl) => {
      const response = await fetch(apiUrl, {
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
    }, url);

    if (!result.ok) {
      throw new Error(`HTTP ${result.status} while fetching ${url}. Body: ${result.text.slice(0, 200)}`);
    }

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
      return PlayerPosition.FORWARD;
    default:
      return PlayerPosition.MIDFIELDER;
  }
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '')
    .trim();
}

function normalizeTeamNameForMatch(name: string): string {
  return normalize(name)
    .replace(/(footballclub|club|fc|sc)$/g, '')
    .trim();
}

function resolveEgyptianTeamSofaId(team: TeamEntity) {
  const normalizedName = team.name.trim().toLowerCase();
  return EGYPTIAN_TEAM_SOFASCORE_IDS[normalizedName] ?? null;
}

function buildShortName(name: string, provided?: string | null) {
  const normalizedProvided = provided?.trim();
  if (normalizedProvided) {
    return normalizedProvided.slice(0, 80);
  }

  const segments = name.split(' ').filter(Boolean);
  if (segments.length === 1) {
    return segments[0].slice(0, 80);
  }

  return `${segments[0][0]}. ${segments[segments.length - 1]}`.slice(0, 80);
}

function estimatePrice(position: PlayerPosition, proposedMarketValue?: number | null) {
  if (typeof proposedMarketValue === 'number' && Number.isFinite(proposedMarketValue) && proposedMarketValue > 0) {
    const scaled = Math.max(4, Math.min(15, Number((proposedMarketValue / 100000).toFixed(1))));
    return scaled.toFixed(2);
  }

  switch (position) {
    case PlayerPosition.GOALKEEPER:
      return '4.50';
    case PlayerPosition.DEFENDER:
      return '5.00';
    case PlayerPosition.MIDFIELDER:
      return '6.50';
    case PlayerPosition.FORWARD:
      return '7.00';
    default:
      return '5.50';
  }
}

async function main() {
  process.env.EXTERNAL_FEED_AUTO_SYNC_ENABLED = 'false';

  const logger = new Logger('SyncEgyptLeaguePlayers');
  logger.log('Bootstrapping NestJS application context…');

  const appCtx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const sofaClient = new SofaBrowserClient();
  await sofaClient.init();

  try {
    const tournamentRepo = appCtx.get<Repository<TournamentEntity>>(getRepositoryToken(TournamentEntity));
    const teamRepo = appCtx.get<Repository<TeamEntity>>(getRepositoryToken(TeamEntity));
    const playerRepo = appCtx.get<Repository<PlayerEntity>>(getRepositoryToken(PlayerEntity));
    const fixtureRepo = appCtx.get<Repository<FixtureEntity>>(getRepositoryToken(FixtureEntity));

    const tournament = await tournamentRepo.findOne({
      where: { competitionKey: EGYPT_PREMIER_TOURNAMENT_KEY },
    });

    if (!tournament) {
      throw new Error(`Tournament ${EGYPT_PREMIER_TOURNAMENT_KEY} not found.`);
    }

    const teams = await teamRepo.find({
      where: { tournament: { id: tournament.id } },
      relations: { tournament: true },
      order: { name: 'ASC' },
    });

    const fixtures = await fixtureRepo.find({
      where: { tournament: { id: tournament.id } },
      relations: { homeTeam: true, awayTeam: true },
    });

    const validTeamIds = new Set<string>();
    for (const fixture of fixtures) {
      if (!fixture.externalProviderId?.startsWith('sofa_')) {
        continue;
      }

      const homeName = fixture.homeTeam?.name?.toLowerCase() ?? '';
      const awayName = fixture.awayTeam?.name?.toLowerCase() ?? '';

      if (fixture.homeTeam?.id && EGYPTIAN_TEAM_NAME_ALLOWLIST.has(homeName)) {
        validTeamIds.add(fixture.homeTeam.id);
      }

      if (fixture.awayTeam?.id && EGYPTIAN_TEAM_NAME_ALLOWLIST.has(awayName)) {
        validTeamIds.add(fixture.awayTeam.id);
      }
    }

    const egyptianLeagueTeams = teams.filter((team) => validTeamIds.has(team.id) || resolveEgyptianTeamSofaId(team) !== null);

    const existingPlayers = await playerRepo.find({
      where: { team: { tournament: { id: tournament.id } } },
      relations: { team: true },
    });

    // Optional fallback map from latest fixtures snapshot: team name -> candidate sofa IDs
    const fallbackSofaIdsByTeamName = new Map<string, Set<number>>();
    try {
      const snapshotPath = join(process.cwd(), 'scripts', 'outputs', 'egypt-premier-league-25-26-sofascore.json');
      const snapshotRaw = await readFile(snapshotPath, 'utf8');
      const snapshot = JSON.parse(snapshotRaw) as SofaFixtureSnapshot;
      for (const fixture of snapshot.fixtures ?? []) {
        for (const side of [fixture.homeTeam, fixture.awayTeam]) {
          if (!side?.name || !side.sofaId) continue;
          const key = normalizeTeamNameForMatch(side.name);
          if (!fallbackSofaIdsByTeamName.has(key)) fallbackSofaIdsByTeamName.set(key, new Set());
          fallbackSofaIdsByTeamName.get(key)!.add(side.sofaId);
        }
      }
      logger.log(`Loaded fallback Sofa IDs for ${fallbackSofaIdsByTeamName.size} teams from fixtures snapshot`);
    } catch {
      logger.warn('Could not load fixtures snapshot fallback map. Continuing with DB/static IDs only.');
    }

    // Index by externalProviderId (Sofascore ID)
    const playersByExternalId = new Map<string, PlayerEntity>();
    // Index by normalized name + position for dedup/matching seed players
    const playersByNormName = new Map<string, PlayerEntity[]>();

    for (const player of existingPlayers) {
      if (player.externalProviderId) {
        playersByExternalId.set(player.externalProviderId, player);
      }
      const key = `${normalize(player.name)}:${player.position}`;
      if (!playersByNormName.has(key)) playersByNormName.set(key, []);
      playersByNormName.get(key)!.push(player);
    }

    // ── Report existing duplicates ──
    const duplicateGroups = [...playersByNormName.entries()].filter(([, ps]) => ps.length > 1);
    if (duplicateGroups.length > 0) {
      logger.warn(`Found ${duplicateGroups.length} duplicate player groups before sync:`);
      for (const [key, ps] of duplicateGroups.slice(0, 10)) {
        logger.warn(`  "${key}": ${ps.length} records — ${ps.map(p => `${p.name} (${p.team?.name ?? '?'}, extId=${p.externalProviderId ?? 'none'})`).join(' | ')}`);
      }
    }

    const seenExternalIds = new Set<string>();
    const seenPlayerDbIds = new Set<string>(); // track which DB records got updated
    const refreshedPlayersByTeamIdCache = new Map<string, PlayerEntity[]>();
    let created = 0;
    let updated = 0;
    let transfers = 0;
    let dedupMerged = 0;
    let skippedTeams = 0;
    let deactivatedFromMissingTeamRoster = 0;
    let fallbackLineupTeamsSynced = 0;

    for (const team of egyptianLeagueTeams) {
      const overrideSofaId = resolveEgyptianTeamSofaId(team);
      const fallbackByName = fallbackSofaIdsByTeamName.get(normalizeTeamNameForMatch(team.name));
      const candidateIdsRaw = [
        team.externalProviderId?.trim() ?? null,
        overrideSofaId ? String(overrideSofaId) : null,
        ...Array.from(fallbackByName ?? []).map((id) => String(id)),
      ].filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id));
      const candidateIds = [...new Set(candidateIdsRaw)];

      if (candidateIds.length === 0) {
        logger.warn(`Skipping team ${team.name} because it has no numeric Sofascore id.`);
        continue;
      }

      let payload: SofaTeamPlayersResponse | null = null;
      let teamFetchError: unknown = null;
      let resolvedTeamSofaId: string | null = null;
      for (const candidateId of candidateIds) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            payload = await sofaClient.requestJson<SofaTeamPlayersResponse>(
              `${SOFASCORE_BASE}/team/${candidateId}/players`,
            );
            resolvedTeamSofaId = candidateId;
            break;
          } catch (error) {
            teamFetchError = error;
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
            }
          }
        }
        if (payload && resolvedTeamSofaId) break;
      }

      if (!payload) {
        skippedTeams += 1;
        logger.warn(
          `Skipping team ${team.name} (candidates=${candidateIds.join(',')}) because player endpoint failed after retries: ${
            teamFetchError instanceof Error ? teamFetchError.message : String(teamFetchError)
          }`,
        );

        const lineupFallbackPlayers = new Map<string, { name: string; shortName: string; position: PlayerPosition; externalId: string | null }>();
        const teamFixtures = fixtures.filter(
          (f) => (f.homeTeam?.id === team.id || f.awayTeam?.id === team.id) && f.lineups,
        );

        for (const fixture of teamFixtures) {
          const sideKey = fixture.homeTeam?.id === team.id ? 'home' : 'away';
          const sideLineup = (fixture.lineups?.[sideKey] as Record<string, unknown> | undefined) ?? undefined;
          if (!sideLineup) continue;

          const collect = (arr: unknown) => {
            if (!Array.isArray(arr)) return;
            for (const raw of arr) {
              if (!raw || typeof raw !== 'object') continue;
              const item = raw as Record<string, unknown>;
              const nameRaw = typeof item.name === 'string' ? item.name : null;
              if (!nameRaw) continue;
              const positionRaw = typeof item.position === 'string' ? item.position : null;
              const position = mapSofaPosition(positionRaw);
              const cleanName = normalizeName(nameRaw);
              const extIdRaw = typeof item.id === 'number' || typeof item.id === 'string' ? String(item.id) : null;
              const key = extIdRaw ? `ext:${extIdRaw}` : `name:${normalize(cleanName)}:${position}`;
              lineupFallbackPlayers.set(key, {
                name: cleanName,
                shortName: buildShortName(cleanName, null),
                position,
                externalId: extIdRaw,
              });
            }
          };

          collect(sideLineup.startingXI);
          collect(sideLineup.substitutes);
        }

        if (lineupFallbackPlayers.size > 0) {
          fallbackLineupTeamsSynced += 1;
          logger.warn(
            `Using fixture lineups fallback for ${team.name}: ${lineupFallbackPlayers.size} players`,
          );

          const seenTeamKeys = new Set<string>();
          for (const fallbackPlayer of lineupFallbackPlayers.values()) {
            let player: PlayerEntity | null = null;

            if (fallbackPlayer.externalId) {
              player = playersByExternalId.get(fallbackPlayer.externalId) ?? null;
              seenExternalIds.add(fallbackPlayer.externalId);
              seenTeamKeys.add(`ext:${fallbackPlayer.externalId}`);
            }

            if (!player) {
              const normKey = `${normalize(fallbackPlayer.name)}:${fallbackPlayer.position}`;
              const candidates = playersByNormName.get(normKey) ?? [];
              player =
                candidates.find((p) => p.team?.id === team.id)
                ?? candidates.find((p) => !p.externalProviderId)
                ?? null;
              seenTeamKeys.add(`name:${normalize(fallbackPlayer.name)}:${fallbackPlayer.position}`);
            }

            if (!player) {
              player = playerRepo.create();
              created += 1;
            } else {
              updated += 1;
            }

            player.name = fallbackPlayer.name;
            player.shortName = fallbackPlayer.shortName;
            player.position = fallbackPlayer.position;
            player.team = team;
            if (fallbackPlayer.externalId) {
              player.externalProviderId = fallbackPlayer.externalId;
            }
            player.isActive = true;
            player.isInjured = false;
            player.isSuspended = false;
            player.minutesPlayed = player.minutesPlayed ?? 0;
            player.totalPoints = player.totalPoints ?? 0;

            player = await playerRepo.save(player);
            seenPlayerDbIds.add(player.id);
            if (player.externalProviderId) {
              playersByExternalId.set(player.externalProviderId, player);
            }
            const normKey = `${normalize(player.name)}:${player.position}`;
            if (!playersByNormName.has(normKey)) playersByNormName.set(normKey, []);
            const idx = playersByNormName.get(normKey)!.findIndex((p) => p.id === player!.id);
            if (idx >= 0) {
              playersByNormName.get(normKey)![idx] = player;
            } else {
              playersByNormName.get(normKey)!.push(player);
            }
          }

          const teamPlayers = refreshedPlayersByTeamIdCache.get(team.id)
            ?? await playerRepo.find({ where: { team: { id: team.id } }, relations: { team: true } });
          refreshedPlayersByTeamIdCache.set(team.id, teamPlayers);

          for (const p of teamPlayers) {
            const key = p.externalProviderId
              ? `ext:${p.externalProviderId}`
              : `name:${normalize(p.name)}:${p.position}`;
            if (p.isActive && !seenTeamKeys.has(key)) {
              p.isActive = false;
              await playerRepo.save(p);
              deactivatedFromMissingTeamRoster += 1;
            }
          }

          continue;
        }

        const teamPlayers = refreshedPlayersByTeamIdCache.get(team.id)
          ?? await playerRepo.find({ where: { team: { id: team.id } }, relations: { team: true } });
        refreshedPlayersByTeamIdCache.set(team.id, teamPlayers);

        const activeTeamPlayers = teamPlayers.filter((p: PlayerEntity) => p.isActive);
        if (activeTeamPlayers.length > 0) {
          for (const p of activeTeamPlayers) {
            p.isActive = false;
            await playerRepo.save(p);
          }
          deactivatedFromMissingTeamRoster += activeTeamPlayers.length;
          logger.warn(`Deactivated ${activeTeamPlayers.length} active players for team ${team.name} بسبب عدم توفر roster صالح من Sofascore`);
        }
        continue;
      }

      if (resolvedTeamSofaId && team.externalProviderId !== resolvedTeamSofaId) {
        logger.log(`Resolved updated Sofa team id for ${team.name}: ${team.externalProviderId ?? 'none'} -> ${resolvedTeamSofaId}`);
        team.externalProviderId = resolvedTeamSofaId;
        await teamRepo.save(team);
      }

      const roster = payload.players ?? [];
      logger.log(`Team ${team.name}: ${roster.length} players`);

      for (const entry of roster) {
        const playerPayload = entry.player;
        if (!playerPayload?.id || !playerPayload.name) {
          continue;
        }

        const externalPlayerId = String(playerPayload.id);
        seenExternalIds.add(externalPlayerId);

        const position = mapSofaPosition(playerPayload.position);
        const playerName = normalizeName(playerPayload.name);
        const shortName = buildShortName(playerName, playerPayload.shortName ?? null);
        const currentPrice = estimatePrice(position, playerPayload.proposedMarketValue ?? null);

        // ── Match strategy: 1) by Sofascore ID  2) by name+position+team  3) by name+position (seed dedup) ──
        let player = playersByExternalId.get(externalPlayerId) ?? null;
        let isTransfer = false;

        if (!player) {
          // Try matching by name+position within the SAME team (seed data without extId)
          const normKey = `${normalize(playerName)}:${position}`;
          const candidates = playersByNormName.get(normKey) ?? [];
          const sameTeamCandidate = candidates.find(
            (p) => !p.externalProviderId && p.team?.id === team.id,
          );
          if (sameTeamCandidate) {
            player = sameTeamCandidate;
            dedupMerged++;
            logger.log(`  Mapped seed player "${player.name}" → Sofascore #${externalPlayerId}`);
          }
        }

        if (!player) {
          // New player — check if there's a same-name player on a DIFFERENT team (transfer)
          const normKey = `${normalize(playerName)}:${position}`;
          const candidates = playersByNormName.get(normKey) ?? [];
          const diffTeamCandidate = candidates.find(
            (p) => !p.externalProviderId && p.team?.id !== team.id,
          );
          if (diffTeamCandidate) {
            player = diffTeamCandidate;
            isTransfer = true;
            transfers++;
            logger.log(`  Transfer detected: "${player.name}" moved from ${player.team?.name ?? '?'} → ${team.name}`);
          }
        }

        if (!player) {
          player = playerRepo.create();
          player.externalProviderId = externalPlayerId;
          created += 1;
        } else {
          if (player.id) updated++;
        }

        // Detect transfer for players already matched by externalId but now on a different team
        if (player.team?.id && player.team.id !== team.id) {
          if (!isTransfer) {
            transfers++;
            isTransfer = true;
            logger.log(`  Transfer: "${player.name}" moved from ${player.team.name} → ${team.name}`);
          }
        }

        player.name = playerName;
        player.shortName = shortName;
        player.position = position;
        player.currentPrice = currentPrice;
        player.team = team;
        player.externalProviderId = externalPlayerId;
        player.isActive = true;
        player.isInjured = false;
        player.isSuspended = false;
        player.minutesPlayed = player.minutesPlayed ?? 0;
        player.totalPoints = player.totalPoints ?? 0;

        player = await playerRepo.save(player);
        seenPlayerDbIds.add(player.id);
        playersByExternalId.set(externalPlayerId, player);

        // Update name index
        const normKey = `${normalize(playerName)}:${position}`;
        if (!playersByNormName.has(normKey)) playersByNormName.set(normKey, []);
        const idx = playersByNormName.get(normKey)!.findIndex((p) => p.id === player.id);
        if (idx >= 0) {
          playersByNormName.get(normKey)![idx] = player;
        } else {
          playersByNormName.get(normKey)!.push(player);
        }
      }
    }

    // ── Deactivate stale players (still in DB but no longer in any Sofascore roster) ──
    const stalePlayers = existingPlayers.filter(
      (player) => player.externalProviderId && !seenExternalIds.has(player.externalProviderId),
    );

    for (const player of stalePlayers) {
      player.isActive = false;
      await playerRepo.save(player);
    }
    logger.log(`Deactivated ${stalePlayers.length} stale players`);

    // ── Delete true duplicates ──
    const refreshedPlayers = await playerRepo.find({
      where: { team: { tournament: { id: tournament.id } } },
      relations: { team: true },
    });

    const duplicateIdsToDelete: string[] = [];

    // 1) True duplicate if same externalProviderId exists in multiple DB rows
    const byExternalId = new Map<string, PlayerEntity[]>();
    for (const p of refreshedPlayers) {
      if (!p.externalProviderId) continue;
      if (!byExternalId.has(p.externalProviderId)) byExternalId.set(p.externalProviderId, []);
      byExternalId.get(p.externalProviderId)!.push(p);
    }

    for (const [extId, ps] of byExternalId) {
      if (ps.length <= 1) continue;

      // Keep priority: touched in this run > active > higher points
      const sorted = [...ps].sort((a, b) => {
        const aTouched = seenPlayerDbIds.has(a.id) ? 1 : 0;
        const bTouched = seenPlayerDbIds.has(b.id) ? 1 : 0;
        if (aTouched !== bTouched) return bTouched - aTouched;
        const aActive = a.isActive ? 1 : 0;
        const bActive = b.isActive ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return (b.totalPoints ?? 0) - (a.totalPoints ?? 0);
      });

      const keep = sorted[0];
      const remove = sorted.slice(1);
      logger.warn(
        `  Dedup by extId=${extId}: keeping "${keep.name}" (${keep.id}), removing ${remove.length} duplicate(s)`,
      );
      for (const r of remove) {
        duplicateIdsToDelete.push(r.id);
      }
    }

    // 2) For rows without externalProviderId only: dedupe exact same name+position+team
    const byNoExtSignature = new Map<string, PlayerEntity[]>();
    for (const p of refreshedPlayers) {
      if (p.externalProviderId) continue;
      const key = `${normalize(p.name)}:${p.position}:${p.team?.id ?? 'null'}`;
      if (!byNoExtSignature.has(key)) byNoExtSignature.set(key, []);
      byNoExtSignature.get(key)!.push(p);
    }

    for (const [signature, ps] of byNoExtSignature) {
      if (ps.length <= 1) continue;
      const sorted = [...ps].sort((a, b) => {
        const aTouched = seenPlayerDbIds.has(a.id) ? 1 : 0;
        const bTouched = seenPlayerDbIds.has(b.id) ? 1 : 0;
        if (aTouched !== bTouched) return bTouched - aTouched;
        const aActive = a.isActive ? 1 : 0;
        const bActive = b.isActive ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return (b.totalPoints ?? 0) - (a.totalPoints ?? 0);
      });

      const keep = sorted[0];
      const remove = sorted.slice(1);
      logger.warn(
        `  Dedup by signature=${signature}: keeping "${keep.name}" (${keep.id}), removing ${remove.length} duplicate(s)`,
      );
      for (const r of remove) {
        duplicateIdsToDelete.push(r.id);
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      // Nullify foreign keys first (fantasy picks, score logs, etc.)
      const clearPlayerRefs = async (tableName: string) => {
        try {
          await playerRepo.manager.query(
            `UPDATE ${tableName} SET player_id = NULL WHERE player_id = ANY($1::uuid[])`,
            [duplicateIdsToDelete],
          );
        } catch (error) {
          logger.warn(
            `Failed to nullify ${tableName}.player_id for duplicate players: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      };

      await clearPlayerRefs('fantasy_picks');
      await clearPlayerRefs('player_score_logs');
      await clearPlayerRefs('player_score_events');
      try {
        await playerRepo.manager.query(
          'UPDATE transfers SET player_out_id = NULL WHERE player_out_id = ANY($1::uuid[])',
          [duplicateIdsToDelete],
        );
        await playerRepo.manager.query(
          'UPDATE transfers SET player_in_id = NULL WHERE player_in_id = ANY($1::uuid[])',
          [duplicateIdsToDelete],
        );
      } catch (error) {
        logger.warn(
          `Failed to nullify transfers player_in_id/player_out_id for duplicate players: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      await playerRepo.delete(duplicateIdsToDelete);
      logger.log(`Deleted ${duplicateIdsToDelete.length} duplicate player records`);
    }

    // ── Also deactivate seed players without externalProviderId that weren't matched ──
    const unmatchedSeedPlayers = refreshedPlayers.filter(
      (p) => !p.externalProviderId && !seenPlayerDbIds.has(p.id) && p.isActive,
    );
    for (const p of unmatchedSeedPlayers) {
      p.isActive = false;
      await playerRepo.save(p);
    }
    if (unmatchedSeedPlayers.length > 0) {
      logger.log(`Deactivated ${unmatchedSeedPlayers.length} unmatched seed players (no Sofascore match)`);
    }

    logger.log('');
    logger.log('═══════════════════════════════════════');
    logger.log(`  PLAYER SYNC COMPLETE`);
    logger.log(`  Created:    ${created}`);
    logger.log(`  Updated:    ${updated}`);
    logger.log(`  Transfers:  ${transfers}`);
    logger.log(`  Deduped:    ${dedupMerged} seed→Sofa merges`);
    logger.log(`  Duplicates: ${duplicateIdsToDelete.length} deleted`);
    logger.log(`  Deactivated:${stalePlayers.length + unmatchedSeedPlayers.length + deactivatedFromMissingTeamRoster}`);
    logger.log(`  Missing-roster deactivated: ${deactivatedFromMissingTeamRoster}`);
    logger.log(`  Lineup-fallback teams: ${fallbackLineupTeamsSynced}`);
    logger.log(`  Skipped:    ${skippedTeams} teams`);
    logger.log('═══════════════════════════════════════');
  } finally {
    await sofaClient.close();
    await appCtx.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
