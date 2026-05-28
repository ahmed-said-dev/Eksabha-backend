import { hash } from 'bcryptjs';
import { DataSource } from 'typeorm';

import { readActiveCompetitionConfigFromEnv } from '../../common/config/competition.config';
import { PlayerPosition, TournamentPhase } from '../../common/database';
import { PlayerEntity } from '../../modules/catalog/entities/player.entity';
import { PlayerPriceEntity } from '../../modules/catalog/entities/player-price.entity';
import { TeamEntity } from '../../modules/catalog/entities/team.entity';
import { FantasyPickEntity } from '../../modules/fantasy/entities/fantasy-pick.entity';
import { FantasyPickSnapshotEntity } from '../../modules/fantasy/entities/fantasy-pick-snapshot.entity';
import { FantasyTeamEntity } from '../../modules/fantasy/entities/fantasy-team.entity';
import { FantasyTeamSnapshotEntity } from '../../modules/fantasy/entities/fantasy-team-snapshot.entity';
import { MatchdayLockEntity } from '../../modules/fantasy/entities/matchday-lock.entity';
import { TransferEntity } from '../../modules/fantasy/entities/transfer.entity';
import { LeaderboardEntryEntity } from '../../modules/leaderboards/entities/leaderboard-entry.entity';
import { CupEntryEntity, CupEntryStatus } from '../../modules/leagues/entities/cup-entry.entity';
import { CupFixtureEntity, CupFixtureStatus } from '../../modules/leagues/entities/cup-fixture.entity';
import { CupRoundEntity, CupRoundStatus } from '../../modules/leagues/entities/cup-round.entity';
import { CupEntity, CupStatus, CupType } from '../../modules/leagues/entities/cup.entity';
import { LeagueEntity, LeagueCategory, LeagueScoringMode, LeagueStatus, LeagueType } from '../../modules/leagues/entities/league.entity';
import {
  LeagueHeadToHeadFixtureEntity,
  LeagueHeadToHeadFixtureStatus,
} from '../../modules/leagues/entities/league-head-to-head-fixture.entity';
import {
  LeagueJoinSource,
  LeagueMembershipEntity,
  LeagueMembershipRole,
  LeagueMembershipStatus,
} from '../../modules/leagues/entities/league-membership.entity';
import { LeaguePendingEntryEntity, LeaguePendingEntryStatus } from '../../modules/leagues/entities/league-pending-entry.entity';
import { FixtureScoringRunEntity } from '../../modules/scoring/entities/fixture-scoring-run.entity';
import { PlayerScoreEventEntity } from '../../modules/scoring/entities/player-score-event.entity';
import { PlayerScoreLogEntity } from '../../modules/scoring/entities/player-score-log.entity';
import { ScoringRuleEntity } from '../../modules/scoring/entities/scoring-rule.entity';
import { ScoringRuleSetEntity } from '../../modules/scoring/entities/scoring-rule-set.entity';
import { FixtureEntity } from '../../modules/tournament/entities/fixture.entity';
import { GroupEntity } from '../../modules/tournament/entities/group.entity';
import { MatchdayEntity, MatchdayStatus } from '../../modules/tournament/entities/matchday.entity';
import { TournamentEntity, TournamentStatus } from '../../modules/tournament/entities/tournament.entity';
import { UserProfileEntity } from '../../modules/users/entities/user-profile.entity';
import { UserAccountType, UserEntity, UserStatus } from '../../modules/users/entities/user.entity';
import {
  WORLD_CUP_2026_GROUPS,
  WORLD_CUP_2026_TEAMS,
} from './world-cup-2026-catalog.generated';
import { WORLD_CUP_2026_FULL_PLAYERS } from './world-cup-2026-full-player-catalog.generated';

type SeedGroup = {
  code: string;
  label: string;
  order: number;
};

type SeedTeam = {
  frontendId: string;
  name: string;
  shortName: string;
  code: string;
  groupCode: string | null;
  flagUrl: string | null;
  externalProviderId: string | null;
  isEliminated: boolean;
};

type SeedPlayer = {
  frontendId: string;
  name: string;
  shortName: string;
  teamCode: string;
  position: PlayerPosition;
  price: string;
  totalPoints: number;
  minutesPlayed: number;
  isInjured: boolean;
  isSuspended: boolean;
  isActive: boolean;
  externalProviderId: string | null;
};

type SeedMatchday = {
  number: number;
  phase: TournamentPhase;
  status: MatchdayStatus;
  opensAt: Date | null;
  deadlineAt: Date;
  locksAt: Date | null;
};

type SeedFixture = {
  phase: TournamentPhase;
  groupCode: string | null;
  matchdayNumber: number;
  venue: string;
  kickoffAt: Date;
  homeTeamCode: string;
  awayTeamCode: string;
};

type SeedPick = {
  playerFrontendId: string;
  positionOrder: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isBenched: boolean;
  multiplier: number;
};

type SeedDefinition = {
  key: string;
  name: string;
  slug: string;
  format: string;
  country: string | null;
  year: number;
  currentPhase: TournamentPhase;
  currentMatchdayNumber: number;
  totalGroups: number;
  totalTeams: number;
  status: TournamentStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  groups: SeedGroup[];
  teams: SeedTeam[];
  players: SeedPlayer[];
  matchdays: SeedMatchday[];
  fixtures: SeedFixture[];
  sampleFantasyTeamName: string;
  desiredSeedSquad: SeedPick[];
  leagueName: string;
  leagueJoinCode: string;
  scoringRuleSetName: string;
  scoringRuleSetCode: string;
  scoringRuleSetDescription: string;
};

function normalizeCatalogKey(value: string) {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function buildWorldCupSeedDefinition(): SeedDefinition {
  return {
    key: 'world-cup-2026',
    name: 'FIFA World Cup 2026',
    slug: 'world-cup-2026',
    format: 'world_cup',
    country: null,
    year: 2026,
    currentPhase: TournamentPhase.GROUP_STAGE_MD1,
    currentMatchdayNumber: 1,
    totalGroups: 12,
    totalTeams: 48,
    status: TournamentStatus.MATCHDAY_OPEN,
    startsAt: new Date('2026-06-11T18:00:00.000Z'),
    endsAt: new Date('2026-07-19T18:00:00.000Z'),
    groups: WORLD_CUP_2026_GROUPS.map((group) => ({
      code: group.code,
      label: group.label,
      order: group.order,
    })),
    teams: WORLD_CUP_2026_TEAMS.map((team) => ({
      frontendId: team.frontendId,
      name: team.name,
      shortName: team.shortName,
      code: team.code,
      groupCode: team.groupCode,
      flagUrl: team.flagUrl,
      externalProviderId: team.frontendId.toLowerCase(),
      isEliminated: team.isEliminated,
    })),
    players: WORLD_CUP_2026_FULL_PLAYERS.map((player) => ({
      frontendId: player.frontendId,
      name: player.name,
      shortName: player.shortName,
      teamCode: player.teamCode,
      position: player.position as PlayerPosition,
      price: player.price,
      totalPoints: player.totalPoints,
      minutesPlayed: player.minutesPlayed,
      isInjured: player.isInjured,
      isSuspended: player.isSuspended,
      isActive: player.isActive,
      externalProviderId: player.frontendId,
    })),
    matchdays: [
      {
        number: 1,
        phase: TournamentPhase.GROUP_STAGE_MD1,
        status: MatchdayStatus.OPEN,
        opensAt: new Date('2026-06-01T00:00:00.000Z'),
        deadlineAt: new Date('2026-06-11T16:00:00.000Z'),
        locksAt: new Date('2026-06-11T16:00:00.000Z'),
      },
    ],
    fixtures: [
      {
        phase: TournamentPhase.GROUP_STAGE_MD1,
        groupCode: 'A',
        matchdayNumber: 1,
        venue: 'MetLife Stadium',
        kickoffAt: new Date('2026-06-11T18:00:00.000Z'),
        homeTeamCode: 'USA',
        awayTeamCode: 'MEX',
      },
      {
        phase: TournamentPhase.GROUP_STAGE_MD1,
        groupCode: 'B',
        matchdayNumber: 1,
        venue: 'Estadio Azteca',
        kickoffAt: new Date('2026-06-12T18:00:00.000Z'),
        homeTeamCode: 'ARG',
        awayTeamCode: 'FRA',
      },
    ],
    sampleFantasyTeamName: 'Apex Dream XI',
    desiredSeedSquad: [
      { playerFrontendId: 'p_bra_1', positionOrder: 1, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_fra_2', positionOrder: 2, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_ned_2', positionOrder: 3, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_bra_2', positionOrder: 4, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_can_2', positionOrder: 5, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_eng_3', positionOrder: 6, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_por_3', positionOrder: 7, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_uru_3', positionOrder: 8, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_usa_3', positionOrder: 9, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_fra_3', positionOrder: 10, isCaptain: true, isViceCaptain: false, isBenched: false, multiplier: 2 },
      { playerFrontendId: 'p_egy_3', positionOrder: 11, isCaptain: false, isViceCaptain: true, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_bel_1', positionOrder: 12, isCaptain: false, isViceCaptain: false, isBenched: true, multiplier: 1 },
      { playerFrontendId: 'p_mar_2', positionOrder: 13, isCaptain: false, isViceCaptain: false, isBenched: true, multiplier: 1 },
      { playerFrontendId: 'p_ger_3', positionOrder: 14, isCaptain: false, isViceCaptain: false, isBenched: true, multiplier: 1 },
      { playerFrontendId: 'p_arg_3', positionOrder: 15, isCaptain: false, isViceCaptain: false, isBenched: true, multiplier: 1 },
    ],
    leagueName: 'Apex World Cup Seed League',
    leagueJoinCode: 'APEX-WC26',
    scoringRuleSetName: 'Default World Cup 2026 Rules',
    scoringRuleSetCode: 'default-world-cup-2026',
    scoringRuleSetDescription: 'Default fantasy scoring rules for the FIFA World Cup 2026 experience.',
  };
}

function buildEgyptLeagueSeedDefinition(): SeedDefinition {
  return {
    key: 'egyptian-premier-league-current',
    name: 'Egyptian Premier League',
    slug: 'egyptian-premier-league-current',
    format: 'league',
    country: 'Egypt',
    year: 2026,
    currentPhase: TournamentPhase.REGULAR_SEASON,
    currentMatchdayNumber: 1,
    totalGroups: 0,
    totalTeams: 18,
    status: TournamentStatus.MATCHDAY_OPEN,
    startsAt: new Date('2025-08-08T17:00:00.000Z'),
    endsAt: new Date('2026-06-30T21:00:00.000Z'),
    groups: [],
    teams: [
      { frontendId: 'alahly', name: 'Al Ahly', shortName: 'AHL', code: 'AHL', groupCode: null, flagUrl: null, externalProviderId: 'alahly', isEliminated: false },
      { frontendId: 'zamalek', name: 'Zamalek', shortName: 'ZAM', code: 'ZAM', groupCode: null, flagUrl: null, externalProviderId: 'zamalek', isEliminated: false },
      { frontendId: 'pyramids', name: 'Pyramids', shortName: 'PYR', code: 'PYR', groupCode: null, flagUrl: null, externalProviderId: 'pyramids', isEliminated: false },
      { frontendId: 'masry', name: 'Al Masry', shortName: 'MAS', code: 'MAS', groupCode: null, flagUrl: null, externalProviderId: 'masry', isEliminated: false },
      { frontendId: 'ceramica', name: 'Ceramica Cleopatra', shortName: 'CER', code: 'CER', groupCode: null, flagUrl: null, externalProviderId: 'ceramica', isEliminated: false },
      { frontendId: 'ismaily', name: 'Ismaily', shortName: 'ISM', code: 'ISM', groupCode: null, flagUrl: null, externalProviderId: 'ismaily', isEliminated: false },
    ],
    players: [
      { frontendId: 'p_alahly_1', name: 'Mohamed El Shenawy', shortName: 'El Shenawy', teamCode: 'AHL', position: PlayerPosition.GOALKEEPER, price: '5.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_alahly_1' },
      { frontendId: 'p_alahly_2', name: 'Mohamed Hany', shortName: 'M. Hany', teamCode: 'AHL', position: PlayerPosition.DEFENDER, price: '5.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_alahly_2' },
      { frontendId: 'p_alahly_3', name: 'Emam Ashour', shortName: 'Ashour', teamCode: 'AHL', position: PlayerPosition.MIDFIELDER, price: '8.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_alahly_3' },
      { frontendId: 'p_alahly_4', name: 'Wessam Abou Ali', shortName: 'Abou Ali', teamCode: 'AHL', position: PlayerPosition.FORWARD, price: '9.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_alahly_4' },
      { frontendId: 'p_zamalek_1', name: 'Mohamed Sobhy', shortName: 'Sobhy', teamCode: 'ZAM', position: PlayerPosition.GOALKEEPER, price: '5.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_zamalek_1' },
      { frontendId: 'p_zamalek_2', name: 'Omar Gaber', shortName: 'O. Gaber', teamCode: 'ZAM', position: PlayerPosition.DEFENDER, price: '5.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_zamalek_2' },
      { frontendId: 'p_zamalek_3', name: 'Ahmed Sayed Zizo', shortName: 'Zizo', teamCode: 'ZAM', position: PlayerPosition.MIDFIELDER, price: '10.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_zamalek_3' },
      { frontendId: 'p_zamalek_4', name: 'Seif El Din Jaziri', shortName: 'Jaziri', teamCode: 'ZAM', position: PlayerPosition.FORWARD, price: '8.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_zamalek_4' },
      { frontendId: 'p_pyramids_1', name: 'Ahmed El Shenawy', shortName: 'A. Shenawy', teamCode: 'PYR', position: PlayerPosition.GOALKEEPER, price: '5.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_pyramids_1' },
      { frontendId: 'p_pyramids_2', name: 'Mohamed Hamdy', shortName: 'M. Hamdy', teamCode: 'PYR', position: PlayerPosition.DEFENDER, price: '5.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_pyramids_2' },
      { frontendId: 'p_pyramids_3', name: 'Ramadan Sobhi', shortName: 'R. Sobhi', teamCode: 'PYR', position: PlayerPosition.MIDFIELDER, price: '8.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_pyramids_3' },
      { frontendId: 'p_pyramids_4', name: 'Fiston Mayele', shortName: 'Mayele', teamCode: 'PYR', position: PlayerPosition.FORWARD, price: '9.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_pyramids_4' },
      { frontendId: 'p_masry_1', name: 'Mahmoud Gad', shortName: 'M. Gad', teamCode: 'MAS', position: PlayerPosition.GOALKEEPER, price: '4.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_masry_1' },
      { frontendId: 'p_masry_2', name: 'Karim El Iraqi', shortName: 'El Iraqi', teamCode: 'MAS', position: PlayerPosition.DEFENDER, price: '4.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_masry_2' },
      { frontendId: 'p_masry_3', name: 'Mido Gaber', shortName: 'Mido', teamCode: 'MAS', position: PlayerPosition.MIDFIELDER, price: '6.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_masry_3' },
      { frontendId: 'p_masry_4', name: 'Fakhreddine Ben Youssef', shortName: 'Ben Youssef', teamCode: 'MAS', position: PlayerPosition.FORWARD, price: '7.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_masry_4' },
      { frontendId: 'p_ceramica_1', name: 'Mohamed Bassam', shortName: 'Bassam', teamCode: 'CER', position: PlayerPosition.GOALKEEPER, price: '4.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_ceramica_1' },
      { frontendId: 'p_ceramica_2', name: 'Ahmed Ramadan Beckham', shortName: 'Beckham', teamCode: 'CER', position: PlayerPosition.DEFENDER, price: '4.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_ceramica_2' },
      { frontendId: 'p_ceramica_3', name: 'Mohamed Adel', shortName: 'M. Adel', teamCode: 'CER', position: PlayerPosition.MIDFIELDER, price: '6.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_ceramica_3' },
      { frontendId: 'p_ceramica_4', name: 'John Ebuka', shortName: 'Ebuka', teamCode: 'CER', position: PlayerPosition.FORWARD, price: '7.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_ceramica_4' },
      { frontendId: 'p_ismaily_1', name: 'Ahmed Adel', shortName: 'A. Adel', teamCode: 'ISM', position: PlayerPosition.GOALKEEPER, price: '4.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_ismaily_1' },
      { frontendId: 'p_ismaily_2', name: 'Mohamed Nasr', shortName: 'M. Nasr', teamCode: 'ISM', position: PlayerPosition.DEFENDER, price: '4.00', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_ismaily_2' },
      { frontendId: 'p_ismaily_3', name: 'Abdelrahman Magdy', shortName: 'A. Magdy', teamCode: 'ISM', position: PlayerPosition.MIDFIELDER, price: '6.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_ismaily_3' },
      { frontendId: 'p_ismaily_4', name: 'Yaaw Annor', shortName: 'Annor', teamCode: 'ISM', position: PlayerPosition.FORWARD, price: '6.50', totalPoints: 0, minutesPlayed: 0, isInjured: false, isSuspended: false, isActive: true, externalProviderId: 'p_ismaily_4' },
    ],
    matchdays: [
      {
        number: 1,
        phase: TournamentPhase.REGULAR_SEASON,
        status: MatchdayStatus.OPEN,
        opensAt: new Date('2025-08-01T00:00:00.000Z'),
        deadlineAt: new Date('2025-08-08T15:00:00.000Z'),
        locksAt: new Date('2025-08-08T15:00:00.000Z'),
      },
    ],
    fixtures: [
      {
        phase: TournamentPhase.REGULAR_SEASON,
        groupCode: null,
        matchdayNumber: 1,
        venue: 'Cairo International Stadium',
        kickoffAt: new Date('2025-08-08T17:00:00.000Z'),
        homeTeamCode: 'AHL',
        awayTeamCode: 'ZAM',
      },
      {
        phase: TournamentPhase.REGULAR_SEASON,
        groupCode: null,
        matchdayNumber: 1,
        venue: '30 June Stadium',
        kickoffAt: new Date('2025-08-09T17:00:00.000Z'),
        homeTeamCode: 'PYR',
        awayTeamCode: 'MAS',
      },
      {
        phase: TournamentPhase.REGULAR_SEASON,
        groupCode: null,
        matchdayNumber: 1,
        venue: 'Suez Stadium',
        kickoffAt: new Date('2025-08-10T17:00:00.000Z'),
        homeTeamCode: 'CER',
        awayTeamCode: 'ISM',
      },
    ],
    sampleFantasyTeamName: 'Apex Nile XI',
    desiredSeedSquad: [
      { playerFrontendId: 'p_zamalek_1', positionOrder: 1, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_zamalek_2', positionOrder: 2, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_pyramids_2', positionOrder: 3, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_masry_2', positionOrder: 4, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_ceramica_2', positionOrder: 5, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_alahly_3', positionOrder: 6, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_zamalek_3', positionOrder: 7, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_pyramids_3', positionOrder: 8, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_ceramica_3', positionOrder: 9, isCaptain: false, isViceCaptain: false, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_alahly_4', positionOrder: 10, isCaptain: true, isViceCaptain: false, isBenched: false, multiplier: 2 },
      { playerFrontendId: 'p_pyramids_4', positionOrder: 11, isCaptain: false, isViceCaptain: true, isBenched: false, multiplier: 1 },
      { playerFrontendId: 'p_alahly_1', positionOrder: 12, isCaptain: false, isViceCaptain: false, isBenched: true, multiplier: 1 },
      { playerFrontendId: 'p_ismaily_2', positionOrder: 13, isCaptain: false, isViceCaptain: false, isBenched: true, multiplier: 1 },
      { playerFrontendId: 'p_ismaily_3', positionOrder: 14, isCaptain: false, isViceCaptain: false, isBenched: true, multiplier: 1 },
      { playerFrontendId: 'p_zamalek_4', positionOrder: 15, isCaptain: false, isViceCaptain: false, isBenched: true, multiplier: 1 },
    ],
    leagueName: 'Apex Egyptian League',
    leagueJoinCode: 'APEX-EGY26',
    scoringRuleSetName: 'Default Egyptian League Rules',
    scoringRuleSetCode: 'default-egyptian-premier-league',
    scoringRuleSetDescription: 'Default fantasy scoring rules for the Egyptian Premier League experience.',
  };
}

function buildSeedDefinition(activeCompetitionKey: string): SeedDefinition {
  switch (activeCompetitionKey) {
    case 'egyptian-premier-league-current':
      return buildEgyptLeagueSeedDefinition();
    case 'world-cup-2026':
    default:
      return buildWorldCupSeedDefinition();
  }
}

export async function runAppSeed(dataSource: DataSource) {
  const activeCompetition = readActiveCompetitionConfigFromEnv(process.env as Record<string, string | undefined>);
  const seedDefinitions = [
    buildWorldCupSeedDefinition(),
    buildEgyptLeagueSeedDefinition(),
  ];
  const seededCompetitions: Array<Record<string, unknown>> = [];

  const tournamentRepository = dataSource.getRepository(TournamentEntity);
  const groupRepository = dataSource.getRepository(GroupEntity);
  const matchdayRepository = dataSource.getRepository(MatchdayEntity);
  const teamRepository = dataSource.getRepository(TeamEntity);
  const playerRepository = dataSource.getRepository(PlayerEntity);
  const playerPriceRepository = dataSource.getRepository(PlayerPriceEntity);
  const fixtureRepository = dataSource.getRepository(FixtureEntity);
  const userRepository = dataSource.getRepository(UserEntity);
  const userProfileRepository = dataSource.getRepository(UserProfileEntity);
  const fantasyTeamRepository = dataSource.getRepository(FantasyTeamEntity);
  const fantasyPickRepository = dataSource.getRepository(FantasyPickEntity);
  const fantasyTeamSnapshotRepository = dataSource.getRepository(FantasyTeamSnapshotEntity);
  const fantasyPickSnapshotRepository = dataSource.getRepository(FantasyPickSnapshotEntity);
  const matchdayLockRepository = dataSource.getRepository(MatchdayLockEntity);
  const transferRepository = dataSource.getRepository(TransferEntity);
  const leagueRepository = dataSource.getRepository(LeagueEntity);
  const leagueMembershipRepository = dataSource.getRepository(LeagueMembershipEntity);
  const cupRepository = dataSource.getRepository(CupEntity);
  const cupEntryRepository = dataSource.getRepository(CupEntryEntity);
  const cupRoundRepository = dataSource.getRepository(CupRoundEntity);
  const cupFixtureRepository = dataSource.getRepository(CupFixtureEntity);
  const leaguePendingEntryRepository = dataSource.getRepository(LeaguePendingEntryEntity);
  const leagueHeadToHeadFixtureRepository = dataSource.getRepository(LeagueHeadToHeadFixtureEntity);
  const leaderboardEntryRepository = dataSource.getRepository(LeaderboardEntryEntity);
  const playerScoreLogRepository = dataSource.getRepository(PlayerScoreLogEntity);
  const playerScoreEventRepository = dataSource.getRepository(PlayerScoreEventEntity);
  const fixtureScoringRunRepository = dataSource.getRepository(FixtureScoringRunEntity);
  const scoringRuleSetRepository = dataSource.getRepository(ScoringRuleSetEntity);
  const scoringRuleRepository = dataSource.getRepository(ScoringRuleEntity);

  const defaultScoringRules = [
    { eventType: 'goal', position: PlayerPosition.GOALKEEPER, points: 6, description: 'Goal scored by a goalkeeper' },
    { eventType: 'goal', position: PlayerPosition.DEFENDER, points: 6, description: 'Goal scored by a defender' },
    { eventType: 'goal', position: PlayerPosition.MIDFIELDER, points: 5, description: 'Goal scored by a midfielder' },
    { eventType: 'goal', position: PlayerPosition.FORWARD, points: 4, description: 'Goal scored by a forward' },
    { eventType: 'assist', position: PlayerPosition.GOALKEEPER, points: 3, description: 'Assist recorded by a goalkeeper' },
    { eventType: 'assist', position: PlayerPosition.DEFENDER, points: 3, description: 'Assist recorded by a defender' },
    { eventType: 'assist', position: PlayerPosition.MIDFIELDER, points: 3, description: 'Assist recorded by a midfielder' },
    { eventType: 'assist', position: PlayerPosition.FORWARD, points: 3, description: 'Assist recorded by a forward' },
    { eventType: 'clean_sheet', position: PlayerPosition.GOALKEEPER, points: 4, description: 'Clean sheet for a goalkeeper' },
    { eventType: 'clean_sheet', position: PlayerPosition.DEFENDER, points: 4, description: 'Clean sheet for a defender' },
    { eventType: 'clean_sheet', position: PlayerPosition.MIDFIELDER, points: 1, description: 'Clean sheet for a midfielder' },
    { eventType: 'penalty_save', position: PlayerPosition.GOALKEEPER, points: 5, description: 'Penalty save by a goalkeeper' },
    { eventType: 'yellow_card', position: PlayerPosition.GOALKEEPER, points: -1, description: 'Yellow card penalty' },
    { eventType: 'yellow_card', position: PlayerPosition.DEFENDER, points: -1, description: 'Yellow card penalty' },
    { eventType: 'yellow_card', position: PlayerPosition.MIDFIELDER, points: -1, description: 'Yellow card penalty' },
    { eventType: 'yellow_card', position: PlayerPosition.FORWARD, points: -1, description: 'Yellow card penalty' },
    { eventType: 'red_card', position: PlayerPosition.GOALKEEPER, points: -3, description: 'Red card penalty' },
    { eventType: 'red_card', position: PlayerPosition.DEFENDER, points: -3, description: 'Red card penalty' },
    { eventType: 'red_card', position: PlayerPosition.MIDFIELDER, points: -3, description: 'Red card penalty' },
    { eventType: 'red_card', position: PlayerPosition.FORWARD, points: -3, description: 'Red card penalty' },
  ];

  for (const seedDefinition of seedDefinitions) {
  let tournament = await tournamentRepository.findOne({
    where: [{ competitionKey: seedDefinition.key }, { slug: seedDefinition.slug }],
  });

  tournament ??= tournamentRepository.create();

  tournament.competitionKey = seedDefinition.key;
  tournament.name = seedDefinition.name;
  tournament.slug = seedDefinition.slug;
  tournament.format = seedDefinition.format;
  tournament.country = seedDefinition.country;
  tournament.year = seedDefinition.year;
  tournament.currentPhase = seedDefinition.currentPhase;
  tournament.currentMatchdayNumber = seedDefinition.currentMatchdayNumber;
  tournament.totalGroups = seedDefinition.totalGroups;
  tournament.totalTeams = seedDefinition.totalTeams;
  tournament.status = seedDefinition.status;
  tournament.startsAt = seedDefinition.startsAt;
  tournament.endsAt = seedDefinition.endsAt;
  tournament = await tournamentRepository.save(tournament);

  const groups: GroupEntity[] = [];
  for (const seedGroup of seedDefinition.groups) {
    let group = await groupRepository.findOne({
      where: { code: seedGroup.code, tournament: { id: tournament.id } },
      relations: { tournament: true },
    });

    group ??= groupRepository.create();

    group.code = seedGroup.code;
    group.label = seedGroup.label;
    group.displayOrder = seedGroup.order;
    group.tournament = tournament;
    group = await groupRepository.save(group);
    groups.push(group);
  }

  const matchdaysByNumber = new Map<number, MatchdayEntity>();
  for (const seedMatchday of seedDefinition.matchdays) {
    let matchday = await matchdayRepository.findOne({
      where: { tournament: { id: tournament.id }, number: seedMatchday.number },
      relations: { tournament: true },
    });

    matchday ??= matchdayRepository.create();

    matchday.tournament = tournament;
    matchday.number = seedMatchday.number;
    matchday.phase = seedMatchday.phase;
    matchday.status = seedMatchday.status;
    matchday.opensAt = seedMatchday.opensAt;
    matchday.deadlineAt = seedMatchday.deadlineAt;
    matchday.locksAt = seedMatchday.locksAt;
    matchday = await matchdayRepository.save(matchday);
    matchdaysByNumber.set(matchday.number, matchday);

    await fantasyPickSnapshotRepository
      .createQueryBuilder()
      .delete()
      .from(FantasyPickSnapshotEntity)
      .where(
        'fantasy_team_snapshot_id IN (SELECT id FROM fantasy_team_snapshots WHERE matchday_id = :matchdayId)',
        { matchdayId: matchday.id },
      )
      .execute();

    await fantasyTeamSnapshotRepository
      .createQueryBuilder()
      .delete()
      .from(FantasyTeamSnapshotEntity)
      .where('matchday_id = :matchdayId', { matchdayId: matchday.id })
      .execute();

    await matchdayLockRepository
      .createQueryBuilder()
      .delete()
      .from(MatchdayLockEntity)
      .where('matchday_id = :matchdayId', { matchdayId: matchday.id })
      .execute();
  }

  const teams: TeamEntity[] = [];
  for (const seedTeam of seedDefinition.teams) {
    const group = seedTeam.groupCode
      ? groups.find((item) => item.code === seedTeam.groupCode) ?? null
      : null;

    let team = await teamRepository.findOne({
      where: { code: seedTeam.code, tournament: { id: tournament.id } },
      relations: { tournament: true, group: true },
    });

    if (!team) {
      team = teamRepository.create();
    }

    team.name = seedTeam.name;
    team.shortName = seedTeam.shortName;
    team.code = seedTeam.code;
    team.tournament = tournament;
    team.group = group;
    team.flagUrl = seedTeam.flagUrl;
    team.externalProviderId = seedTeam.externalProviderId;
    team.isEliminated = seedTeam.isEliminated;
    team = await teamRepository.save(team);
    teams.push(team);
  }

  const players: PlayerEntity[] = [];
  for (const seedPlayer of seedDefinition.players) {
    const team = teams.find((item) => item.code === seedPlayer.teamCode);

    if (!team) {
      throw new Error(`Seed team ${seedPlayer.teamCode} was not found for player ${seedPlayer.name}.`);
    }

    const existingTeamPlayers = await playerRepository.find({
      where: { team: { id: team.id } },
      relations: { team: true },
    });

    let player = existingTeamPlayers.find(
      (candidate) =>
        candidate.externalProviderId === seedPlayer.externalProviderId
        || normalizeCatalogKey(candidate.name) === normalizeCatalogKey(seedPlayer.name)
        || normalizeCatalogKey(candidate.shortName) === normalizeCatalogKey(seedPlayer.shortName),
    );

    if (!player) {
      player = playerRepository.create();
    }

    player.name = seedPlayer.name;
    player.shortName = seedPlayer.shortName;
    player.position = seedPlayer.position;
    player.currentPrice = seedPlayer.price;
    player.team = team;
    player.externalProviderId = seedPlayer.externalProviderId;
    player.isActive = seedPlayer.isActive;
    player.isInjured = seedPlayer.isInjured;
    player.isSuspended = seedPlayer.isSuspended;
    player.minutesPlayed = seedPlayer.minutesPlayed;
    player.totalPoints = seedPlayer.totalPoints;
    player = await playerRepository.save(player);

    const existingPrice = await playerPriceRepository.findOne({
      where: { player: { id: player.id }, price: seedPlayer.price },
      relations: { player: true },
    });

    if (!existingPrice) {
      await playerPriceRepository.save(
        playerPriceRepository.create({
          player,
          price: seedPlayer.price,
          effectiveAt: seedDefinition.startsAt ?? new Date(),
          reason: 'initial_seed',
        }),
      );
    }

    players.push(player);
  }

  for (const seedFixture of seedDefinition.fixtures) {
    const homeTeam = teams.find((team) => team.code === seedFixture.homeTeamCode);
    const awayTeam = teams.find((team) => team.code === seedFixture.awayTeamCode);
    const group = seedFixture.groupCode
      ? groups.find((item) => item.code === seedFixture.groupCode) ?? null
      : null;
    const matchday = matchdaysByNumber.get(seedFixture.matchdayNumber) ?? null;

    if (!homeTeam || !awayTeam || !matchday) {
      throw new Error(`Seed fixture ${seedFixture.homeTeamCode} vs ${seedFixture.awayTeamCode} could not resolve teams or matchday.`);
    }

    let fixture = await fixtureRepository.findOne({
      where: {
        tournament: { id: tournament.id },
        homeTeam: { id: homeTeam.id },
        awayTeam: { id: awayTeam.id },
      },
      relations: { tournament: true, homeTeam: true, awayTeam: true, matchday: true, group: true },
    });

    if (!fixture) {
      fixture = fixtureRepository.create();
    }

    fixture.tournament = tournament;
    fixture.matchday = matchday;
    fixture.group = group;
    fixture.phase = seedFixture.phase;
    fixture.status = 'scheduled' as never;
    fixture.kickoffAt = seedFixture.kickoffAt;
    fixture.venue = seedFixture.venue;
    fixture.homeScore = null;
    fixture.awayScore = null;
    fixture.currentMinute = null;
    fixture.externalProviderId = fixture.externalProviderId ?? null;
    fixture.homeTeam = homeTeam;
    fixture.awayTeam = awayTeam;
    await fixtureRepository.save(fixture);
  }

  let sampleUser = await userRepository.findOne({
    where: { email: 'manager@example.com' },
    relations: { profile: true },
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const adminEmail = (process.env.ADMIN_EMAIL ?? (isProduction ? '' : 'admin@worldcupfantasy.local')).trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? (isProduction ? '' : 'Admin123!');
  const adminDisplayName = (process.env.ADMIN_DISPLAY_NAME ?? 'Platform Administrator').trim();

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be provided before seeding admin account.');
  }

  let adminUser = await userRepository.findOne({
    where: { email: adminEmail },
    relations: { profile: true },
  });

  if (!adminUser) {
    adminUser = await userRepository.save(
      userRepository.create({
        email: adminEmail,
        passwordHash: await hash(adminPassword, 10),
        accountType: UserAccountType.ADMIN,
        status: UserStatus.ACTIVE,
        lastLoginAt: new Date(),
      }),
    );
  } else {
    adminUser.accountType = UserAccountType.ADMIN;
    adminUser.status = UserStatus.ACTIVE;
    adminUser.passwordHash = await hash(adminPassword, 10);
    adminUser.lastLoginAt = new Date();
    adminUser = await userRepository.save(adminUser);
  }

  if (!adminUser.profile) {
    const adminProfile = await userProfileRepository.save(
      userProfileRepository.create({
        user: adminUser,
        displayName: adminDisplayName,
        teamName: 'Admin Control Center',
        locale: 'en',
        timezone: 'UTC',
        avatarUrl: null,
      }),
    );

    adminUser.profile = adminProfile;
  } else {
    adminUser.profile.displayName = adminDisplayName;
    adminUser.profile.teamName = 'Admin Control Center';
    adminUser.profile.locale = 'en';
    adminUser.profile.timezone = 'UTC';
    adminUser.profile.avatarUrl = null;
    await userProfileRepository.save(adminUser.profile);
  }

  if (!sampleUser) {
    sampleUser = await userRepository.save(
      userRepository.create({
        email: 'manager@example.com',
        passwordHash: await hash('Manager123!', 10),
        accountType: UserAccountType.REGISTERED,
        status: UserStatus.ACTIVE,
        lastLoginAt: new Date(),
      }),
    );
  }

  if (!sampleUser.profile) {
    const profile = await userProfileRepository.save(
      userProfileRepository.create({
        user: sampleUser,
        displayName: 'Apex Manager',
        teamName: seedDefinition.sampleFantasyTeamName,
        locale: 'en',
        timezone: 'UTC',
        avatarUrl: null,
      }),
    );

    sampleUser.profile = profile;
  } else {
    sampleUser.profile.displayName = 'Apex Manager';
    sampleUser.profile.locale = 'en';
    sampleUser.profile.timezone = 'UTC';
    sampleUser.profile.avatarUrl = null;
    await userProfileRepository.save(sampleUser.profile);
  }

  let fantasyTeam = await fantasyTeamRepository.findOne({
    where: { user: { id: sampleUser.id }, tournament: { id: tournament.id } },
    relations: { user: true, tournament: true },
  });

  if (!fantasyTeam) {
    fantasyTeam = fantasyTeamRepository.create({
      user: sampleUser,
      tournament,
      name: seedDefinition.sampleFantasyTeamName,
      budgetRemaining: '100.00',
      totalBudget: '100.00',
      freeTransfers: 1,
      formationCode: '4-4-2',
      totalPoints: 0,
      teamValue: '0.00',
      activeChipType: null,
    });
  }

  const desiredSeedPlayers = seedDefinition.desiredSeedSquad.map((entry) => {
    const player = players.find((candidate) => candidate.externalProviderId === entry.playerFrontendId);

    if (!player) {
      throw new Error(`Seed fantasy squad player ${entry.playerFrontendId} was not found in the catalog.`);
    }

    return { ...entry, player };
  });

  const seededTeamValue = desiredSeedPlayers.reduce(
    (sum, entry) => sum + Number.parseFloat(entry.player.currentPrice),
    0,
  );
  const seededBudgetRemaining = Math.max(0, 100 - seededTeamValue);

  fantasyTeam.user = sampleUser;
  fantasyTeam.tournament = tournament;
  fantasyTeam.name = seedDefinition.sampleFantasyTeamName;
  fantasyTeam.budgetRemaining = seededBudgetRemaining.toFixed(2);
  fantasyTeam.totalBudget = '100.00';
  fantasyTeam.freeTransfers = 1;
  fantasyTeam.formationCode = '4-4-2';
  fantasyTeam.totalPoints = 0;
  fantasyTeam.teamValue = seededTeamValue.toFixed(2);
  fantasyTeam.activeChipType = null;
  fantasyTeam = await fantasyTeamRepository.save(fantasyTeam);

  await fantasyPickRepository
    .createQueryBuilder()
    .delete()
    .from(FantasyPickEntity)
    .where('fantasy_team_id = :fantasyTeamId', { fantasyTeamId: fantasyTeam.id })
    .execute();

  await fantasyPickRepository.save(
    desiredSeedPlayers.map((entry) =>
      fantasyPickRepository.create({
        fantasyTeam,
        player: entry.player,
        positionOrder: entry.positionOrder,
        isCaptain: entry.isCaptain,
        isViceCaptain: entry.isViceCaptain,
        isBenched: entry.isBenched,
        multiplier: entry.multiplier,
        buyPrice: entry.player.currentPrice,
        sellPrice: entry.player.currentPrice,
        livePoints: 0,
      }),
    ),
  );

  let league = await leagueRepository.findOne({
    where: [
      { name: seedDefinition.leagueName, tournament: { id: tournament.id } },
      { joinCode: seedDefinition.leagueJoinCode },
    ],
    relations: { owner: true, tournament: true },
  });

  if (!league) {
    league = leagueRepository.create();
  }

  league.name = seedDefinition.leagueName;
  league.slug = normalizeCatalogKey(seedDefinition.leagueName);
  league.type = LeagueType.PRIVATE;
  league.scoringMode = LeagueScoringMode.CLASSIC;
  league.status = LeagueStatus.OPEN;
  league.category = LeagueCategory.CUSTOM;
  league.joinCode = seedDefinition.leagueJoinCode;
  league.isPublic = false;
  league.isArchived = false;
  league.maxMembers = 100;
  league.description = `${seedDefinition.name} custom seed league`;
  league.badgeLabel = 'PRIVATE';
  league.badgeColor = null;
  league.monthlyScopeKey = null;
  league.startsFromMatchdayNumber = 1;
  league.isJoinLocked = false;
  league.allowAutoJoin = false;
  league.systemKey = null;
  league.owner = sampleUser;
  league.tournament = tournament;
  league = await leagueRepository.save(league);

  const membership = await leagueMembershipRepository.findOne({
    where: { league: { id: league.id }, user: { id: sampleUser.id } },
    relations: { league: true, user: true },
  });

  if (!membership) {
    await leagueMembershipRepository.save(
      leagueMembershipRepository.create({
        league,
        user: sampleUser,
        role: LeagueMembershipRole.OWNER,
        status: LeagueMembershipStatus.ACTIVE,
        joinSource: LeagueJoinSource.OWNER_CREATE,
        joinedAt: new Date(),
        leftAt: null,
        fantasyTeam,
        entryNameSnapshot: fantasyTeam.name,
        managerNameSnapshot: sampleUser.profile?.displayName ?? sampleUser.email ?? null,
        seedNumber: 1,
        isPendingNewEntry: false,
      }),
    );
  }

   const defaultSystemLeagues = [
    {
      name: 'Overall',
      slug: 'overall',
      type: LeagueType.GLOBAL,
      category: LeagueCategory.GENERAL,
      scoringMode: LeagueScoringMode.CLASSIC,
      joinCode: null,
      isPublic: false,
      badgeLabel: 'GLOBAL',
      systemKey: `${seedDefinition.key}-overall`,
      autoJoinSampleUser: true,
    },
    {
      name: seedDefinition.country ?? seedDefinition.name,
      slug: normalizeCatalogKey(seedDefinition.country ?? seedDefinition.name),
      type: seedDefinition.country ? LeagueType.COUNTRY : LeagueType.SYSTEM,
      category: LeagueCategory.GENERAL,
      scoringMode: LeagueScoringMode.CLASSIC,
      joinCode: null,
      isPublic: false,
      badgeLabel: seedDefinition.country ? 'COUNTRY' : 'GENERAL',
      systemKey: `${seedDefinition.key}-country`,
      autoJoinSampleUser: true,
    },
    {
      name: `${seedDefinition.name} League`,
      slug: `${seedDefinition.slug}-app-league`,
      type: LeagueType.PUBLIC,
      category: LeagueCategory.APP,
      scoringMode: LeagueScoringMode.CLASSIC,
      joinCode: `${seedDefinition.key.slice(0, 4).toUpperCase()}-APP`,
      isPublic: true,
      badgeLabel: 'APP',
      systemKey: 'app-owned-league',
      autoJoinSampleUser: false,
    },
    {
      name: 'Head To Head',
      slug: `${seedDefinition.slug}-head-to-head`,
      type: LeagueType.PUBLIC,
      category: LeagueCategory.CUSTOM,
      scoringMode: LeagueScoringMode.HEAD_TO_HEAD,
      joinCode: `${seedDefinition.key.slice(0, 4).toUpperCase()}-H2H`,
      isPublic: true,
      badgeLabel: 'H2H',
      systemKey: `${seedDefinition.key}-head-to-head`,
      autoJoinSampleUser: true,
    },
    {
      name: 'Gameweek 1',
      slug: `${seedDefinition.slug}-gameweek-1`,
      type: LeagueType.PUBLIC,
      category: LeagueCategory.GAMEWEEK,
      scoringMode: LeagueScoringMode.CLASSIC,
      joinCode: `${seedDefinition.key.slice(0, 4).toUpperCase()}-GW1`,
      isPublic: true,
      badgeLabel: 'GW1',
      systemKey: `${seedDefinition.key}-gameweek-1`,
      autoJoinSampleUser: false,
    },
  ];

  const createdSystemLeaguesByKey = new Map<string, LeagueEntity>();

  for (const systemLeagueSeed of defaultSystemLeagues) {
    let systemLeague = await leagueRepository.findOne({
      where: [
        { systemKey: systemLeagueSeed.systemKey },
        { slug: systemLeagueSeed.slug, tournament: { id: tournament.id } },
      ],
      relations: { owner: true, tournament: true },
    });

    if (!systemLeague) {
      systemLeague = leagueRepository.create();
    }

    systemLeague.name = systemLeagueSeed.name;
    systemLeague.slug = systemLeagueSeed.slug;
    systemLeague.type = systemLeagueSeed.type;
    systemLeague.scoringMode = systemLeagueSeed.scoringMode;
    systemLeague.status = LeagueStatus.OPEN;
    systemLeague.category = systemLeagueSeed.category;
    systemLeague.joinCode = systemLeagueSeed.joinCode;
    systemLeague.isPublic = systemLeagueSeed.isPublic;
    systemLeague.isArchived = false;
    systemLeague.maxMembers = 5000000;
    systemLeague.description = `${systemLeagueSeed.name} seeded default league`;
    systemLeague.badgeLabel = systemLeagueSeed.badgeLabel;
    systemLeague.badgeColor = null;
    systemLeague.monthlyScopeKey = null;
    systemLeague.startsFromMatchdayNumber = 1;
    systemLeague.isJoinLocked = false;
    systemLeague.allowAutoJoin = systemLeagueSeed.isPublic;
    systemLeague.systemKey = systemLeagueSeed.systemKey;
    systemLeague.owner = sampleUser;
    systemLeague.tournament = tournament;
    systemLeague = await leagueRepository.save(systemLeague);
    createdSystemLeaguesByKey.set(systemLeagueSeed.systemKey, systemLeague);

    const existingSystemMembership = await leagueMembershipRepository.findOne({
      where: { league: { id: systemLeague.id }, user: { id: sampleUser.id } },
    });

    if (systemLeagueSeed.autoJoinSampleUser && !existingSystemMembership) {
      await leagueMembershipRepository.save(
        leagueMembershipRepository.create({
          league: systemLeague,
          user: sampleUser,
          role: LeagueMembershipRole.MEMBER,
          status: LeagueMembershipStatus.ACTIVE,
          joinSource: LeagueJoinSource.SYSTEM_SEED,
          joinedAt: new Date(),
          leftAt: null,
          fantasyTeam,
          entryNameSnapshot: fantasyTeam.name,
          managerNameSnapshot: sampleUser.profile?.displayName ?? sampleUser.email ?? null,
          seedNumber: null,
          isPendingNewEntry: false,
        }),
      );
    }
  }

  const defaultCups = [
    {
      name: `${seedDefinition.name} Cup`,
      slug: `${seedDefinition.slug}-general-cup`,
      type: CupType.GENERAL,
      status: CupStatus.UPCOMING,
      league: null,
      badgeLabel: 'L',
      startMatchdayNumber: 1,
      entryCutoffMatchdayNumber: 1,
    },
    {
      name: `${seedDefinition.leagueName} Cup`,
      slug: `${normalizeCatalogKey(seedDefinition.leagueName)}-cup`,
      type: CupType.LEAGUE,
      status: CupStatus.UPCOMING,
      league,
      badgeLabel: 'L',
      startMatchdayNumber: 1,
      entryCutoffMatchdayNumber: 1,
    },
  ];

  for (const cupSeed of defaultCups) {
    let cup = await cupRepository.findOne({
      where: [
        { slug: cupSeed.slug },
        { name: cupSeed.name, tournament: { id: tournament.id } },
      ],
      relations: { league: true, tournament: true },
    });

    if (!cup) {
      cup = cupRepository.create();
    }

    cup.name = cupSeed.name;
    cup.slug = cupSeed.slug;
    cup.type = cupSeed.type;
    cup.status = cupSeed.status;
    cup.description = `${cupSeed.name} seeded default cup`;
    cup.badgeLabel = cupSeed.badgeLabel;
    cup.startMatchdayNumber = cupSeed.startMatchdayNumber;
    cup.entryCutoffMatchdayNumber = cupSeed.entryCutoffMatchdayNumber;
    cup.league = cupSeed.league;
    cup.tournament = tournament;
    await cupRepository.save(cup);
  }

  const ensureSeedRegisteredUser = async (email: string, displayName: string, teamName: string) => {
    let user = await userRepository.findOne({ where: { email }, relations: { profile: true } });

    if (!user) {
      user = await userRepository.save(
        userRepository.create({
          email,
          passwordHash: await hash('Manager123!', 10),
          accountType: UserAccountType.REGISTERED,
          status: UserStatus.ACTIVE,
          lastLoginAt: new Date(),
        }),
      );
    }

    if (!user.profile) {
      user.profile = await userProfileRepository.save(
        userProfileRepository.create({
          user,
          displayName,
          teamName,
          locale: 'en',
          timezone: 'UTC',
          avatarUrl: null,
        }),
      );
    } else {
      user.profile.displayName = displayName;
      user.profile.teamName = teamName;
      user.profile.locale = 'en';
      user.profile.timezone = 'UTC';
      user.profile.avatarUrl = null;
      await userProfileRepository.save(user.profile);
    }

    return user;
  };

  const ensureFantasyTeamForUser = async (user: UserEntity, name: string) => {
    let team = await fantasyTeamRepository.findOne({
      where: { user: { id: user.id }, tournament: { id: tournament.id } },
      relations: { user: true, tournament: true },
    });

    if (!team) {
      team = fantasyTeamRepository.create({
        user,
        tournament,
        name,
        budgetRemaining: '100.00',
        totalBudget: '100.00',
        freeTransfers: 1,
        formationCode: '4-4-2',
        totalPoints: 0,
        teamValue: '100.00',
        activeChipType: null,
      });
    }

    team.user = user;
    team.tournament = tournament;
    team.name = name;
    return fantasyTeamRepository.save(team);
  };

  const rivalUser = await ensureSeedRegisteredUser(
    `${seedDefinition.key}.rival@example.com`,
    'Trophy Hunters',
    'Abu Adam',
  );
  const pendingUser = await ensureSeedRegisteredUser(
    `${seedDefinition.key}.pending@example.com`,
    'Ayman Debrouen',
    'دي بروين',
  );

  const rivalFantasyTeam = await ensureFantasyTeamForUser(rivalUser, 'Trophy Hunters');
  const pendingFantasyTeam = await ensureFantasyTeamForUser(pendingUser, 'دي بروين');

  league.monthlyScopeKey = 'august';
  league = await leagueRepository.save(league);

  const ensureMembership = async (input: {
    leagueEntity: LeagueEntity;
    user: UserEntity;
    fantasyTeamEntity: FantasyTeamEntity;
    role: LeagueMembershipRole;
    status: LeagueMembershipStatus;
    joinSource: LeagueJoinSource;
    entryNameSnapshot: string;
    managerNameSnapshot: string;
    isPendingNewEntry?: boolean;
  }) => {
    let membershipRecord = await leagueMembershipRepository.findOne({
      where: { league: { id: input.leagueEntity.id }, user: { id: input.user.id } },
      relations: { league: true, user: true, fantasyTeam: true },
    });

    if (!membershipRecord) {
      membershipRecord = leagueMembershipRepository.create();
    }

    membershipRecord.league = input.leagueEntity;
    membershipRecord.user = input.user;
    membershipRecord.fantasyTeam = input.fantasyTeamEntity;
    membershipRecord.role = input.role;
    membershipRecord.status = input.status;
    membershipRecord.joinSource = input.joinSource;
    membershipRecord.joinedAt = membershipRecord.joinedAt ?? new Date();
    membershipRecord.leftAt = null;
    membershipRecord.entryNameSnapshot = input.entryNameSnapshot;
    membershipRecord.managerNameSnapshot = input.managerNameSnapshot;
    membershipRecord.seedNumber = membershipRecord.seedNumber ?? null;
    membershipRecord.isPendingNewEntry = input.isPendingNewEntry ?? false;

    return leagueMembershipRepository.save(membershipRecord);
  };

  const rivalLeagueMembership = await ensureMembership({
    leagueEntity: league,
    user: rivalUser,
    fantasyTeamEntity: rivalFantasyTeam,
    role: LeagueMembershipRole.MEMBER,
    status: LeagueMembershipStatus.ACTIVE,
    joinSource: LeagueJoinSource.SYSTEM_SEED,
    entryNameSnapshot: rivalFantasyTeam.name,
    managerNameSnapshot: rivalUser.profile?.displayName ?? rivalUser.email ?? 'Manager',
  });

  const pendingLeagueMembership = await ensureMembership({
    leagueEntity: league,
    user: pendingUser,
    fantasyTeamEntity: pendingFantasyTeam,
    role: LeagueMembershipRole.MEMBER,
    status: LeagueMembershipStatus.PENDING,
    joinSource: LeagueJoinSource.SYSTEM_SEED,
    entryNameSnapshot: pendingFantasyTeam.name,
    managerNameSnapshot: pendingUser.profile?.displayName ?? pendingUser.email ?? 'Manager',
    isPendingNewEntry: true,
  });

  const nextMatchdayNumber = seedDefinition.currentMatchdayNumber + 1;
  await leaguePendingEntryRepository.delete({ membership: { id: pendingLeagueMembership.id } });
  await leaguePendingEntryRepository.save(
    leaguePendingEntryRepository.create({
      league,
      membership: pendingLeagueMembership,
      status: LeaguePendingEntryStatus.PENDING,
      activationMatchdayNumber: nextMatchdayNumber,
      activationMatchday: null,
      sourceScopeKey: league.monthlyScopeKey,
      reason: 'Seeded pending entry for next points update.',
    }),
  );

  const headToHeadLeague = createdSystemLeaguesByKey.get(`${seedDefinition.key}-head-to-head`) ?? null;
  if (headToHeadLeague) {
    const sampleHeadToHeadMembership = await ensureMembership({
      leagueEntity: headToHeadLeague,
      user: sampleUser,
      fantasyTeamEntity: fantasyTeam,
      role: LeagueMembershipRole.MEMBER,
      status: LeagueMembershipStatus.ACTIVE,
      joinSource: LeagueJoinSource.SYSTEM_SEED,
      entryNameSnapshot: fantasyTeam.name,
      managerNameSnapshot: sampleUser.profile?.displayName ?? sampleUser.email ?? 'Manager',
    });

    const rivalHeadToHeadMembership = await ensureMembership({
      leagueEntity: headToHeadLeague,
      user: rivalUser,
      fantasyTeamEntity: rivalFantasyTeam,
      role: LeagueMembershipRole.MEMBER,
      status: LeagueMembershipStatus.ACTIVE,
      joinSource: LeagueJoinSource.SYSTEM_SEED,
      entryNameSnapshot: rivalFantasyTeam.name,
      managerNameSnapshot: rivalUser.profile?.displayName ?? rivalUser.email ?? 'Manager',
    });

    await leagueHeadToHeadFixtureRepository.delete({ league: { id: headToHeadLeague.id } });
    await leagueHeadToHeadFixtureRepository.save(
      leagueHeadToHeadFixtureRepository.create({
        league: headToHeadLeague,
        roundNumber: 1,
        matchdayNumber: seedDefinition.currentMatchdayNumber,
        matchday: matchdaysByNumber.get(seedDefinition.currentMatchdayNumber) ?? null,
        status: LeagueHeadToHeadFixtureStatus.UPCOMING,
        homeMembership: sampleHeadToHeadMembership,
        awayMembership: rivalHeadToHeadMembership,
        winnerMembership: null,
        homePoints: null,
        awayPoints: null,
        isBye: false,
        notes: 'Seeded head-to-head fixture',
      }),
    );
  }

  const seededLeagueCup = await cupRepository.findOne({
    where: { slug: `${normalizeCatalogKey(seedDefinition.leagueName)}-cup` },
    relations: { league: true, tournament: true },
  });

  if (seededLeagueCup) {
    await cupEntryRepository.delete({ cup: { id: seededLeagueCup.id } });

    const sampleLeagueMembership = await leagueMembershipRepository.findOneOrFail({
      where: { league: { id: league.id }, user: { id: sampleUser.id } },
      relations: { league: true, user: true, fantasyTeam: true },
    });

    const sampleCupEntry = await cupEntryRepository.save(
      cupEntryRepository.create({
        cup: seededLeagueCup,
        membership: sampleLeagueMembership,
        seedNumber: 1,
        status: CupEntryStatus.ACTIVE,
      }),
    );

    const rivalCupEntry = await cupEntryRepository.save(
      cupEntryRepository.create({
        cup: seededLeagueCup,
        membership: rivalLeagueMembership,
        seedNumber: 2,
        status: CupEntryStatus.ACTIVE,
      }),
    );

    await cupRoundRepository.delete({ cup: { id: seededLeagueCup.id } });
    await cupFixtureRepository.delete({ cup: { id: seededLeagueCup.id } });

    const round = await cupRoundRepository.save(
      cupRoundRepository.create({
        cup: seededLeagueCup,
        name: 'GW1',
        sequenceNumber: 1,
        matchdayNumber: seedDefinition.currentMatchdayNumber,
        status: CupRoundStatus.UPCOMING,
      }),
    );

    await cupFixtureRepository.save(
      cupFixtureRepository.create({
        cup: seededLeagueCup,
        round,
        homeEntry: sampleCupEntry,
        awayEntry: rivalCupEntry,
        winnerEntry: null,
        status: CupFixtureStatus.UPCOMING,
        homeScore: null,
        awayScore: null,
        legLabel: 'GW1',
      }),
    );
  }

  let scoringRuleSet = await scoringRuleSetRepository.findOne({
    where: { code: seedDefinition.scoringRuleSetCode },
    relations: { rules: true },
  });

  if (!scoringRuleSet) {
    scoringRuleSet = scoringRuleSetRepository.create({
      name: seedDefinition.scoringRuleSetName,
      code: seedDefinition.scoringRuleSetCode,
      description: seedDefinition.scoringRuleSetDescription,
      isActive: true,
      version: 1,
    });
  }

  scoringRuleSet.name = seedDefinition.scoringRuleSetName;
  scoringRuleSet.code = seedDefinition.scoringRuleSetCode;
  scoringRuleSet.description = seedDefinition.scoringRuleSetDescription;
  scoringRuleSet.isActive = true;
  scoringRuleSet = await scoringRuleSetRepository.save(scoringRuleSet);

  await scoringRuleSetRepository
    .createQueryBuilder()
    .update(ScoringRuleSetEntity)
    .set({ isActive: false })
    .where('code != :code', { code: scoringRuleSet.code })
    .execute();

  await scoringRuleSetRepository
    .createQueryBuilder()
    .update(ScoringRuleSetEntity)
    .set({ isActive: true })
    .where('id = :id', { id: scoringRuleSet.id })
    .execute();

  const existingScoringRules = await scoringRuleRepository.find({
    where: { ruleSet: { id: scoringRuleSet.id } },
    relations: { ruleSet: true },
  });

  const existingScoringRulesByKey = new Map(
    existingScoringRules.map((rule) => [`${rule.eventType}:${rule.position}`, rule]),
  );

  for (const defaultRule of defaultScoringRules) {
    const ruleKey = `${defaultRule.eventType}:${defaultRule.position}`;
    const existingRule = existingScoringRulesByKey.get(ruleKey);

    if (!existingRule) {
      await scoringRuleRepository.save(
        scoringRuleRepository.create({
          ruleSet: scoringRuleSet,
          eventType: defaultRule.eventType,
          position: defaultRule.position,
          points: defaultRule.points,
          isEnabled: true,
          description: defaultRule.description,
        }),
      );
      continue;
    }

    existingRule.points = defaultRule.points;
    existingRule.isEnabled = true;
    existingRule.description = defaultRule.description;
    await scoringRuleRepository.save(existingRule);
  }

  await playerScoreEventRepository
    .createQueryBuilder()
    .delete()
    .from(PlayerScoreEventEntity)
    .where('fixture_id IN (SELECT id FROM fixtures WHERE tournament_id = :tournamentId)', { tournamentId: tournament.id })
    .execute();

  await playerScoreLogRepository
    .createQueryBuilder()
    .delete()
    .from(PlayerScoreLogEntity)
    .where('fixture_id IN (SELECT id FROM fixtures WHERE tournament_id = :tournamentId)', { tournamentId: tournament.id })
    .execute();

  await fixtureScoringRunRepository
    .createQueryBuilder()
    .delete()
    .from(FixtureScoringRunEntity)
    .where('fixture_id IN (SELECT id FROM fixtures WHERE tournament_id = :tournamentId)', { tournamentId: tournament.id })
    .execute();

  await transferRepository
    .createQueryBuilder()
    .delete()
    .from(TransferEntity)
    .where('fantasy_team_id = :fantasyTeamId', { fantasyTeamId: fantasyTeam.id })
    .execute();

  await leaderboardEntryRepository
    .createQueryBuilder()
    .delete()
    .from(LeaderboardEntryEntity)
    .where('fantasy_team_id = :fantasyTeamId', { fantasyTeamId: fantasyTeam.id })
    .execute();

  seededCompetitions.push({
    competitionKey: seedDefinition.key,
    tournamentId: tournament.id,
    seededGroups: groups.length,
    seededTeams: teams.length,
    seededPlayers: players.length,
    seededMatchdays: seedDefinition.matchdays.length,
    seededFixtures: seedDefinition.fixtures.length,
    sampleUserId: sampleUser.id,
    fantasyTeamId: fantasyTeam.id,
    leagueId: league.id,
    scoringRuleSetId: scoringRuleSet.id,
    scoringRulesSeeded: defaultScoringRules.length,
  });
  }

  return {
    activeCompetitionKey: activeCompetition.key,
    competitions: seededCompetitions,
  };
}
