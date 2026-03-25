import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { EmailVerificationService } from './verification.service';
import { SendEmailOtpDto } from '../dto/send-email-otp.dto';
import { VerifyEmailOtpDto } from '../dto/verify-email-otp.dto';

@Controller('verification')
export class EmailVerificationController {
  constructor(
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  /**
   * Send OTP to user's email for verification
   * POST /verification/send-email-otp-verification
   */
  @Post('send-email-otp-verification')
  async sendEmailOtp(@Body() sendEmailOtpDto: SendEmailOtpDto) {
    return this.emailVerificationService.sendEmailOtp(
      sendEmailOtpDto.email,
      'verification',
    );
  }

  /**
   * Resend OTP to user's email for login
   * POST /verification/resend-email-otp-login
   */
  @Post('resend-email-otp-login')
  async sendEmailOtpForLogin(@Body() sendEmailOtpDto: SendEmailOtpDto) {
    return this.emailVerificationService.sendEmailOtp(
      sendEmailOtpDto.email,
      'Login',
    );
  }

  /**
   * Verify email with OTP code
   * POST /verification/verify-email-otp-verification
   */
  @Post('verify-email-otp-verification')
  async verifyEmailOtp(@Body() verifyEmailOtpDto: VerifyEmailOtpDto) {
    return this.emailVerificationService.verifyEmailOtp(
      verifyEmailOtpDto.email,
      verifyEmailOtpDto.otp,
      'verification',
    );
  }

  /**
   * Verify email OTP for login
   * POST /verification/verify-email-otp-login
   */
  @Post('verify-email-otp-login')
  async verifyEmailOtpForLogin(@Body() verifyEmailOtpDto: VerifyEmailOtpDto) {
    return this.emailVerificationService.verifyEmailOtp(
      verifyEmailOtpDto.email,
      verifyEmailOtpDto.otp,
      'Login',
    );
  }

  /**
   * Check email verification status
   * GET /verification/email-status?email=user@example.com
   */
  @Get('email-status')
  async checkEmailStatus(@Query('email') email: string) {
    return this.emailVerificationService.checkEmailVerificationStatus(email);
  }
}
