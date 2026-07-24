import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { EmailVerificationService } from './verification.service';
import { SendEmailOtpDto } from '../dto/send-email-otp.dto';
import { VerifyEmailOtpDto } from '../dto/verify-email-otp.dto';
import { RateLimit } from 'src/common/rate-limit.decorator';

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
  @RateLimit({ limit: 3, windowMs: 10 * 60_000 })
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
  @RateLimit({ limit: 3, windowMs: 10 * 60_000 })
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
  @RateLimit({ limit: 10, windowMs: 10 * 60_000 })
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
  @RateLimit({ limit: 10, windowMs: 10 * 60_000 })
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
