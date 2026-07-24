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
import { AdminService } from './admin.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditContext } from './admin-audit.types';
import { AuthGuard } from 'src/guards/auth.guard';
import { AdminGuard } from 'src/guards/admin.guard';

@Controller('admin/verifications')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AdminAuditService,
  ) {}

  private auditContext(req: any): AdminAuditContext {
    return {
      adminId: (req.user?._id || req.user?.id)?.toString(),
      ipAddress: req.ip,
    };
  }

  // ── Audit Logs ──

  @Get('audit-logs')
  async getAuditLogs(
    @Query('action') action?: string,
    @Query('adminId') adminId?: string,
    @Query('targetId') targetId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.auditService.getAuditLogs({
      action,
      adminId,
      targetId,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Get('audit-logs/export')
  async exportAuditLogs(
    @Query('action') action?: string,
    @Query('adminId') adminId?: string,
    @Query('targetId') targetId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.auditService.exportAuditLogsCsv({
      action,
      adminId,
      targetId,
      from,
      to,
    });
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  // ── Parking Space Verifications ──

  @Get('parking')
  async getPendingParkingVerifications() {
    const result = await this.adminService.getPendingParkingVerifications();
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Post('parking/:id/approve')
  async approveParkingVerification(@Param('id') id: string, @Req() req: any) {
    const result = await this.adminService.approveParkingVerification(
      id,
      5,
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('parking/:id/reject')
  async rejectParkingVerification(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!reason) {
      throw new HttpException(
        { success: false, message: 'Rejection reason is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.adminService.rejectParkingVerification(
      id,
      reason,
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  // ── Driver / Taxi Document Verifications ──

  @Get('drivers/search')
  async searchDriverVerifications(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('providerType') providerType?: string,
    @Query('days') days?: string,
    @Query('sort') sort?: string,
  ) {
    const result = await this.adminService.searchDriverVerifications({
      q,
      status,
      providerType,
      days: days ? parseInt(days, 10) : undefined,
      sort,
    });
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Get('drivers')
  async getPendingDriverVerifications() {
    const result = await this.adminService.getPendingDriverVerifications();
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Get('drivers/:id')
  async getDriverVerificationDetail(
    @Param('id') id: string,
    @Query('type') providerType: string,
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException(
        {
          success: false,
          message: 'Query param "type" must be "driver" or "taxi_driver"',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.adminService.getDriverVerificationDetail(
      id,
      providerType,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('drivers/bulk-approve')
  async bulkApproveDrivers(
    @Body('items') items: Array<{ recordId: string; providerType: string }>,
    @Req() req: any,
  ) {
    if (!items?.length) {
      throw new HttpException(
        { success: false, message: 'items array is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.adminService.bulkApproveDrivers(
      items,
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('drivers/bulk-reject')
  async bulkRejectDrivers(
    @Body('items') items: Array<{ recordId: string; providerType: string }>,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!items?.length) {
      throw new HttpException(
        { success: false, message: 'items array is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!reason) {
      throw new HttpException(
        { success: false, message: 'Rejection reason is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.adminService.bulkRejectDrivers(
      items,
      reason,
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('drivers/bulk-message')
  async bulkMessageDrivers(
    @Body('items') items: Array<{ recordId: string; providerType: string }>,
    @Body('message') message: string,
    @Req() req: any,
  ) {
    if (!items?.length) {
      throw new HttpException(
        { success: false, message: 'items array is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!message?.trim()) {
      throw new HttpException(
        { success: false, message: 'message is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.adminService.bulkMessageDrivers(
      items,
      message.trim(),
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('drivers/:id/approve')
  async approveDriverVerification(
    @Param('id') id: string,
    @Body('providerType') providerType: string,
    @Req() req: any,
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException(
        {
          success: false,
          message: 'providerType must be "driver" or "taxi_driver"',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const audit = this.auditContext(req);
    const result = await this.adminService.approveDriverVerification(
      id,
      providerType,
      audit.adminId,
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('drivers/:id/reject')
  async rejectDriverVerification(
    @Param('id') id: string,
    @Body('providerType') providerType: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException(
        {
          success: false,
          message: 'providerType must be "driver" or "taxi_driver"',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!reason) {
      throw new HttpException(
        { success: false, message: 'Rejection reason is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.adminService.rejectDriverVerification(
      id,
      providerType,
      reason,
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('drivers/:id/documents/:docField/approve')
  async approveDocumentField(
    @Param('id') id: string,
    @Param('docField') docField: string,
    @Body('providerType') providerType: string,
    @Req() req: any,
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException(
        {
          success: false,
          message: 'providerType must be "driver" or "taxi_driver"',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!docField) {
      throw new HttpException(
        { success: false, message: 'docField is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.auditContext(req);
    const result = await this.adminService.approveDocumentField(
      id,
      providerType,
      docField,
      audit.adminId,
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('drivers/:id/documents/:docField/reject')
  async rejectDocumentField(
    @Param('id') id: string,
    @Param('docField') docField: string,
    @Body('providerType') providerType: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException(
        {
          success: false,
          message: 'providerType must be "driver" or "taxi_driver"',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!docField) {
      throw new HttpException(
        { success: false, message: 'docField is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!reason) {
      throw new HttpException(
        { success: false, message: 'Rejection reason is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.auditContext(req);
    const result = await this.adminService.rejectDocumentField(
      id,
      providerType,
      docField,
      reason,
      audit.adminId,
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  // ── Provider Identity Verifications ──

  @Get('identity')
  async getPendingIdentityVerifications() {
    const result = await this.adminService.getPendingIdentityVerifications();
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Post('identity/:id/approve')
  async approveIdentityVerification(@Param('id') id: string, @Req() req: any) {
    const result = await this.adminService.approveIdentityVerification(
      id,
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('identity/:id/reject')
  async rejectIdentityVerification(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!reason) {
      throw new HttpException(
        { success: false, message: 'Rejection reason is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.adminService.rejectIdentityVerification(
      id,
      reason,
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  // ── Platform Settings ──

  @Get('settings')
  async getPlatformSettings() {
    const result = await this.adminService.getPlatformSettings();
    if (!result.success)
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    return result;
  }

  @Post('settings/fee')
  async updatePlatformFee(
    @Body('percentage') percentage: number,
    @Req() req: any,
  ) {
    if (percentage === undefined || percentage < 0 || percentage > 100) {
      throw new HttpException('Invalid percentage', HttpStatus.BAD_REQUEST);
    }
    const result = await this.adminService.updatePlatformFee(
      percentage,
      this.auditContext(req),
    );
    if (!result.success)
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    return result;
  }

  // ── Payouts (Withdrawals) ──

  @Get('withdrawals')
  async getPendingWithdrawals() {
    const result = await this.adminService.getPendingWithdrawals();
    if (!result.success)
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    return result;
  }

  @Post('withdrawals/:id/approve')
  async approveWithdrawal(@Param('id') id: string, @Req() req: any) {
    const result = await this.adminService.approveWithdrawal(
      id,
      this.auditContext(req),
    );
    if (!result.success)
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  @Post('withdrawals/:id/reject')
  async rejectWithdrawal(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!reason)
      throw new HttpException(
        'Rejection reason required',
        HttpStatus.BAD_REQUEST,
      );
    const result = await this.adminService.rejectWithdrawal(
      id,
      reason,
      this.auditContext(req),
    );
    if (!result.success)
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  // ── User Account Management (Suspend/Ban) ──

  @Post('users/:id/suspend')
  async suspendUser(
    @Param('id') userId: string,
    @Body('reason') reason: string,
    @Body('durationDays') durationDays?: number,
    @Req() req?: any,
  ) {
    if (!reason) {
      throw new HttpException(
        'Suspension reason is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    const audit = this.auditContext(req);
    const result = await this.adminService.suspendUser(
      userId,
      reason,
      durationDays,
      audit.adminId,
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('users/:id/unsuspend')
  async unsuspendUser(@Param('id') userId: string, @Req() req: any) {
    const result = await this.adminService.unsuspendUser(
      userId,
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('users/:id/ban')
  async banUser(
    @Param('id') userId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!reason) {
      throw new HttpException('Ban reason is required', HttpStatus.BAD_REQUEST);
    }
    const audit = this.auditContext(req);
    const result = await this.adminService.banUser(
      userId,
      reason,
      audit.adminId,
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('users/:id/unban')
  async unbanUser(@Param('id') userId: string, @Req() req: any) {
    const result = await this.adminService.unbanUser(
      userId,
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  // ── Document Expiry Management ──

  @Get('documents/expiring')
  async getExpiringDocuments(@Query('alertLevel') alertLevel?: string) {
    if (
      alertLevel &&
      !['all', '30_day', '7_day', 'expired'].includes(alertLevel)
    ) {
      throw new HttpException(
        {
          success: false,
          message: 'alertLevel must be one of: all, 30_day, 7_day, expired',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.adminService.getExpiringDocuments(
      alertLevel as any,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Post('documents/:id/renew')
  async renewDocument(
    @Param('id') recordId: string,
    @Body('providerType') providerType: string,
    @Body('docField') docField: string,
    @Body('newExpiryDate') newExpiryDate: string,
    @Req() req: any,
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException(
        { success: false, message: 'providerType is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!docField) {
      throw new HttpException(
        { success: false, message: 'docField is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!newExpiryDate) {
      throw new HttpException(
        { success: false, message: 'newExpiryDate is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const expiryDate = new Date(newExpiryDate);
    if (isNaN(expiryDate.getTime())) {
      throw new HttpException(
        { success: false, message: 'Invalid date format' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.adminService.renewDocument(
      recordId,
      providerType,
      docField,
      expiryDate,
      this.auditContext(req),
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }
}
