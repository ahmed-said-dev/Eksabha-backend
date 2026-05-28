import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { WS_NAMESPACE } from '../../common/constants/api.constants';

@WebSocketGateway({
  namespace: WS_NAMESPACE,
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const userId = this.extractUserId(client);

    if (userId) {
      client.join(this.buildUserRoom(userId));
    }

    client.emit('system.ready', {
      namespace: WS_NAMESPACE,
      connectedAt: new Date().toISOString(),
      userId,
    });
  }

  broadcast(event: string, payload: Record<string, unknown>) {
    this.server.emit(event, {
      emittedAt: new Date().toISOString(),
      ...payload,
    });
  }

  emitToUser(userId: string, event: string, payload: Record<string, unknown>) {
    this.server.to(this.buildUserRoom(userId)).emit(event, {
      emittedAt: new Date().toISOString(),
      ...payload,
    });
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() payload: unknown) {
    client.emit('pong', {
      receivedAt: new Date().toISOString(),
      payload,
    });
  }

  private extractUserId(client: Socket) {
    const authUserId = client.handshake.auth?.userId;
    if (typeof authUserId === 'string' && authUserId.trim().length > 0) {
      return authUserId.trim();
    }

    const queryUserId = client.handshake.query?.userId;
    if (typeof queryUserId === 'string' && queryUserId.trim().length > 0) {
      return queryUserId.trim();
    }

    return null;
  }

  private buildUserRoom(userId: string) {
    return `user:${userId}`;
  }
}
