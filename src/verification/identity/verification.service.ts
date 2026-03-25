import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../schemas/user.schema';
import {
  IdentityVerification,
  IdentityVerificationDocument,
} from '../../schemas/identity-verification.schema';
import { StripeIdentityService } from '../services/identity/stripe-identity.service';

@Injectable()
export class IdentityVerificationService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(IdentityVerification.name)
    private identityVerificationModel: Model<IdentityVerificationDocument>,
    private stripeIdentityService: StripeIdentityService,
  ) {}

  /**
   * Create identity verification session
   * @param userId - User's ID
   * @param returnUrl - URL to redirect after verification
   * @returns Verification session details
   */
  async createVerificationSession(
    userId: string,
    returnUrl: string,
  ): Promise<{
    success: boolean;
    sessionId: string;
    url: string;
    clientSecret: string;
    message: string;
  }> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingVerification = await this.identityVerificationModel
      .findOne({
        user: userId,
        status: 'verified',
        verifiedAt: { $ne: null },
      })
      .sort({ verifiedAt: -1 });

    let message =
      'Verification session created. Please complete verification on Stripe.';

    // If already verified but idType is unknown (test mode issue)
    if (user.isVerified?.identity && !existingVerification?.idType) {
      throw new BadRequestException(
        'Identity already verified. Cannot create new verification session.',
      );
    }

    // Block if already verified with driving license
    if (
      user.isVerified?.identity &&
      existingVerification?.idType === 'driving_license'
    ) {
      throw new BadRequestException(
        'Identity already verified with driving license. No re-verification needed.',
      );
    }

    // Allow re-verification if currently verified with passport
    if (
      user.isVerified?.identity &&
      existingVerification?.idType === 'passport'
    ) {
      message =
        'Re-verification session created. Please upload your UK driving license to become eligible as a driver.';
    }

    // Create Stripe verification session
    const session = await this.stripeIdentityService.createVerificationSession(
      userId,
      returnUrl,
    );

    await this.identityVerificationModel.findOneAndUpdate(
      {
        user: userId,
        status: { $in: ['pending', 'failed'] },
      },
      {
        user: userId,
        stripeVerificationId: session.sessionId,
        status: 'pending',
        verifiedAt: null,
        idType: null,
        verifiedName: null,
        verifiedDOB: null,
        licenseNumber: null,
        expiresAt: new Date(),
      },
      { upsert: true, new: true },
    );

    return {
      success: true,
      sessionId: session.sessionId,
      url: session.url,
      clientSecret: session.clientSecret,
      message,
    };
  }

  /**
   * Handle Stripe webhook for verification completion
   * @param sessionId - Stripe verification session ID
   * @returns Processing result
   */
  async handleVerificationWebhook(sessionId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const sessionData =
      await this.stripeIdentityService.getVerificationSession(sessionId);

    const verificationRecord = await this.identityVerificationModel.findOne({
      stripeVerificationId: sessionId,
    });

    if (!verificationRecord) {
      console.error('Cannot find verification record for session:', sessionId);
      return {
        success: false,
        message: 'Verification record not found',
      };
    }

    const userId = String(verificationRecord.user);
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Handle verification failure
    if (!sessionData.verified) {
      await this.identityVerificationModel.findOneAndUpdate(
        { stripeVerificationId: sessionId },
        {
          status: 'failed',
          expiresAt: new Date(),
        },
      );

      console.log(`Verification failed for session: ${sessionId}`);
      return {
        success: false,
        message: 'Verification failed',
      };
    }

    // Handle verification success
    await this.identityVerificationModel.findOneAndUpdate(
      { stripeVerificationId: sessionId },
      {
        status: 'verified',
        idType: sessionData.idType,
        verifiedName: `${sessionData.firstName} ${sessionData.lastName}`,
        verifiedDOB: sessionData.dateOfBirth,
        licenseNumber: sessionData.licenseNumber,
        verifiedAt: new Date(),
        expiresAt: null,
      },
      { new: true },
    );

    // Update user verification status
    if (!user.isVerified) {
      user.isVerified = { email: false, phone: false, identity: false };
    }
    user.isVerified.identity = true;
    await user.save();

    console.log(`Identity verified for user: ${userId}`);

    return {
      success: true,
      message: 'Identity verification completed successfully',
    };
  }

  /**
   * Check identity verification status
   * @param userId - User's ID
   * @returns Verification status and details
   */
  async checkIdentityStatus(userId: string): Promise<{
    success: boolean;
    isVerified: boolean;
    details?: {
      idType: string;
      verifiedName: string;
      verifiedDOB: string;
      verifiedAt: Date;
    };
  }> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isVerified = user.isVerified?.identity || false;

    if (!isVerified) {
      return {
        success: true,
        isVerified: false,
      };
    }

    const identityVerification = await this.identityVerificationModel
      .findOne({
        user: userId,
        status: 'verified',
        verifiedAt: { $ne: null },
      })
      .sort({ verifiedAt: -1 });

    if (!identityVerification) {
      return {
        success: true,
        isVerified: false,
      };
    }

    return {
      success: true,
      isVerified: true,
      details: {
        idType: identityVerification.idType || 'unknown',
        verifiedName: identityVerification.verifiedName || 'N/A',
        verifiedDOB: identityVerification.verifiedDOB || 'N/A',
        verifiedAt: identityVerification.verifiedAt || new Date(),
      },
    };
  }

  /**
   * Check if user verified with driving license
   * @param userId - User's ID
   * @returns boolean - true if verified with driving license
   */
  async hasVerifiedWithDrivingLicense(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId);

    // User must be verified first
    if (!user?.isVerified?.identity) {
      return false;
    }

    // Get most recent verified record
    const identityVerification = await this.identityVerificationModel
      .findOne({
        user: userId,
        status: 'verified',
        verifiedAt: { $ne: null },
      })
      .sort({ verifiedAt: -1 });

    return identityVerification?.idType === 'driving_license';
  }
}
