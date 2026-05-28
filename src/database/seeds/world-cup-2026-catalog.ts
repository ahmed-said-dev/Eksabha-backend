import { PlayerPosition } from '../../common/database';
import {
  groups as frontendGroups,
  teams as frontendTeams,
  getTeamFlagAssetUrl,
} from '../../../../src/data/teams';
import { players as frontendPlayers } from '../../../../src/data/players';

const TEAM_CODE_BY_FRONTEND_ID = new Map(
  frontendTeams.map((team) => [team.id, team.code ?? team.shortName]),
);

const POSITION_MAP: Record<string, PlayerPosition> = {
  GK: PlayerPosition.GOALKEEPER,
  DEF: PlayerPosition.DEFENDER,
  MID: PlayerPosition.MIDFIELDER,
  FWD: PlayerPosition.FORWARD,
};

export const WORLD_CUP_2026_GROUPS = frontendGroups.map((group, index) => ({
  code: group.id,
  label: group.label,
  order: index + 1,
}));

export const WORLD_CUP_2026_TEAMS = frontendTeams.map((team) => ({
  frontendId: team.id,
  name: team.name,
  shortName: team.shortName,
  code: team.code ?? team.shortName,
  groupCode: team.groupId,
  flagUrl: getTeamFlagAssetUrl(team.id) ?? team.flagUrl ?? null,
  isEliminated: team.eliminated,
}));

export const WORLD_CUP_2026_PLAYERS = frontendPlayers.map((player) => ({
  frontendId: player.id,
  name: player.name,
  shortName: player.shortName,
  teamCode: TEAM_CODE_BY_FRONTEND_ID.get(player.teamId) ?? player.teamId.toUpperCase(),
  position: POSITION_MAP[player.position],
  price: player.price.toFixed(2),
  totalPoints: player.totalPoints,
  minutesPlayed: player.minutesPlayed,
  isInjured: player.isInjured,
  isSuspended: player.isSuspended,
  isActive: true,
}));

