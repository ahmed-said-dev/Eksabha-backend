import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { PlayerEntity } from '../catalog/entities/player.entity';
import { PlayerPriceEntity } from '../catalog/entities/player-price.entity';
import { TeamEntity } from '../catalog/entities/team.entity';
import { FantasyPickEntity } from '../fantasy/entities/fantasy-pick.entity';
import { FantasyPickSnapshotEntity } from '../fantasy/entities/fantasy-pick-snapshot.entity';
import { TransferEntity } from '../fantasy/entities/transfer.entity';
import { AdminGuard } from './guards/admin.guard';
import { PlayerAdminController } from './player-admin.controller';
import { PlayerAdminService } from './player-admin.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      PlayerEntity,
      PlayerPriceEntity,
      TeamEntity,
      FantasyPickEntity,
      FantasyPickSnapshotEntity,
      TransferEntity,
    ]),
  ],
  controllers: [PlayerAdminController],
  providers: [PlayerAdminService, AdminGuard],
})
export class PlayerAdminModule {}
