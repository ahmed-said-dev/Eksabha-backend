import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/interfaces/auth-request.interface';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getNotifications(@CurrentUser() user: JwtAccessPayload) {
    return this.notificationsService.getNotificationsForUser(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':notificationId/read')
  markNotificationRead(
    @CurrentUser() user: JwtAccessPayload,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markNotificationRead(user.sub, notificationId);
  }
}
