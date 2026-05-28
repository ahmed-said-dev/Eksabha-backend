/// <reference types="node" />

import 'dotenv/config';

import { DataSource } from 'typeorm';

import dataSource from '../src/infra/database/typeorm.datasource';
import { PlayerPosition } from '../src/common/database';
import { PlayerEntity } from '../src/modules/catalog/entities/player.entity';
import { FantasyPickEntity } from '../src/modules/fantasy/entities/fantasy-pick.entity';
import { FantasyTeamEntity } from '../src/modules/fantasy/entities/fantasy-team.entity';
import { TournamentEntity } from '../src/modules/tournament/entities/tournament.entity';
import { UserEntity } from '../src/modules/users/entities/user.entity';

const MANAGER_EMAIL = 'manager@example.com';
const WORLD_CUP_TOURNAMENT_KEY = 'world-cup-2026';

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortPlayers(players: PlayerEntity[]) {
  return [...players].sort((left, right) => {
    const priceCompare = toNumber(left.currentPrice) - toNumber(right.currentPrice);
    if (priceCompare !== 0) {
      return priceCompare;
    }

    const pointsCompare = right.totalPoints - left.totalPoints;
    if (pointsCompare !== 0) {
      return pointsCompare;
    }

    return left.name.localeCompare(right.name);
  });
}

function selectPlayersWithTeamLimit(input: {
  players: PlayerEntity[];
  count: number;
  teamCounts: Map<string, number>;
}) {
  const selected: PlayerEntity[] = [];

  for (const player of input.players) {
    const currentTeamCount = input.teamCounts.get(player.team.id) ?? 0;
    if (currentTeamCount >= 3) {
      continue;
    }

    selected.push(player);
    input.teamCounts.set(player.team.id, currentTeamCount + 1);

    if (selected.length === input.count) {
      return selected;
    }
  }

  throw new Error(`Not enough eligible players to satisfy count=${input.count} with the max-3-per-team rule.`);
}

async function main() {
  const appDataSource: DataSource = await dataSource.initialize();

  try {
    const userRepo = appDataSource.getRepository(UserEntity);
    const tournamentRepo = appDataSource.getRepository(TournamentEntity);
    const fantasyTeamRepo = appDataSource.getRepository(FantasyTeamEntity);
    const fantasyPickRepo = appDataSource.getRepository(FantasyPickEntity);
    const playerRepo = appDataSource.getRepository(PlayerEntity);

    const [user, tournament] = await Promise.all([
      userRepo.findOne({ where: { email: MANAGER_EMAIL } }),
      tournamentRepo.findOne({ where: { competitionKey: WORLD_CUP_TOURNAMENT_KEY } }),
    ]);

    if (!user) {
      throw new Error(`User ${MANAGER_EMAIL} not found.`);
    }

    if (!tournament) {
      throw new Error(`Tournament ${WORLD_CUP_TOURNAMENT_KEY} not found.`);
    }

    const fantasyTeam = await fantasyTeamRepo
      .createQueryBuilder('fantasyTeam')
      .leftJoinAndSelect('fantasyTeam.user', 'user')
      .leftJoinAndSelect('fantasyTeam.tournament', 'tournament')
      .leftJoinAndSelect('fantasyTeam.picks', 'pick')
      .leftJoinAndSelect('pick.player', 'player')
      .where('user.id = :userId', { userId: user.id })
      .andWhere('tournament.id = :tournamentId', { tournamentId: tournament.id })
      .getOne();

    if (!fantasyTeam) {
      throw new Error(`Fantasy team for ${MANAGER_EMAIL} in ${WORLD_CUP_TOURNAMENT_KEY} not found.`);
    }

    const allPlayers = await playerRepo
      .createQueryBuilder('player')
      .leftJoinAndSelect('player.team', 'team')
      .leftJoin('team.tournament', 'tournament')
      .where('tournament.id = :tournamentId', { tournamentId: tournament.id })
      .andWhere('player.isActive = true')
      .getMany();

    const teamCounts = new Map<string, number>();
    const goalkeepers = selectPlayersWithTeamLimit({
      players: sortPlayers(allPlayers.filter((player) => player.position === PlayerPosition.GOALKEEPER)),
      count: 2,
      teamCounts,
    });
    const defenders = selectPlayersWithTeamLimit({
      players: sortPlayers(allPlayers.filter((player) => player.position === PlayerPosition.DEFENDER)),
      count: 5,
      teamCounts,
    });
    const midfielders = selectPlayersWithTeamLimit({
      players: sortPlayers(allPlayers.filter((player) => player.position === PlayerPosition.MIDFIELDER)),
      count: 5,
      teamCounts,
    });
    const forwards = selectPlayersWithTeamLimit({
      players: sortPlayers(allPlayers.filter((player) => player.position === PlayerPosition.FORWARD)),
      count: 3,
      teamCounts,
    });

    if (goalkeepers.length !== 2 || defenders.length !== 5 || midfielders.length !== 5 || forwards.length !== 3) {
      throw new Error('Not enough active players to build the required 2/5/5/3 squad composition.');
    }

    const orderedPlayers = [
      goalkeepers[0],
      defenders[0],
      defenders[1],
      defenders[2],
      midfielders[0],
      midfielders[1],
      midfielders[2],
      midfielders[3],
      forwards[0],
      forwards[1],
      forwards[2],
      goalkeepers[1],
      defenders[3],
      defenders[4],
      midfielders[4],
    ];

    const squadValue = orderedPlayers.reduce((sum, player) => sum + toNumber(player.currentPrice), 0);
    if (squadValue > toNumber(fantasyTeam.totalBudget)) {
      throw new Error(`Generated squad value £${squadValue.toFixed(2)}m exceeds the budget cap.`);
    }

    if (fantasyTeam.picks.length) {
      await fantasyPickRepo.delete(fantasyTeam.picks.map((pick) => pick.id));
    }

    const captainId = forwards[0].id;
    const viceCaptainId = midfielders[0].id;
    const picks = orderedPlayers.map((player, index) => {
      const isBenched = index >= 11;
      return fantasyPickRepo.create({
        fantasyTeam,
        player,
        positionOrder: index + 1,
        isCaptain: player.id === captainId,
        isViceCaptain: player.id === viceCaptainId,
        isBenched,
        multiplier: player.id === captainId ? 2 : 1,
        buyPrice: player.currentPrice,
        sellPrice: player.currentPrice,
        livePoints: 0,
      });
    });

    await fantasyPickRepo.save(picks);

    await fantasyTeamRepo.update(fantasyTeam.id, {
      teamValue: squadValue.toFixed(2),
      budgetRemaining: Math.max(0, toNumber(fantasyTeam.totalBudget) - squadValue).toFixed(2),
      formationCode: '3-4-3',
    });

    console.log(`Rebuilt fantasy squad for ${MANAGER_EMAIL}.`);
    console.log('Composition: 2 GK / 5 DEF / 5 MID / 3 FWD');
    console.log(`Team value: ${squadValue.toFixed(2)}`);
  } finally {
    await appDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Fix manager world cup squad failed:', error);
  process.exit(1);
});
