const dataSource = require('../dist/infra/database/typeorm.datasource').default;
const { UserEntity } = require('../dist/modules/users/entities/user.entity');
const { TournamentEntity } = require('../dist/modules/tournament/entities/tournament.entity');
const { FantasyTeamEntity } = require('../dist/modules/fantasy/entities/fantasy-team.entity');
const { FantasyPickEntity } = require('../dist/modules/fantasy/entities/fantasy-pick.entity');
const { LeagueEntity } = require('../dist/modules/leagues/entities/league.entity');
const { LeagueMembershipEntity, LeagueMembershipRole, LeagueMembershipStatus, LeagueJoinSource } = require('../dist/modules/leagues/entities/league-membership.entity');
const { LeaderboardEntryEntity } = require('../dist/modules/leaderboards/entities/leaderboard-entry.entity');
const { PlayerEntity } = require('../dist/modules/catalog/entities/player.entity');

async function main() {
  await dataSource.initialize();

  const userRepo = dataSource.getRepository(UserEntity);
  const tournamentRepo = dataSource.getRepository(TournamentEntity);
  const fantasyTeamRepo = dataSource.getRepository(FantasyTeamEntity);
  const fantasyPickRepo = dataSource.getRepository(FantasyPickEntity);
  const leagueRepo = dataSource.getRepository(LeagueEntity);
  const membershipRepo = dataSource.getRepository(LeagueMembershipEntity);
  const leaderboardEntryRepo = dataSource.getRepository(LeaderboardEntryEntity);
  const playerRepo = dataSource.getRepository(PlayerEntity);

  const user = await userRepo.findOne({
    where: { email: 'test.manager.2@local.dev' },
    relations: { profile: true },
  });
  if (!user) throw new Error('Test user not found');

  const tournament = await tournamentRepo.findOne({
    where: { competitionKey: 'world-cup-2026' },
  });
  if (!tournament) throw new Error('World Cup 2026 tournament not found');

  let fantasyTeam = await fantasyTeamRepo.findOne({
    where: { user: { id: user.id }, tournament: { id: tournament.id } },
    relations: { picks: true },
  });

  if (!fantasyTeam) {
    fantasyTeam = fantasyTeamRepo.create({
      user,
      tournament,
      name: user.profile?.teamName || 'Test Manager 2 XI',
      budgetRemaining: '0.00',
      totalBudget: '100.00',
      freeTransfers: 1,
      formationCode: '4-4-2',
      totalPoints: 0,
      teamValue: '100.00',
      activeChipType: null,
    });
    fantasyTeam = await fantasyTeamRepo.save(fantasyTeam);
  }

  const existingPicks = await fantasyPickRepo.find({
    where: { fantasyTeam: { id: fantasyTeam.id } },
  });

  if (existingPicks.length === 0) {
    const players = await playerRepo.find({
      where: { team: { tournament: { id: tournament.id } } },
      relations: { team: true },
    });

    const grouped = {
      GK: players.filter((p) => p.position === 'GK').slice(0, 2),
      DEF: players.filter((p) => p.position === 'DEF').slice(0, 5),
      MID: players.filter((p) => p.position === 'MID').slice(0, 5),
      FWD: players.filter((p) => p.position === 'FWD').slice(0, 3),
    };

    const ordered = [...grouped.GK, ...grouped.DEF, ...grouped.MID, ...grouped.FWD].slice(0, 15);

    for (let i = 0; i < ordered.length; i += 1) {
      const player = ordered[i];
      const pick = fantasyPickRepo.create({
        fantasyTeam,
        player,
        positionOrder: i + 1,
        isCaptain: i === 0,
        isViceCaptain: i === 1,
        isBenched: i >= 11,
        multiplier: i === 0 ? 2 : 1,
        sellPrice: Number(player.currentPrice),
        buyPrice: Number(player.currentPrice),
        livePoints: 0,
      });
      await fantasyPickRepo.save(pick);
    }
  }

  let appLeague = await leagueRepo.findOne({
    where: { systemKey: 'app-owned-league', tournament: { id: tournament.id } },
    relations: { tournament: true },
  });

  if (!appLeague) {
    appLeague = await leagueRepo.findOne({
      where: {
        tournament: { id: tournament.id },
        category: 'app',
      },
      relations: { tournament: true },
    });
  }

  if (!appLeague) {
    appLeague = await leagueRepo.findOne({
      where: {
        tournament: { id: tournament.id },
        isPublic: true,
      },
      relations: { tournament: true },
      order: { createdAt: 'ASC' },
    });
  }

  if (!appLeague) throw new Error('World Cup app league not found');

  let membership = await membershipRepo.findOne({
    where: { league: { id: appLeague.id }, user: { id: user.id } },
    relations: { league: true, user: true, fantasyTeam: true },
  });

  if (!membership) {
    membership = membershipRepo.create({
      league: appLeague,
      user,
      fantasyTeam,
      role: LeagueMembershipRole.MEMBER,
      status: LeagueMembershipStatus.ACTIVE,
      joinSource: LeagueJoinSource.SYSTEM_SEED,
      joinedAt: new Date(),
      leftAt: null,
      entryNameSnapshot: fantasyTeam.name,
      managerNameSnapshot: user.profile?.displayName || user.email || 'Manager',
      seedNumber: null,
      isPendingNewEntry: false,
    });
    membership = await membershipRepo.save(membership);
  } else {
    membership.fantasyTeam = fantasyTeam;
    membership.status = LeagueMembershipStatus.ACTIVE;
    membership.entryNameSnapshot = fantasyTeam.name;
    membership.managerNameSnapshot = user.profile?.displayName || user.email || 'Manager';
    membership.isPendingNewEntry = false;
    membership = await membershipRepo.save(membership);
  }

  const existingOverallEntry = await leaderboardEntryRepo.findOne({
    where: {
      scope: 'league',
      scopeType: 'overall',
      fantasyTeam: { id: fantasyTeam.id },
      league: { id: appLeague.id },
      matchday: null,
    },
    relations: { fantasyTeam: true, league: true, matchday: true },
  });

  if (!existingOverallEntry) {
    const existingLeagueEntries = await leaderboardEntryRepo.find({
      where: {
        scope: 'league',
        scopeType: 'overall',
        league: { id: appLeague.id },
        matchday: null,
      },
      relations: { fantasyTeam: true },
      order: { rank: 'ASC' },
    });

    const nextRank = existingLeagueEntries.length + 1;

    const entry = leaderboardEntryRepo.create({
      scope: 'league',
      scopeType: 'overall',
      scopeKey: null,
      rank: nextRank,
      previousRank: null,
      totalPoints: fantasyTeam.totalPoints,
      matchdayPoints: 0,
      meta: {},
      fantasyTeam,
      league: appLeague,
      matchday: null,
    });

    await leaderboardEntryRepo.save(entry);
  }

  console.log(JSON.stringify({
    userEmail: user.email,
    tournament: tournament.competitionKey,
    fantasyTeamId: fantasyTeam.id,
    fantasyTeamName: fantasyTeam.name,
    leagueId: appLeague.id,
    leagueName: appLeague.name,
    membershipId: membership.id,
    joined: true,
  }, null, 2));

  await dataSource.destroy();
}

main().catch(async (error) => {
  console.error(error);
  try { await dataSource.destroy(); } catch {}
  process.exit(1);
});
