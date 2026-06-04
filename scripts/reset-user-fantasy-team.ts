import 'dotenv/config';

import dataSource from '../src/infra/database/typeorm.datasource';
import { FantasyTeamEntity } from '../src/modules/fantasy/entities/fantasy-team.entity';
import { FantasyPickEntity } from '../src/modules/fantasy/entities/fantasy-pick.entity';

const USER_ID = 'ddec869c-30bd-4d99-961f-81ea3bbd2757';

async function main() {
  const ds = await dataSource.initialize();
  try {
    const teamRepo = ds.getRepository(FantasyTeamEntity);
    const pickRepo = ds.getRepository(FantasyPickEntity);

    const team = await teamRepo.findOne({
      where: { user: { id: USER_ID } },
      relations: { picks: true },
      order: { createdAt: 'DESC' },
    });

    if (!team) {
      console.log('No fantasy team found.');
      return;
    }

    console.log(`Found team: ${team.id}, picks: ${team.picks.length}`);

    // Delete all picks
    if (team.picks.length > 0) {
      await pickRepo.delete(team.picks.map((p) => p.id));
      console.log(`Deleted ${team.picks.length} picks.`);
    }

    // Reset team
    team.formationCode = '4-4-2';
    team.picks = [];
    await teamRepo.save(team);
    console.log('Team reset. Now go to build-squad and create a new team.');
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
