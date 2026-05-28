import { WORLD_CUP_2026_PLAYERS, WORLD_CUP_2026_TEAMS } from './world-cup-2026-catalog.generated';

type PlayerPositionCode = 'GK' | 'DEF' | 'MID' | 'FWD';

type WorldCupSeedPlayer = {
  frontendId: string;
  name: string;
  shortName: string;
  teamCode: string;
  position: PlayerPositionCode;
  price: string;
  totalPoints: number;
  minutesPlayed: number;
  isInjured: boolean;
  isSuspended: boolean;
  isActive: boolean;
};

type WorldCupSeedTeam = (typeof WORLD_CUP_2026_TEAMS)[number];

const TARGET_SQUAD_TEMPLATE: ReadonlyArray<{ position: PlayerPositionCode; count: number; basePrice: number }> = [
  { position: 'GK', count: 3, basePrice: 4.0 },
  { position: 'DEF', count: 8, basePrice: 4.5 },
  { position: 'MID', count: 8, basePrice: 5.5 },
  { position: 'FWD', count: 7, basePrice: 6.0 },
];

const POSITION_LABELS: Record<PlayerPositionCode, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
};

const POSITION_PRICE_STEP: Record<PlayerPositionCode, number> = {
  GK: 0.15,
  DEF: 0.2,
  MID: 0.3,
  FWD: 0.35,
};

const POSITION_SORT_ORDER: Record<PlayerPositionCode, number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
};

function parseOrdinal(frontendId: string, teamFrontendId: string) {
  const match = frontendId.match(new RegExp(`^p_${teamFrontendId}_(\\d+)$`, 'i'));
  return match ? Number.parseInt(match[1], 10) : null;
}

function buildAutoPlayer(input: {
  team: WorldCupSeedTeam;
  position: PlayerPositionCode;
  positionOrdinal: number;
  overallOrdinal: number;
}): WorldCupSeedPlayer {
  const { team, position, positionOrdinal, overallOrdinal } = input;
  const positionLabel = POSITION_LABELS[position];
  const price = TARGET_SQUAD_TEMPLATE.find((entry) => entry.position === position)?.basePrice ?? 4.0;
  const steppedPrice = price + POSITION_PRICE_STEP[position] * Math.max(positionOrdinal - 1, 0);

  return {
    frontendId: `p_${team.frontendId}_${overallOrdinal}`,
    name: `${team.name} ${positionLabel} ${positionOrdinal}`,
    shortName: `${team.shortName} ${position}${positionOrdinal}`,
    teamCode: team.code,
    position,
    price: steppedPrice.toFixed(2),
    totalPoints: 0,
    minutesPlayed: 0,
    isInjured: false,
    isSuspended: false,
    isActive: true,
  };
}

function expandTeamSquad(team: WorldCupSeedTeam) {
  const curatedPlayers = WORLD_CUP_2026_PLAYERS.filter((player) => player.teamCode === team.code).map((player) => ({
    frontendId: player.frontendId,
    name: player.name,
    shortName: player.shortName,
    teamCode: player.teamCode,
    position: player.position,
    price: player.price,
    totalPoints: player.totalPoints,
    minutesPlayed: player.minutesPlayed,
    isInjured: player.isInjured,
    isSuspended: player.isSuspended,
    isActive: player.isActive,
  } satisfies WorldCupSeedPlayer));

  const nextOrdinalSeed = curatedPlayers.reduce((maxValue, player) => {
    const ordinal = parseOrdinal(player.frontendId, team.frontendId);
    return ordinal && ordinal > maxValue ? ordinal : maxValue;
  }, 0);

  let nextOverallOrdinal = nextOrdinalSeed + 1;

  const generatedPlayers: WorldCupSeedPlayer[] = [];
  for (const template of TARGET_SQUAD_TEMPLATE) {
    const existingForPosition = curatedPlayers.filter((player) => player.position === template.position).length;
    for (let positionOrdinal = existingForPosition + 1; positionOrdinal <= template.count; positionOrdinal += 1) {
      generatedPlayers.push(
        buildAutoPlayer({
          team,
          position: template.position,
          positionOrdinal,
          overallOrdinal: nextOverallOrdinal,
        }),
      );
      nextOverallOrdinal += 1;
    }
  }

  return [...curatedPlayers, ...generatedPlayers].sort((left, right) => {
    const positionCompare = POSITION_SORT_ORDER[left.position] - POSITION_SORT_ORDER[right.position];
    if (positionCompare !== 0) {
      return positionCompare;
    }

    return left.frontendId.localeCompare(right.frontendId);
  });
}

export const WORLD_CUP_2026_FULL_PLAYERS = WORLD_CUP_2026_TEAMS.flatMap((team) => expandTeamSquad(team));
