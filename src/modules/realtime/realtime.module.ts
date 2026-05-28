import { Module } from '@nestjs/common';

import { RealtimeGateway } from './realtime.gateway';
import { RealtimeEventsService } from './realtime-events.service';

@Module({
  providers: [RealtimeGateway, RealtimeEventsService],
  exports: [RealtimeGateway, RealtimeEventsService],
})
export class RealtimeModule {}
