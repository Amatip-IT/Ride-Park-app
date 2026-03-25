import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { PhoneVerificationService } from './verification.service';
import { SendPhoneOtpDto } from '../dto/send-phone-otp.dto';
import { VerifyPhoneOtpDto } from '../dto/verify-phone-otp.dto';

@Controller('verification')
export class PhoneVerificationController {
  constructor(
    private readonly phoneVerificationService: PhoneVerificationService,
  ) {}

  /**
   * Send OTP to user's phone for verification
   * POST /verification/send-phone-otp
   */
  @Post('send-phone-otp')
  async sendPhoneOtp(@Body() sendPhoneOtpDto: SendPhoneOtpDto) {
    return this.phoneVerificationService.sendPhoneOtp(
      sendPhoneOtpDto.phoneNumber,
    );
  }

  /**
   * Verify phone with OTP code
   * POST /verification/verify-phone-otp
   */
  @Post('verify-phone-otp')
  async verifyPhoneOtp(@Body() verifyPhoneOtpDto: VerifyPhoneOtpDto) {
    return this.phoneVerificationService.verifyPhoneOtp(
      verifyPhoneOtpDto.phoneNumber,
      verifyPhoneOtpDto.otp,
    );
  }

  /**
   * Check phone verification status
   * GET /verification/phone-status?phoneNumber=+1234567890
   */
  @Get('phone-status')
  async checkPhoneStatus(@Query('phoneNumber') phoneNumber: string) {
    return this.phoneVerificationService.checkPhoneVerificationStatus(
      phoneNumber,
    );
  }
}
