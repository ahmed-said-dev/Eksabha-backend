import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferEntity } from '../fantasy/entities/transfer.entity';
import { FantasyPickEntity } from '../fantasy/entities/fantasy-pick.entity';
import { FantasyTeamEntity } from '../fantasy/entities/fantasy-team.entity';
import { PlayerScoreEventEntity } from '../scoring/entities/player-score-event.entity';
import { MatchdayEntity } from '../tournament/entities/matchday.entity';
import { TournamentModule } from '../tournament/tournament.module';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PlayerEntity } from './entities/player.entity';
import { PlayerPriceEntity } from './entities/player-price.entity';
import { TeamEntity } from './entities/team.entity';

@Module({
  imports: [TournamentModule, TypeOrmModule.forFeature([
    TeamEntity,
    PlayerEntity,
    PlayerPriceEntity,
    FantasyPickEntity,
    FantasyTeamEntity,
    TransferEntity,
    MatchdayEntity,
    PlayerScoreEventEntity,
  ])],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
