import { RefreshSessionEntity } from '../../modules/auth/entities/refresh-session.entity';
import { PlayerPriceEntity } from '../../modules/catalog/entities/player-price.entity';
import { PlayerEntity } from '../../modules/catalog/entities/player.entity';
import { TeamEntity } from '../../modules/catalog/entities/team.entity';
import { ChipActivationEntity } from '../../modules/fantasy/entities/chip-activation.entity';
import { FantasyPickEntity } from '../../modules/fantasy/entities/fantasy-pick.entity';
import { FantasyPickSnapshotEntity } from '../../modules/fantasy/entities/fantasy-pick-snapshot.entity';
import { FantasyTeamEntity } from '../../modules/fantasy/entities/fantasy-team.entity';
import { FantasyTeamSnapshotEntity } from '../../modules/fantasy/entities/fantasy-team-snapshot.entity';
import { MatchdayLockEntity } from '../../modules/fantasy/entities/matchday-lock.entity';
import { TransferEntity } from '../../modules/fantasy/entities/transfer.entity';
import { RawFeedPayloadEntity } from '../../modules/feed/entities/raw-feed-payload.entity';
import { AdminAuditLogEntity } from '../../modules/admin/entities/admin-audit-log.entity';
import { FixtureCorrectionEntity } from '../../modules/admin/entities/fixture-correction.entity';
import { ManualScoringAdjustmentEntity } from '../../modules/admin/entities/manual-scoring-adjustment.entity';
import { LeaderboardEntryEntity } from '../../modules/leaderboards/entities/leaderboard-entry.entity';
import { CupEntryEntity } from '../../modules/leagues/entities/cup-entry.entity';
import { CupFixtureEntity } from '../../modules/leagues/entities/cup-fixture.entity';
import { CupRoundEntity } from '../../modules/leagues/entities/cup-round.entity';
import { CupEntity } from '../../modules/leagues/entities/cup.entity';
import { LeagueHeadToHeadFixtureEntity } from '../../modules/leagues/entities/league-head-to-head-fixture.entity';
import { LeagueMembershipEntity } from '../../modules/leagues/entities/league-membership.entity';
import { LeagueEntity } from '../../modules/leagues/entities/league.entity';
import { LeaguePendingEntryEntity } from '../../modules/leagues/entities/league-pending-entry.entity';
import { NotificationEntity } from '../../modules/notifications/entities/notification.entity';
import { FixtureScoringRunEntity } from '../../modules/scoring/entities/fixture-scoring-run.entity';
import { PlayerScoreEventEntity } from '../../modules/scoring/entities/player-score-event.entity';
import { PlayerScoreLogEntity } from '../../modules/scoring/entities/player-score-log.entity';
import { ScoringRuleEntity } from '../../modules/scoring/entities/scoring-rule.entity';
import { ScoringRuleSetEntity } from '../../modules/scoring/entities/scoring-rule-set.entity';
import { FixtureEntity } from '../../modules/tournament/entities/fixture.entity';
import { GroupEntity } from '../../modules/tournament/entities/group.entity';
import { MatchdayEntity } from '../../modules/tournament/entities/matchday.entity';
import { TournamentEntity } from '../../modules/tournament/entities/tournament.entity';
import { UserProfileEntity } from '../../modules/users/entities/user-profile.entity';
import { UserEntity } from '../../modules/users/entities/user.entity';

export const appEntities = [
  UserEntity,
  UserProfileEntity,
  RefreshSessionEntity,
  AdminAuditLogEntity,
  ManualScoringAdjustmentEntity,
  FixtureCorrectionEntity,
  TournamentEntity,
  GroupEntity,
  MatchdayEntity,
  FixtureEntity,
  TeamEntity,
  PlayerEntity,
  PlayerPriceEntity,
  FantasyTeamEntity,
  FantasyPickEntity,
  FantasyTeamSnapshotEntity,
  FantasyPickSnapshotEntity,
  MatchdayLockEntity,
  ChipActivationEntity,
  TransferEntity,
  LeagueEntity,
  LeagueMembershipEntity,
  LeaguePendingEntryEntity,
  LeagueHeadToHeadFixtureEntity,
  CupEntity,
  CupEntryEntity,
  CupRoundEntity,
  CupFixtureEntity,
  LeaderboardEntryEntity,
  NotificationEntity,
  ScoringRuleSetEntity,
  ScoringRuleEntity,
  PlayerScoreLogEntity,
  PlayerScoreEventEntity,
  FixtureScoringRunEntity,
  RawFeedPayloadEntity,
] as const;
