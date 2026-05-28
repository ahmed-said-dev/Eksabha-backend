import 'dotenv/config';

import { DataSource } from 'typeorm';

import dataSource from '../src/infra/database/typeorm.datasource';
import { FantasyPickEntity } from '../src/modules/fantasy/entities/fantasy-pick.entity';
import { TournamentEntity } from '../src/modules/tournament/entities/tournament.entity';

const WORLD_CUP_TOURNAMENT_KEY = 'world-cup-2026';

async function main() {
  const appDataSource: DataSource = await dataSource.initialize();

  try {
    const tournamentRepo = appDataSource.getRepository(TournamentEntity);
    const pickRepo = appDataSource.getRepository(FantasyPickEntity);

    const tournament = await tournamentRepo.findOne({
      where: { competitionKey: WORLD_CUP_TOURNAMENT_KEY },
    });

    if (!tournament) {
      throw new Error(`Tournament ${WORLD_CUP_TOURNAMENT_KEY} not found.`);
    }

    const invalidPicks = await pickRepo
      .createQueryBuilder('pick')
      .withDeleted()
      .leftJoin('pick.fantasyTeam', 'fantasyTeam')
      .leftJoin('pick.player', 'player')
      .where('fantasyTeam.tournament_id = :tournamentId', { tournamentId: tournament.id })
      .andWhere('pick.deleted_at IS NULL')
      .andWhere('player.id IS NULL')
      .getMany();

    if (invalidPicks.length === 0) {
      console.log('No invalid fantasy picks found for world-cup-2026.');
      return;
    }

    await pickRepo.delete(invalidPicks.map((pick) => pick.id));
    console.log(`Deleted ${invalidPicks.length} invalid fantasy picks for world-cup-2026.`);
  } finally {
    await appDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Cleanup world cup invalid picks failed:', error);
  process.exit(1);
});
