import {
  Controller,
  Get,
  Post,
  Param,
  Body,
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
}
