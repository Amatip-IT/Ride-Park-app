import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParkingVerification, ParkingVerificationDocument } from 'src/schemas/parking-verification.schema';
import { ParkingSpace, ParkingSpaceDocument } from 'src/schemas/parking-space.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Wallet, WalletDocument } from 'src/schemas/wallet.schema';
import { Transaction, TransactionDocument } from 'src/schemas/transaction.schema';
import { PlatformSettings, PlatformSettingsDocument } from 'src/schemas/platform-settings.schema';
import { Response } from 'src/common/interfaces/response.interface';
import { What3WordsService } from 'src/utility/what3words.service';
import Stripe from 'stripe';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private stripe: Stripe;

  constructor(
    @InjectModel(ParkingVerification.name) private parkingVerifModel: Model<ParkingVerificationDocument>,
    @InjectModel(ParkingSpace.name) private parkingSpaceModel: Model<ParkingSpaceDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(PlatformSettings.name) private platformSettingsModel: Model<PlatformSettingsDocument>,
    private what3wordsService: What3WordsService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');
  }

  /**
   * Get all pending parking provider verification requests
   */
  async getPendingParkingVerifications(): Promise<Response> {
    try {
      const pending = await this.parkingVerifModel
        .find({ status: 'pending_admin_review' })
        .populate('user', 'firstName lastName email phoneNumber')
        .exec();

      return {
        success: true,
        data: pending,
        message: `Found ${pending.length} pending parking verifications`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch pending verifications: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Approve a parking provider, creating their official Parking Space and fetching geo-location
   */
  async approveParkingVerification(id: string, customHourlyRate = 5): Promise<Response> {
    try {
      const verification = await this.parkingVerifModel.findById(id).exec();

      if (!verification) {
        return { success: false, message: 'Verification application not found' };
      }

      if (verification.status === 'approved') {
        return { success: false, message: 'This application is already approved' };
      }

      const user = await this.userModel.findById(verification.user).exec();
      if (!user) {
        return { success: false, message: 'Associated provider account not found' };
      }

      let lat = 0;
      let lng = 0;
      let w3wData: any = null;

      // 1. Convert Postcode to Lat/Lng using free postcodes.io API (UK)
      if (verification.postcode) {
        try {
          // Clean the postcode
          const cleanPostcode = verification.postcode.replace(/\s+/g, '').trim();
          const pCodeRes = await fetch(`https://api.postcodes.io/postcodes/${cleanPostcode}`);
          if (pCodeRes.ok) {
            const pCodeData = await pCodeRes.json();
            if (pCodeData.status === 200 && pCodeData.result) {
              lat = pCodeData.result.latitude;
              lng = pCodeData.result.longitude;
              this.logger.log(`Geocoded postcode ${verification.postcode} to ${lat}, ${lng}`);

              // 2. Convert coordinates to what3words!
              w3wData = await this.what3wordsService.convertToThreeWordAddress(lat, lng);
            }
          }
        } catch (e) {
          this.logger.warn(`Failed to geocode postcode: ${e}`);
        }
      }

      // If we don't have a name from the provider, construct one
      const docs = verification.documents || {};
      const parkName = docs.parkName || `${user.firstName}'s Parking Space`;
      
      // 3. Create the official, searchable Parking Space!
      const newSpace = new this.parkingSpaceModel({
        owner: user._id,
        name: parkName,
        description: 'Secure parking space approved by Gleezip admins.',
        postCode: verification.postcode || 'UNKNOWN',
        hourlyRate: parseFloat(docs.hourlyRate) || customHourlyRate,
        dailyRate: docs.dailyRate ? parseFloat(docs.dailyRate) : undefined,
        totalSpots: parseInt(docs.totalSpots) || 1,
        parkingType: docs.parkingType || 'Short Stay',
        bookingMethods: docs.bookingMethods ? docs.bookingMethods.split(',').map((s: string) => s.trim()) : ['Online / App'],
        acceptedVehicles: docs.acceptedVehicles ? docs.acceptedVehicles.split(',').map((s: string) => s.trim()) : ['Car'],
        maxStayDetails: docs.maxStayDetails || undefined,
        openingTimes: { "Everyday": docs.openingTimes || "24 Hours" },
        chargesDescription: docs.chargesDescription || undefined,
        isAvailable: true,
        isVerified: true,
        photos: docs.parkPhotoUrl ? [docs.parkPhotoUrl] : [],
        cctvPhotos: docs.cctvPhotoUrl ? [docs.cctvPhotoUrl] : [],
      });

      // Add the enriched location data if we got it
      if (lat && lng) {
        newSpace.coordinates = { lat, lng };
      }
      
      if (w3wData) {
        newSpace.what3words = w3wData.words;
        newSpace.nearestPlace = w3wData.nearestPlace;
        newSpace.country = w3wData.country;
        // Optionally store town from nearestPlace
        newSpace.town = w3wData.nearestPlace.split(',')[0].trim();
      }

      await newSpace.save();

      // 4. Update the Verification status to approved
      verification.status = 'approved';
      verification.isVerified = true;
      verification.isActive = true;
      // We can optionally link the parsed location back to the verification record
      verification.location = {
        coordinates: { lat, lng },
        what3words: w3wData?.words,
      };
      await verification.save();

      return {
        success: true,
        data: {
          verificationId: verification._id,
          parkingSpace: newSpace,
        },
        message: 'Parking verification approved! The parking space is now active and searchable.',
      };

    } catch (error) {
      this.logger.error(error);
      return {
        success: false,
        message: `Failed to approve verification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Reject a parking verification request
   */
  async rejectParkingVerification(id: string, reason: string): Promise<Response> {
    try {
      const verification = await this.parkingVerifModel.findById(id).exec();
      if (!verification) {
        return { success: false, message: 'Verification application not found' };
      }

      verification.status = 'rejected';
      verification.rejectionReason = reason;
      await verification.save();

      return {
        success: true,
        data: null,
        message: 'Parking verification rejected.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to reject verification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get all providers with pending identity verification
   */
  async getPendingIdentityVerifications(): Promise<Response> {
    try {
      const pending = await this.userModel
        .find({ identityStatus: 'pending' })
        .select('firstName lastName email phoneNumber role idType identityDocumentUrl proofOfAddressUrl identityStatus createdAt')
        .sort({ createdAt: -1 })
        .exec();

      return {
        success: true,
        data: pending,
        message: `Found ${pending.length} pending identity verifications`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch identity verifications: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Approve a provider's identity verification
   */
  async approveIdentityVerification(userId: string): Promise<Response> {
    try {
      const user = await this.userModel.findById(userId).exec();

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if ((user as any).identityStatus === 'verified') {
        return { success: false, message: 'This user is already verified' };
      }

      (user as any).identityStatus = 'verified';
      await user.save();

      return {
        success: true,
        data: {
          userId: user._id,
          identityStatus: 'verified',
        },
        message: `Identity verified for ${user.firstName} ${user.lastName}. They can now create parking spaces.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to approve identity: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Reject a provider's identity verification
   */
  async rejectIdentityVerification(userId: string, reason: string): Promise<Response> {
    try {
      const user = await this.userModel.findById(userId).exec();

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      (user as any).identityStatus = 'rejected';
      await user.save();

      return {
        success: true,
        data: null,
        message: `Identity verification rejected for ${user.firstName} ${user.lastName}. Reason: ${reason}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to reject identity: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
  // ── Platform Settings ──
  async getPlatformSettings(): Promise<Response> {
    let settings = await this.platformSettingsModel.findOne();
    if (!settings) {
      settings = await this.platformSettingsModel.create({ platformFeePercentage: 10 });
    }
    return { success: true, data: settings, message: 'Settings retrieved' };
  }

  async updatePlatformFee(percentage: number): Promise<Response> {
    let settings = await this.platformSettingsModel.findOne();
    if (!settings) {
      settings = new this.platformSettingsModel({ platformFeePercentage: percentage });
    } else {
      settings.platformFeePercentage = percentage;
    }
    await settings.save();
    return { success: true, data: settings, message: `Platform fee updated to ${percentage}%` };
  }

  // ── Payouts (Withdrawals) ──
  async getPendingWithdrawals(): Promise<Response> {
    const pending = await this.transactionModel
      .find({ type: 'withdrawal', status: 'pending' })
      .populate('providerId', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .exec();
    return { success: true, data: pending, message: 'Pending withdrawals retrieved' };
  }

  async approveWithdrawal(transactionId: string): Promise<Response> {
    try {
      const transaction = await this.transactionModel.findById(transactionId).exec();
      if (!transaction || transaction.type !== 'withdrawal') {
        return { success: false, message: 'Withdrawal request not found' };
      }
      if (transaction.status !== 'pending') {
        return { success: false, message: 'Withdrawal is not pending' };
      }

      const wallet = await this.walletModel.findOne({ providerId: transaction.providerId }).exec();
      if (!wallet || !wallet.stripeConnectId) {
        return { success: false, message: 'Provider wallet or Stripe Connect account not found' };
      }

      // Transfer funds via Stripe
      const amountInPence = Math.round(transaction.amount * 100);
      const transfer = await this.stripe.transfers.create({
        amount: amountInPence,
        currency: 'gbp',
        destination: wallet.stripeConnectId,
        description: `Payout for ${transactionId}`,
      });

      transaction.status = 'completed';
      transaction.referenceId = transfer.id;
      await transaction.save();

      return { success: true, data: transaction, message: 'Withdrawal approved and funds transferred' };
    } catch (e: any) {
      this.logger.error(`Stripe Transfer Failed: ${e.message}`);
      return { success: false, message: `Stripe Transfer Failed: ${e.message}` };
    }
  }

  async rejectWithdrawal(transactionId: string, reason: string): Promise<Response> {
    try {
      const transaction = await this.transactionModel.findById(transactionId).exec();
      if (!transaction || transaction.type !== 'withdrawal') {
        return { success: false, message: 'Withdrawal request not found' };
      }
      if (transaction.status !== 'pending') {
        return { success: false, message: 'Withdrawal is not pending' };
      }

      transaction.status = 'rejected';
      transaction.adminNotes = reason;
      await transaction.save();

      // Refund the wallet
      const wallet = await this.walletModel.findOne({ providerId: transaction.providerId }).exec();
      if (wallet) {
        wallet.balance += transaction.amount;
        await wallet.save();
      }

      return { success: true, data: transaction, message: 'Withdrawal rejected and funds refunded to provider' };
    } catch (error) {
      return { success: false, message: `Failed to reject withdrawal: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }
}
