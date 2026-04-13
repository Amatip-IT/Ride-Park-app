import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParkingVerification, ParkingVerificationDocument } from 'src/schemas/parking-verification.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { BookingRequest, BookingRequestDocument } from 'src/schemas/booking-request.schema';
import { Response } from 'src/common/interfaces/response.interface';

@Injectable()
export class ProviderService {
  constructor(
    @InjectModel(ParkingVerification.name) private parkingVerifModel: Model<ParkingVerificationDocument>,
    @InjectModel(Chauffeur.name) private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(BookingRequest.name) private bookingModel: Model<BookingRequestDocument>,
  ) {}

  /**
   * Get the current verification status for a provider
   */
  async getVerificationStatus(userId: string, role: string): Promise<Response> {
    try {
      let record: any = null;

      switch (role) {
        case 'parking_provider':
          record = await this.parkingVerifModel.findOne({ user: userId });
          break;
        case 'driver':
          record = await this.chauffeurModel.findOne({ user: userId });
          break;
        case 'taxi_driver':
          record = await this.taxiModel.findOne({ user: userId });
          break;
        default:
          return { success: false, message: 'Invalid provider role' };
      }

      return {
        success: true,
        data: {
          status: record?.status || 'not_applied',
          isVerified: record?.isVerified || false,
          documents: record?.documents || {},
          vehicleInfo: record?.vehicleInfo || null,
          rejectionReason: record?.rejectionReason || null,
        },
        message: record ? 'Verification status retrieved' : 'No verification application found',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch verification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get earnings history and stats for a provider
   */
  async getEarnings(userId: string): Promise<Response> {
    try {
      // Find all completed bookings for this provider
      const bookings = await this.bookingModel.find({
        provider: userId,
        status: { $in: ['completed', 'accepted'] },
      }).sort({ completedAt: -1, createdAt: -1 }).exec();

      let balance = 0;
      let weeklyEarnings = 0;
      
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const transactions = bookings.map(b => {
        const amount = b.quotedPrice || 0;
        balance += amount;
        
        let dateToUse = b.completedAt || b.createdAt || new Date();
        if (dateToUse > oneWeekAgo) {
          weeklyEarnings += amount;
        }

        // Format dates beautifully directly inside the backend if needed, or pass ISO to frontend.
        return {
          id: b._id.toString(),
          type: 'parking',
          amount: amount,
          date: dateToUse,
          title: b.serviceName || 'Parking Booking',
          status: b.status,
        };
      });

      return {
        success: true,
        message: 'Earnings fetched successfully',
        data: {
          balance,
          weeklyEarnings,
          totalBookings: bookings.length,
          transactions,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch earnings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Submit or update verification documents for a parking provider
   */
  async submitParkingVerification(userId: string, data: Record<string, any>): Promise<Response> {
    try {
      let record = await this.parkingVerifModel.findOne({ user: userId });

      if (!record) {
        record = new this.parkingVerifModel({
          user: userId,
          status: 'pending_admin_review',
          address: data.parkAddress,
          postcode: data.parkPostcode,
          documents: {},
        });
      }

      // Update documents (store all dynamic fields)
      record.documents = {
        ...record.documents,
        ...data,
      };

      if (data.parkAddress) record.address = data.parkAddress;
      if (data.parkPostcode) record.postcode = data.parkPostcode;
      record.status = 'pending_admin_review';

      await record.save();

      return {
        success: true,
        data: {
          status: record.status,
          documents: record.documents,
        },
        message: 'Verification documents submitted. Your application is under review.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to submit documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Submit or update verification for a driver (chauffeur)
   */
  async submitDriverVerification(userId: string, data: {
    driverLicenseUrl?: string;
    driverLicenseNumber?: string;
    nationalIdUrl?: string;
    proofOfAddressUrl?: string;
    proofOfAddressType?: string;
  }): Promise<Response> {
    try {
      let record = await this.chauffeurModel.findOne({ user: userId });

      if (!record) {
        record = new this.chauffeurModel({
          user: userId,
          status: 'pending_admin_review',
          documents: {},
        });
      }

      record.documents = {
        ...record.documents,
        driverLicenseUrl: data.driverLicenseUrl || record.documents?.driverLicenseUrl,
        driverLicenseNumber: data.driverLicenseNumber || record.documents?.driverLicenseNumber,
        nationalIdUrl: data.nationalIdUrl || record.documents?.nationalIdUrl,
        proofOfAddressUrl: data.proofOfAddressUrl || record.documents?.proofOfAddressUrl,
        proofOfAddressType: data.proofOfAddressType || record.documents?.proofOfAddressType,
      };

      record.status = 'pending_admin_review';
      await record.save();

      return {
        success: true,
        data: { status: record.status, documents: record.documents },
        message: 'Driver verification documents submitted for review.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to submit documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Submit or update verification for a taxi driver
   */
  async submitTaxiVerification(userId: string, data: {
    driverLicenseUrl?: string;
    driverLicenseNumber?: string;
    plateNumber?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    nationalIdUrl?: string;
    proofOfAddressUrl?: string;
    proofOfAddressType?: string;
  }): Promise<Response> {
    try {
      let record = await this.taxiModel.findOne({ user: userId });

      if (!record) {
        record = new this.taxiModel({
          user: userId,
          status: 'pending_admin_review',
          documents: {},
          vehicleInfo: {},
        });
      }

      record.documents = {
        ...record.documents,
        driverLicenseUrl: data.driverLicenseUrl || record.documents?.driverLicenseUrl,
        driverLicenseNumber: data.driverLicenseNumber || record.documents?.driverLicenseNumber,
        nationalIdUrl: data.nationalIdUrl || record.documents?.nationalIdUrl,
        proofOfAddressUrl: data.proofOfAddressUrl || record.documents?.proofOfAddressUrl,
        proofOfAddressType: data.proofOfAddressType || record.documents?.proofOfAddressType,
      };

      record.vehicleInfo = {
        ...record.vehicleInfo,
        plateNumber: data.plateNumber || record.vehicleInfo?.plateNumber,
        make: data.vehicleMake || record.vehicleInfo?.make,
        model: data.vehicleModel || record.vehicleInfo?.model,
        year: data.vehicleYear || record.vehicleInfo?.year,
      };

      record.status = 'pending_admin_review';
      await record.save();

      return {
        success: true,
        data: {
          status: record.status,
          documents: record.documents,
          vehicleInfo: record.vehicleInfo,
        },
        message: 'Taxi verification documents submitted for review.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to submit documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Toggle driver/taxi availability (online/offline)
   * Cannot toggle if currently busy (on a trip)
   */
  async toggleAvailability(userId: string, role: string, status: 'online' | 'offline'): Promise<Response> {
    try {
      const record: any = role === 'driver'
        ? await this.chauffeurModel.findOne({ user: userId })
        : await this.taxiModel.findOne({ user: userId });

      if (!record) {
        return { success: false, message: 'Provider record not found. Complete verification first.' };
      }

      if (record.availability === 'busy') {
        return { success: false, message: 'Cannot change status while on an active trip.' };
      }

      record.availability = status;
      await record.save();

      return {
        success: true,
        data: { availability: record.availability },
        message: `Status changed to ${status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to toggle status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get assigned driver number
   */
  async getDriverNumber(userId: string, role: string): Promise<Response> {
    try {
      const record: any = role === 'driver'
        ? await this.chauffeurModel.findOne({ user: userId })
        : await this.taxiModel.findOne({ user: userId });

      if (!record) {
        return { success: false, message: 'Provider record not found' };
      }

      // If no number yet, assign one
      if (!record.driverNumber) {
        record.driverNumber = await this.generateNextDriverNumber();
        await record.save();
      }

      return {
        success: true,
        data: { driverNumber: record.driverNumber },
        message: `Your driver number is ${record.driverNumber}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get driver number: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate the next sequential driver number across both chauffeurs and taxis
   */
  private async generateNextDriverNumber(): Promise<string> {
    // Find the highest driver number from both collections
    const [latestChauffeur, latestTaxi] = await Promise.all([
      this.chauffeurModel
        .findOne({ driverNumber: { $exists: true, $ne: null } })
        .sort({ driverNumber: -1 })
        .select('driverNumber')
        .exec(),
      this.taxiModel
        .findOne({ driverNumber: { $exists: true, $ne: null } })
        .sort({ driverNumber: -1 })
        .select('driverNumber')
        .exec(),
    ]);

    const chauffeurNum = latestChauffeur?.driverNumber
      ? parseInt(latestChauffeur.driverNumber, 10)
      : 0;
    const taxiNum = latestTaxi?.driverNumber
      ? parseInt(latestTaxi.driverNumber, 10)
      : 0;

    const nextNum = Math.max(chauffeurNum, taxiNum) + 1;

    // Pad to 3 digits minimum (001, 002, ..., 999, 1000, ...)
    return nextNum.toString().padStart(3, '0');
  }
}
