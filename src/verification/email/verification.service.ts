import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  generateOtp,
  generateToken,
  generateRefreshToken,
} from 'src/utility/authUtilities';
import {
  createStoredOtp,
  otpMatches,
  MAX_OTP_ATTEMPTS,
} from 'src/utility/otp.util';
import { User, UserDocument } from '../../schemas/user.schema';
import { EmailService } from '../services/email/email.service';
import { Response } from 'src/common/interfaces/response.interface';

const GENERIC_OTP_SENT =
  'If an account exists for this email, an OTP has been sent';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private emailService: EmailService,
  ) {}

  /**
   * Send OTP to user's email
   * @param email - User's email address
   * @returns Success message
   */
  async sendEmailOtp(
    email: string,
    reason: string,
  ): Promise<{
    success: boolean;
    message: string;
    expiresIn?: string;
  }> {
    const normalizedEmail = email?.toLowerCase().trim();
    const user = await this.userModel
      .findOne({ email: normalizedEmail })
      .select('+otpStorage');

    // Do not reveal whether the email is registered
    if (!user) {
      return {
        success: true,
        message: GENERIC_OTP_SENT,
        expiresIn: '10 minutes',
      };
    }

    // Rate limiting: Check if OTP was sent recently (within 1 minute)
    if (user.otpStorage?.emailOtp?.expiresAt) {
      const lastOtpTime =
        new Date(user.otpStorage.emailOtp.expiresAt).getTime() - 10 * 60 * 1000;
      const timeSinceLastOtp = Date.now() - lastOtpTime;
      const oneMinute = 60 * 1000;

      if (timeSinceLastOtp < oneMinute) {
        const waitTime = Math.ceil((oneMinute - timeSinceLastOtp) / 1000);
        throw new BadRequestException(
          `Please wait ${waitTime} seconds before requesting a new OTP`,
        );
      }
    }

    if (reason === 'verification') {
      if (user.isVerified?.email) {
        throw new BadRequestException('Email is already verified');
      }
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    if (!user.otpStorage) {
      user.otpStorage = {};
    }
    user.otpStorage.emailOtp = createStoredOtp(otp, expiresAt);
    user.markModified('otpStorage');
    await user.save();

    await this.emailService.sendOtpEmail(normalizedEmail, otp);

    return {
      success: true,
      message: GENERIC_OTP_SENT,
      expiresIn: '10 minutes',
    };
  }

  /**
   * Verify email OTP and mark email as verified
   * @param email - User's email address
   * @param otp - 6-digit OTP code
   * @returns Success message
   */
  async verifyEmailOtp(
    email: string,
    otp: string,
    reason: string,
  ): Promise<Response> {
    const normalizedEmail = email?.toLowerCase().trim();
    const user = await this.userModel
      .findOne({ email: normalizedEmail })
      .select('+otpStorage');

    if (!user) {
      // Same message as invalid OTP to avoid enumeration
      throw new BadRequestException('Invalid OTP. Please check and try again');
    }

    if (reason === 'verification') {
      if (user.isVerified?.email) {
        throw new BadRequestException('Email is already verified');
      }
    }

    if (!user.otpStorage?.emailOtp) {
      throw new BadRequestException('No OTP found. Please request a new OTP');
    }

    const stored = user.otpStorage.emailOtp;
    const now = new Date();
    const expiresAt = new Date(stored.expiresAt);
    if (now > expiresAt) {
      user.otpStorage.emailOtp = undefined;
      user.markModified('otpStorage');
      await user.save();
      throw new BadRequestException(
        'OTP has expired. Please request a new one',
      );
    }

    if ((stored.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      user.otpStorage.emailOtp = undefined;
      user.markModified('otpStorage');
      await user.save();
      throw new BadRequestException(
        'Too many invalid OTP attempts. Please request a new code.',
      );
    }

    if (!otpMatches(stored, otp)) {
      stored.attempts = (stored.attempts ?? 0) + 1;
      if (stored.attempts >= MAX_OTP_ATTEMPTS) {
        user.otpStorage.emailOtp = undefined;
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

    if (reason === 'verification') {
      if (!user.isVerified) {
        user.isVerified = { email: false, phone: false, identity: false };
      }
      user.isVerified.email = true;
    }

    user.otpStorage.emailOtp = undefined;
    user.markModified('otpStorage');
    await user.save();

    if (reason === 'verification') {
      this.emailService
        .sendWelcomeEmail(normalizedEmail, user.firstName)
        .catch((error) =>
          this.logger.error('Failed to send welcome email', error),
        );

      return {
        success: true,
        message: 'Email verified successfully',
        isVerified: true,
      };
    }

    if (reason === 'password_reset') {
      return {
        success: true,
        message: 'OTP verified successfully',
      };
    }

    if (reason === 'Login') {
      if (user && typeof user === 'object') {
        const tokenVersion = user.tokenVersion ?? 0;
        const token = generateToken({
          _id: user._id.toString(),
          role: user.role,
          tokenVersion,
        });

        const refreshToken = generateRefreshToken(
          user._id.toString(),
          tokenVersion,
        );
        user.refreshToken = refreshToken;
        await user.save();

        return {
          success: true,
          requiresOTP: false,
          token: token,
          refreshToken: refreshToken,
          data: {
            _id: user._id.toString(),
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
          },
          message: 'Login successful',
        };
      }
      return {
        success: false,
        message: 'User data is not in expected format',
      };
    }

    return {
      success: false,
      message: 'Invalid reason for OTP verification',
    };
  }

  /**
   * Check email verification status
   * @param email - User's email address
   * @returns Verification status
   */
  async checkEmailVerificationStatus(email: string): Promise<{
    success: boolean;
    isVerified: boolean;
    email: string;
  }> {
    const user = await this.userModel.findOne({
      email: email?.toLowerCase().trim(),
    });

    if (!user) {
      throw new NotFoundException('User not found with this email');
    }

    return {
      success: true,
      isVerified: user.isVerified?.email || false,
      email: user.email,
    };
  }
}
