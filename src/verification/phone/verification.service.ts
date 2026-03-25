import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as otpGenerator from 'otp-generator';
import { User, UserDocument } from '../../schemas/user.schema';
import { TwilioService } from '../services/phone/twilio.service';

@Injectable()
export class PhoneVerificationService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private twilioService: TwilioService,
  ) {}

  /**
   * Generate a 6-digit OTP code
   * @returns 6-digit numeric OTP
   */
  private generateOtp(): string {
    return otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });
  }

  /**
   * Send OTP to user's phone
   * @param phoneNumber - User's phone number
   * @returns Success message
   */
  async sendPhoneOtp(phoneNumber: string): Promise<{
    success: boolean;
    message: string;
    expiresIn?: string;
  }> {
    const user = await this.userModel
      .findOne({ phoneNumber })
      .select('+otpStorage');

    if (!user) {
      throw new NotFoundException('User not found with this phone number');
    }

    if (user.isVerified?.phone) {
      throw new BadRequestException('Phone number is already verified');
    }

    // Rate limiting
    if (user.otpStorage?.phoneOtp?.expiresAt) {
      const lastOtpTime =
        new Date(user.otpStorage.phoneOtp.expiresAt).getTime() - 10 * 60 * 1000;
      const timeSinceLastOtp = Date.now() - lastOtpTime;
      const oneMinute = 60 * 1000;

      if (timeSinceLastOtp < oneMinute) {
        const waitTime = Math.ceil((oneMinute - timeSinceLastOtp) / 1000);
        throw new BadRequestException(
          `Please wait ${waitTime} seconds before requesting a new OTP`,
        );
      }
    }

    const otp: string = this.generateOtp();
    const expiresAt: Date = new Date(Date.now() + 10 * 60 * 1000);

    if (!user.otpStorage) {
      user.otpStorage = {};
    }
    user.otpStorage.phoneOtp = { code: otp, expiresAt };

    await user.save();
    await this.twilioService.sendOtpSms(phoneNumber, otp);

    return {
      success: true,
      message: 'OTP sent successfully to your phone',
      expiresIn: '10 minutes',
    };
  }

  /**
   * Verify phone OTP and mark phone as verified
   * @param phoneNumber - User's phone number
   * @param otp - 6-digit OTP code
   * @returns Success message
   */
  async verifyPhoneOtp(
    phoneNumber: string,
    otp: string,
  ): Promise<{
    success: boolean;
    message: string;
    isVerified: boolean;
  }> {
    const user = await this.userModel
      .findOne({ phoneNumber })
      .select('+otpStorage');

    if (!user) {
      throw new NotFoundException('User not found with this phone number');
    }

    if (user.isVerified?.phone) {
      throw new BadRequestException('Phone number is already verified');
    }

    if (!user.otpStorage?.phoneOtp) {
      throw new BadRequestException('No OTP found. Please request a new OTP');
    }

    const now = new Date();
    const expiresAt = new Date(user.otpStorage.phoneOtp.expiresAt);
    if (now > expiresAt) {
      user.otpStorage.phoneOtp = undefined;
      user.markModified('otpStorage');
      await user.save();
      throw new BadRequestException(
        'OTP has expired. Please request a new one',
      );
    }

    if (user.otpStorage.phoneOtp.code !== otp) {
      throw new BadRequestException('Invalid OTP. Please check and try again');
    }

    if (!user.isVerified) {
      user.isVerified = { email: false, phone: false, identity: false };
    }
    user.isVerified.phone = true;
    user.otpStorage.phoneOtp = undefined;
    user.markModified('otpStorage');

    await user.save();

    this.twilioService
      .sendWelcomeSms(phoneNumber, user.firstName)
      .catch((error: Error) =>
        console.error('Failed to send welcome SMS:', error),
      );

    return {
      success: true,
      message: 'Phone number verified successfully',
      isVerified: true,
    };
  }

  /**
   * Check phone verification status
   * @param phoneNumber - User's phone number
   * @returns Verification status
   */
  async checkPhoneVerificationStatus(phoneNumber: string): Promise<{
    success: boolean;
    isVerified: boolean;
    phoneNumber: string;
  }> {
    const user = await this.userModel.findOne({ phoneNumber });

    if (!user) {
      throw new NotFoundException('User not found with this phone number');
    }

    return {
      success: true,
      isVerified: user.isVerified?.phone || false,
      phoneNumber: user.phoneNumber,
    };
  }
}
