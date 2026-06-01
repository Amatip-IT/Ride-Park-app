import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AdminMessagingService } from './admin-messaging.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { AdminGuard } from 'src/guards/admin.guard';
import { AdminAuditContext } from './admin-audit.types';

@Controller('admin/messages')
@UseGuards(AuthGuard, AdminGuard)
export class AdminMessagingController {
  constructor(private readonly messagingService: AdminMessagingService) {}

  private auditContext(req: any): AdminAuditContext {
    return {
      adminId: (req.user?._id || req.user?.id)?.toString(),
      ipAddress: req.ip,
    };
  }

  @Get('templates')
  async getTemplates() {
    const result = await this.messagingService.getTemplates();
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Post('templates')
  async createTemplate(
    @Body('name') name: string,
    @Body('category') category: string,
    @Body('subject') subject: string,
    @Body('body') body: string,
    @Req() req: any,
  ) {
    if (!name?.trim() || !subject?.trim() || !body?.trim()) {
      throw new HttpException(
        { success: false, message: 'name, subject, and body are required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.auditContext(req);
    const result = await this.messagingService.createTemplate(
      {
        name: name.trim(),
        category: category || 'custom',
        subject: subject.trim(),
        body: body.trim(),
      },
      audit.adminId,
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('send')
  async sendMessage(
    @Body('userId') userId: string,
    @Body('message') message: string,
    @Body('subject') subject: string,
    @Body('type') type: 'system' | 'email' | 'push' | 'all',
    @Body('templateId') templateId: string,
    @Req() req: any,
  ) {
    if (!userId) {
      throw new HttpException({ success: false, message: 'userId is required' }, HttpStatus.BAD_REQUEST);
    }
    if (!message?.trim()) {
      throw new HttpException({ success: false, message: 'message is required' }, HttpStatus.BAD_REQUEST);
    }

    const audit = this.auditContext(req);
    const result = await this.messagingService.sendMessage(
      {
        userId,
        message: message.trim(),
        subject,
        type: type || 'system',
        templateId,
      },
      audit.adminId,
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Get('history/:userId')
  async getMessageHistory(
    @Param('userId') userId: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.messagingService.getMessageHistory(userId, {
      q,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }
}
