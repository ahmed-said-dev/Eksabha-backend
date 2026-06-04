import 'dotenv/config';

import { DataSource } from 'typeorm';

import dataSource from '../src/infra/database/typeorm.datasource';
import { PlayerEntity } from '../src/modules/catalog/entities/player.entity';
import { TournamentEntity } from '../src/modules/tournament/entities/tournament.entity';

const WORLD_CUP_TOURNAMENT_KEY = 'world-cup-2026';

async function main() {
  const appDataSource: DataSource = await dataSource.initialize();

  try {
    const tournamentRepo = appDataSource.getRepository(TournamentEntity);
    const playerRepo = appDataSource.getRepository(PlayerEntity);

    const tournament = await tournamentRepo.findOne({
      where: { competitionKey: WORLD_CUP_TOURNAMENT_KEY },
    });

    if (!tournament) {
      throw new Error(`Tournament ${WORLD_CUP_TOURNAMENT_KEY} not found.`);
    }

    // Find all inactive World Cup players
    const inactivePlayers = await playerRepo
      .createQueryBuilder('player')
      .leftJoin('player.team', 'team')
      .where('team.tournament_id = :tournamentId', { tournamentId: tournament.id })
      .andWhere('player.is_active = :isActive', { isActive: false })
      .getMany();

    console.log(`Found ${inactivePlayers.length} inactive players.`);

    if (inactivePlayers.length === 0) {
      console.log('All players are already active.');
      return;
    }

    // Reactivate all of them
    for (const player of inactivePlayers) {
      player.isActive = true;
    }

    await playerRepo.save(inactivePlayers);
    console.log(`Reactivated ${inactivePlayers.length} players.`);

    // List reactivated players
    for (const player of inactivePlayers) {
      console.log(`  ✅ ${player.name} (${player.position}) — ${player.id}`);
    }

    // Count remaining
    const remainingInactive = await playerRepo
      .createQueryBuilder('player')
      .leftJoin('player.team', 'team')
      .where('team.tournament_id = :tournamentId', { tournamentId: tournament.id })
      .andWhere('player.is_active = :isActive', { isActive: false })
      .getCount();

    console.log(`Remaining inactive: ${remainingInactive}`);
  } finally {
    await appDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Reactivate players failed:', error);
  process.exit(1);
});
