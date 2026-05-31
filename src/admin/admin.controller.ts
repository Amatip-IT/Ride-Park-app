import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';

// NOTE: In production, you would attach authentication and role-based guards 
// (@UseGuards(JwtAuthGuard, RolesGuard)) to ensure only "admin" can hit these routes.
// For testing purposes right now, we are leaving them open.

@Controller('admin/verifications')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
  async approveParkingVerification(@Param('id') id: string) {
    const result = await this.adminService.approveParkingVerification(id);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('parking/:id/reject')
  async rejectParkingVerification(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    if (!reason) {
      throw new HttpException({ success: false, message: 'Rejection reason is required' }, HttpStatus.BAD_REQUEST);
    }

    const result = await this.adminService.rejectParkingVerification(id, reason);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  // ── Driver / Taxi Document Verifications ──

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
      throw new HttpException({ success: false, message: 'Query param "type" must be "driver" or "taxi_driver"' }, HttpStatus.BAD_REQUEST);
    }
    const result = await this.adminService.getDriverVerificationDetail(id, providerType);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('drivers/:id/approve')
  async approveDriverVerification(
    @Param('id') id: string,
    @Body('providerType') providerType: string,
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException({ success: false, message: 'providerType must be "driver" or "taxi_driver"' }, HttpStatus.BAD_REQUEST);
    }
    const result = await this.adminService.approveDriverVerification(id, providerType);
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
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException({ success: false, message: 'providerType must be "driver" or "taxi_driver"' }, HttpStatus.BAD_REQUEST);
    }
    if (!reason) {
      throw new HttpException({ success: false, message: 'Rejection reason is required' }, HttpStatus.BAD_REQUEST);
    }

    const result = await this.adminService.rejectDriverVerification(id, providerType, reason);
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
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException({ success: false, message: 'providerType must be "driver" or "taxi_driver"' }, HttpStatus.BAD_REQUEST);
    }
    if (!docField) {
      throw new HttpException({ success: false, message: 'docField is required' }, HttpStatus.BAD_REQUEST);
    }

    const result = await this.adminService.approveDocumentField(id, providerType, docField);
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
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException({ success: false, message: 'providerType must be "driver" or "taxi_driver"' }, HttpStatus.BAD_REQUEST);
    }
    if (!docField) {
      throw new HttpException({ success: false, message: 'docField is required' }, HttpStatus.BAD_REQUEST);
    }
    if (!reason) {
      throw new HttpException({ success: false, message: 'Rejection reason is required' }, HttpStatus.BAD_REQUEST);
    }

    const result = await this.adminService.rejectDocumentField(id, providerType, docField, reason);
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
  async approveIdentityVerification(@Param('id') id: string) {
    const result = await this.adminService.approveIdentityVerification(id);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('identity/:id/reject')
  async rejectIdentityVerification(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    if (!reason) {
      throw new HttpException({ success: false, message: 'Rejection reason is required' }, HttpStatus.BAD_REQUEST);
    }

    const result = await this.adminService.rejectIdentityVerification(id, reason);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  // ── Platform Settings ──

  @Get('settings')
  async getPlatformSettings() {
    const result = await this.adminService.getPlatformSettings();
    if (!result.success) throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    return result;
  }

  @Post('settings/fee')
  async updatePlatformFee(@Body('percentage') percentage: number) {
    if (percentage === undefined || percentage < 0 || percentage > 100) {
      throw new HttpException('Invalid percentage', HttpStatus.BAD_REQUEST);
    }
    const result = await this.adminService.updatePlatformFee(percentage);
    if (!result.success) throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    return result;
  }

  // ── Payouts (Withdrawals) ──

  @Get('withdrawals')
  async getPendingWithdrawals() {
    const result = await this.adminService.getPendingWithdrawals();
    if (!result.success) throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    return result;
  }

  @Post('withdrawals/:id/approve')
  async approveWithdrawal(@Param('id') id: string) {
    const result = await this.adminService.approveWithdrawal(id);
    if (!result.success) throw new HttpException(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  @Post('withdrawals/:id/reject')
  async rejectWithdrawal(@Param('id') id: string, @Body('reason') reason: string) {
    if (!reason) throw new HttpException('Rejection reason required', HttpStatus.BAD_REQUEST);
    const result = await this.adminService.rejectWithdrawal(id, reason);
    if (!result.success) throw new HttpException(result, HttpStatus.BAD_REQUEST);
    return result;
  }

  // ── User Account Management (Suspend/Ban) ──

  @Post('users/:id/suspend')
  async suspendUser(
    @Param('id') userId: string,
    @Body('reason') reason: string,
    @Body('durationDays') durationDays?: number,
  ) {
    if (!reason) {
      throw new HttpException('Suspension reason is required', HttpStatus.BAD_REQUEST);
    }
    const result = await this.adminService.suspendUser(userId, reason, durationDays);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('users/:id/unsuspend')
  async unsuspendUser(@Param('id') userId: string) {
    const result = await this.adminService.unsuspendUser(userId);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('users/:id/ban')
  async banUser(
    @Param('id') userId: string,
    @Body('reason') reason: string,
  ) {
    if (!reason) {
      throw new HttpException('Ban reason is required', HttpStatus.BAD_REQUEST);
    }
    const result = await this.adminService.banUser(userId, reason);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('users/:id/unban')
  async unbanUser(@Param('id') userId: string) {
    const result = await this.adminService.unbanUser(userId);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  // ── Document Expiry Management ──

  @Get('documents/expiring')
  async getExpiringDocuments(@Query('alertLevel') alertLevel?: string) {
    if (alertLevel && !['all', '30_day', '7_day', 'expired'].includes(alertLevel)) {
      throw new HttpException(
        { success: false, message: 'alertLevel must be one of: all, 30_day, 7_day, expired' },
        HttpStatus.BAD_REQUEST
      );
    }
    const result = await this.adminService.getExpiringDocuments(alertLevel as any);
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
  ) {
    if (!providerType || !['driver', 'taxi_driver'].includes(providerType)) {
      throw new HttpException({ success: false, message: 'providerType is required' }, HttpStatus.BAD_REQUEST);
    }
    if (!docField) {
      throw new HttpException({ success: false, message: 'docField is required' }, HttpStatus.BAD_REQUEST);
    }
    if (!newExpiryDate) {
      throw new HttpException({ success: false, message: 'newExpiryDate is required' }, HttpStatus.BAD_REQUEST);
    }

    const expiryDate = new Date(newExpiryDate);
    if (isNaN(expiryDate.getTime())) {
      throw new HttpException({ success: false, message: 'Invalid date format' }, HttpStatus.BAD_REQUEST);
    }

    const result = await this.adminService.renewDocument(recordId, providerType, docField, expiryDate);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }
}


