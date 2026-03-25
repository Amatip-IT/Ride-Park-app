import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { generateOtp, generateToken, generateRefreshToken } from 'src/utility/authUtilities';
import { User, UserDocument } from '../../schemas/user.schema';
import { EmailService } from '../services/email/email.service';
import { Response } from 'src/common/interfaces/response.interface';

@Injectable()
export class EmailVerificationService {
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
    // Find user by email
    const user = await this.userModel.findOne({ email }).select('+otpStorage');

    if (!user) {
      throw new NotFoundException('User not found with this email');
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
      // Check if email is already verified
      if (user.isVerified?.email) {
        throw new BadRequestException('Email is already verified');
      }
    }

    // Generate OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in database
    if (!user.otpStorage) {
      user.otpStorage = {};
    }
    user.otpStorage.emailOtp = {
      code: otp,
      expiresAt,
    };

    await user.save();

    // Send OTP email
    await this.emailService.sendOtpEmail(email, otp);

    return {
      success: true,
      message: 'OTP sent successfully to your email',
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
    // Find user by email
    const user = await this.userModel.findOne({ email }).select('+otpStorage');

    if (!user) {
      throw new NotFoundException('User not found with this email');
    }

    if (reason === 'verification') {
      // Check if email is already verified
      if (user.isVerified?.email) {
        throw new BadRequestException('Email is already verified');
      }
    }

    // Check if OTP exists
    if (!user.otpStorage?.emailOtp) {
      throw new BadRequestException('No OTP found. Please request a new OTP');
    }

    // Check if OTP is expired
    const now = new Date();
    const expiresAt = new Date(user.otpStorage.emailOtp.expiresAt);
    if (now > expiresAt) {
      // Clear expired OTP
      user.otpStorage.emailOtp = undefined;
      await user.save();
      throw new BadRequestException(
        'OTP has expired. Please request a new one',
      );
    }

    // Verify OTP
    if (user.otpStorage.emailOtp.code !== otp) {
      throw new BadRequestException('Invalid OTP. Please check and try again');
    }

    // Mark email as verified if reason is verification
    if (reason === 'verification') {
      if (!user.isVerified) {
        user.isVerified = { email: false, phone: false, identity: false };
      }
      user.isVerified.email = true;
    }

    // Clear OTP after successful verification
    user.otpStorage.emailOtp = undefined;

    await user.save();

    // Send welcome email (async, don't wait) if email just got verified
    if (reason === 'verification') {
      this.emailService
        .sendWelcomeEmail(email, user.firstName)
        .catch((error) =>
          console.error('Failed to send welcome email:', error),
        );

      return {
        success: true,
        message: 'Email verified successfully',
        isVerified: true,
      };
    }

    if (reason === 'Login') {
      if (user && typeof user === 'object') {
        // Generate JWT token
        const token = generateToken({
          _id: user._id.toString(),
          role: user.role,
        });

        const refreshToken = generateRefreshToken(user._id.toString());
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
      } else {
        return {
          success: false,
          message: 'User data is not in expected format',
        };
      }
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
    const user = await this.userModel.findOne({ email });

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
