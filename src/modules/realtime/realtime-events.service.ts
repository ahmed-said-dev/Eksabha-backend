import { Injectable } from '@nestjs/common';

import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeEventsService {
  constructor(private readonly realtimeGateway: RealtimeGateway) {}

  emitScoringUpdated(payload: Record<string, unknown>) {
    this.realtimeGateway.broadcast('scoring.updated', payload);
  }

  emitLeaderboardUpdated(payload: Record<string, unknown>) {
    this.realtimeGateway.broadcast('leaderboard.updated', payload);
  }

  emitDeadlineLocked(payload: Record<string, unknown>) {
    this.realtimeGateway.broadcast('deadline.locked', payload);
  }

  emitAdminCorrection(payload: Record<string, unknown>) {
    this.realtimeGateway.broadcast('admin.correction.applied', payload);
  }

  emitNotificationCreated(userId: string, payload: Record<string, unknown>) {
    this.realtimeGateway.emitToUser(userId, 'notification.created', payload);
  }

  emitFixtureUpdated(payload: Record<string, unknown>) {
    this.realtimeGateway.broadcast('fixture.updated', payload);
  }

  emitFixtureEvent(payload: Record<string, unknown>) {
    this.realtimeGateway.broadcast('fixture.event', payload);
  }

  emitLiveMatchTick(payload: Record<string, unknown>) {
    this.realtimeGateway.broadcast('live.tick', payload);
  }
}
