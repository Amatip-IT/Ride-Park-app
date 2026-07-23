import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as otpGenerator from 'otp-generator';
import { User, UserDocument } from '../../schemas/user.schema';
import { TwilioService } from '../services/phone/twilio.service';
import {
  createStoredOtp,
  otpMatches,
  MAX_OTP_ATTEMPTS,
} from 'src/utility/otp.util';

const GENERIC_OTP_SENT =
  'If an account exists for this phone number, an OTP has been sent';

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private twilioService: TwilioService,
  ) {}

  private generateOtp(): string {
    return otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });
  }

  async sendPhoneOtp(phoneNumber: string): Promise<{
    success: boolean;
    message: string;
    expiresIn?: string;
  }> {
    const user = await this.userModel
      .findOne({ phoneNumber })
      .select('+otpStorage');

    if (!user) {
      return {
        success: true,
        message: GENERIC_OTP_SENT,
        expiresIn: '10 minutes',
      };
    }

    if (user.isVerified?.phone) {
      throw new BadRequestException('Phone number is already verified');
    }

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
    user.otpStorage.phoneOtp = createStoredOtp(otp, expiresAt);
    user.markModified('otpStorage');
    await user.save();
    await this.twilioService.sendOtpSms(phoneNumber, otp);

    return {
      success: true,
      message: GENERIC_OTP_SENT,
      expiresIn: '10 minutes',
    };
  }

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
      throw new BadRequestException('Invalid OTP. Please check and try again');
    }

    if (user.isVerified?.phone) {
      throw new BadRequestException('Phone number is already verified');
    }

    if (!user.otpStorage?.phoneOtp) {
      throw new BadRequestException('No OTP found. Please request a new OTP');
    }

    const stored = user.otpStorage.phoneOtp;
    const now = new Date();
    const expiresAt = new Date(stored.expiresAt);
    if (now > expiresAt) {
      user.otpStorage.phoneOtp = undefined;
      user.markModified('otpStorage');
      await user.save();
      throw new BadRequestException(
        'OTP has expired. Please request a new one',
      );
    }

    if ((stored.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      user.otpStorage.phoneOtp = undefined;
      user.markModified('otpStorage');
      await user.save();
      throw new BadRequestException(
        'Too many invalid OTP attempts. Please request a new code.',
      );
    }

    if (!otpMatches(stored, otp)) {
      stored.attempts = (stored.attempts ?? 0) + 1;
      if (stored.attempts >= MAX_OTP_ATTEMPTS) {
        user.otpStorage.phoneOtp = undefined;
        user.markModified('otpStorage');
        await user.save();
        throw new BadRequestException(
          'Too many invalid OTP attempts. Please request a new code.',
        );
      }
      user.markModified('otpStorage');
      await user.save();
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
        this.logger.error('Failed to send welcome SMS', error),
      );

    return {
      success: true,
      message: 'Phone number verified successfully',
      isVerified: true,
    };
  }

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
