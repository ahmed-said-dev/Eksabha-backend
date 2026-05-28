import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { UserEntity } from '../users/entities/user.entity';
import { NotificationEntity } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepository: Repository<NotificationEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly realtimeEventsService: RealtimeEventsService,
  ) {}

  async getNotificationsForUser(userId: string) {
    return this.notificationsRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const notification = await this.notificationsRepository.findOne({
      where: { id: notificationId, user: { id: userId } },
      relations: { user: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    notification.readAt = new Date();
    return this.notificationsRepository.save(notification);
  }

  async createNotificationForUser(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    payload?: Record<string, unknown> | null;
  }) {
    const user = await this.usersRepository.findOne({
      where: { id: input.userId },
    });

    if (!user) {
      throw new NotFoundException('Notification user not found.');
    }

    const notification = await this.notificationsRepository.save(
      this.notificationsRepository.create({
        user,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload ?? null,
        readAt: null,
      }),
    );

    this.realtimeEventsService.emitNotificationCreated(user.id, {
      notificationId: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      payload: notification.payload,
      readAt: notification.readAt,
    });

    return notification;
  }

  async createNotificationsForUsers(
    inputs: Array<{
      userId: string;
      type: string;
      title: string;
      body: string;
      payload?: Record<string, unknown> | null;
    }>,
  ) {
    const notifications: NotificationEntity[] = [];

    for (const input of inputs) {
      notifications.push(await this.createNotificationForUser(input));
    }

    return notifications;
  }
}
