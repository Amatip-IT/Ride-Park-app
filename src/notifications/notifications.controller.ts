import { Controller, Get, Post, Param, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { Request } from 'express';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getMyNotifications(@Req() req: any) {
    const user = req['user'];
    const result = await this.notificationsService.getMyNotifications(user._id.toString());
    if (!result.success) throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    return result;
  }

  @Post(':id/read')
  async markAsRead(@Req() req: any, @Param('id') id: string) {
    const user = req['user'];
    const result = await this.notificationsService.markAsRead(user._id.toString(), id);
    if (!result.success) throw new HttpException(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  @Post('read-all')
  async markAllAsRead(@Req() req: any) {
    const user = req['user'];
    const result = await this.notificationsService.markAllAsRead(user._id.toString());
    if (!result.success) throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    return result;
  }
}
