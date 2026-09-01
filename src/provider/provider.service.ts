import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ParkingVerification,
  ParkingVerificationDocument,
} from 'src/schemas/parking-verification.schema';
import {
  ParkingSpace,
  ParkingSpaceDocument,
} from 'src/schemas/parking-space.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import {
  BookingRequest,
  BookingRequestDocument,
} from 'src/schemas/booking-request.schema';
import { TransactionDocument } from 'src/schemas/transaction.schema';
import { Response } from 'src/common/interfaces/response.interface';
import { WalletService } from 'src/wallet/wallet.service';
import { AmazonLocationService } from 'src/utility/amazon-location.service';

const VALID_DOC_FIELDS = [
  'natInsuranceUrl',
  'vatCertUrl',
  'dvlaLicenceUrl',
  'bankStatementUrl',
  'dvlaCheckCodeUrl',
  'phvDriverLicenceUrl',
  'profilePhotoUrl',
  'phvlUrl',
  'v5cUrl',
  'insuranceUrl',
  'vehicleInspectionUrl',
] as const;

@Injectable()
export class ProviderService {
  constructor(
    @InjectModel(ParkingVerification.name)
    private parkingVerifModel: Model<ParkingVerificationDocument>,
    @InjectModel(ParkingSpace.name)
    private parkingSpaceModel: Model<ParkingSpaceDocument>,
    @InjectModel(Chauffeur.name)
    private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(BookingRequest.name)
    private bookingModel: Model<BookingRequestDocument>,
    private readonly walletService: WalletService,
    private readonly amazonLocationService: AmazonLocationService,
  ) {}

  // ============================================================
  // NEW: Save provider document to user's documents array
  // ============================================================
  async saveProviderDocument(
    userId: string,
    documentType: string,
    url: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!user.documents) {
      user.documents = [];
    }

    const documentEntry = {
      documentType,
      url,
      fileName,
      fileSize,
      mimeType,
      uploadedAt: new Date(),
      status: 'pending' as const,
    };

    user.documents.push(documentEntry);
    await user.save();

    const savedDoc = user.documents[user.documents.length - 1];
    return {
      _id: user._id,
      ...savedDoc
    };
  }

  // ============================================================
  // NEW: Get user documents
  // ============================================================
  async getUserDocuments(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return user.documents || [];
  }

  // ============================================================
  // NEW: Update document status (admin)
  // ============================================================
  async updateDocumentStatus(
    userId: string,
    documentIndex: number,
    status: 'pending' | 'approved' | 'rejected',
    rejectionReason?: string,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!user.documents || documentIndex >= user.documents.length) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }

    user.documents[documentIndex].status = status;
    if (status === 'rejected' && rejectionReason) {
      user.documents[documentIndex].rejectionReason = rejectionReason;
    }
    user.documents[documentIndex].reviewedAt = new Date();

    await user.save();
    return user.documents[documentIndex];
  }

  // ============================================================
  // Existing methods below
  // ============================================================

  async getVerificationStatus(userId: string, role: string): Promise<Response> {
    try {
      let record: any = null;

      switch (role) {
        case 'parking_provider': {
          const records = await this.parkingVerifModel
            .find({ user: userId })
            .sort({ createdAt: -1 });
          record = records.length > 0 ? records[0] : null;
          return {
            success: true,
            data: {
              status: record?.status || 'not_applied',
              isVerified: record?.isVerified || false,
              documents: record?.documents || {},
              rejectionReason: record?.rejectionReason || null,
              verifications: records,
            },
            message: records.length
              ? `Found ${records.length} parking applications`
              : 'No verification application found',
          };
        }
        case 'driver':
          record = await this.chauffeurModel.findOne({ user: userId });
          break;
        case 'taxi_driver':
          record = await this.taxiModel.findOne({ user: userId });
          break;
        default:
          return { success: false, message: 'Invalid provider role' };
      }

      const docs: Record<string, string | null> = {};
      const docStatuses: Record<string, string> = {};

      if (record) {
        for (const field of VALID_DOC_FIELDS) {
          docs[field] = record[field] || null;
          const raw = record.documentStatuses?.[field];
          if (raw) {
            docStatuses[field] =
              typeof raw === 'object' && raw !== null && raw.status
                ? raw.status
                : raw;
          } else if (record[field]) {
            docStatuses[field] =
              record.status === 'approved' ? 'verified' : 'uploaded';
          }
        }
      }

      return {
        success: true,
        data: {
          status: record?.status || 'not_applied',
          isVerified: record?.isVerified || false,
          documents: docs,
          documentStatuses: docStatuses,
          vehicleInfo: record?.vehicleInfo || null,
          rejectionReason: record?.rejectionReason || null,
          availability: record?.availability || 'offline',
          driverNumber: record?.driverNumber || null,
        },
        message: record
          ? 'Verification status retrieved'
          : 'No verification application found',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch verification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getEarnings(userId: string): Promise<Response> {
    try {
      const wallet = await this.walletService.getWallet(userId);
      const txResult = await this.walletService.getTransactions(userId);
      const transactions = (txResult.data || []) as TransactionDocument[];

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      let weeklyEarnings = 0;

      const formatted = transactions.map((tx) => {
        const createdAt = (tx as any).createdAt as Date | undefined;
        const platformFee = tx.platformFee || 0;
        const netAmount =
          tx.type === 'earning' ? tx.amount - platformFee : tx.amount;

        if (
          tx.type === 'earning' &&
          tx.status === 'completed' &&
          createdAt &&
          createdAt >= oneWeekAgo
        ) {
          weeklyEarnings += netAmount;
        }

        return {
          id: tx._id.toString(),
          type: tx.type,
          grossAmount: tx.amount,
          netAmount: tx.type === 'earning' ? netAmount : undefined,
          platformFee: tx.type === 'earning' ? platformFee : undefined,
          date: createdAt,
          title: tx.description || tx.type,
          status: tx.status,
          referenceId: tx.referenceId,
        };
      });

      return {
        success: true,
        message: 'Earnings fetched successfully',
        data: {
          balance: wallet.balance,
          totalGrossEarnings: wallet.totalEarnings,
          weeklyEarnings: Math.round(weeklyEarnings * 100) / 100,
          totalBookings: formatted.filter((t) => t.type === 'earning').length,
          transactions: formatted,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch earnings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async submitParkingVerification(
    userId: string,
    data: Record<string, any>,
  ): Promise<Response> {
    try {
      let record;

      if (data._id) {
        record = await this.parkingVerifModel.findOne({
          _id: data._id,
          user: userId,
        });
      }

      if (!record) {
        record = new this.parkingVerifModel({
          user: userId,
          status: 'pending_admin_review',
          address: data.parkAddress,
          postcode: data.parkPostcode,
          documents: {},
        });
      }

      record.documents = {
        ...record.documents,
        ...data,
      };

      if (data.parkAddress) record.address = data.parkAddress;
      if (data.parkPostcode) record.postcode = data.parkPostcode;

      let lat = parseFloat(data.parkLat);
      let lng = parseFloat(data.parkLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const geocoded = await this.amazonLocationService.geocodeAddressParts(
          data.parkAddress || record.address,
          data.parkPostcode || record.postcode,
        );
        if (geocoded) {
          lat = geocoded.lat;
          lng = geocoded.lng;
        }
      }
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        record.location = {
          ...record.location,
          coordinates: { lat, lng },
        };
      }

      record.status = 'pending_admin_review';

      await record.save();

      return {
        success: true,
        data: {
          status: record.status,
          documents: record.documents,
        },
        message:
          'Verification documents submitted. Your application is under review.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to submit documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async submitDriverVerification(
    userId: string,
    data: {
      docField: string;
      docUrl: string;
    },
  ): Promise<Response> {
    try {
      const { docField, docUrl } = data;

      if (!VALID_DOC_FIELDS.includes(docField as any)) {
        return {
          success: false,
          message: `Invalid document field: ${docField}`,
        };
      }

      let record = await this.chauffeurModel.findOne({ user: userId });

      if (!record) {
        record = new this.chauffeurModel({
          user: userId,
          status: 'pending_admin_review',
          documentStatuses: {},
        });
      }

      (record as any)[docField] = docUrl;

      if (!record.documentStatuses) record.documentStatuses = {};
      record.documentStatuses[docField] = {
        status: 'uploaded',
        uploadedAt: new Date(),
      };
      record.markModified('documentStatuses');

      if (record.status !== 'approved') {
        record.status = 'pending_admin_review';
      }

      await record.save();

      return {
        success: true,
        data: {
          status: record.status,
          docField,
          docUrl,
          documentStatuses: record.documentStatuses,
        },
        message: 'Document uploaded successfully and is pending review.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to submit document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async submitTaxiVerification(
    userId: string,
    data: {
      docField: string;
      docUrl: string;
      plateNumber?: string;
      vehicleMake?: string;
      vehicleModel?: string;
      vehicleYear?: string;
    },
  ): Promise<Response> {
    try {
      const { docField, docUrl } = data;

      if (!VALID_DOC_FIELDS.includes(docField as any)) {
        return {
          success: false,
          message: `Invalid document field: ${docField}`,
        };
      }

      let record = await this.taxiModel.findOne({ user: userId });

      if (!record) {
        record = new this.taxiModel({
          user: userId,
          status: 'pending_admin_review',
          documentStatuses: {},
          vehicleInfo: {},
        });
      }

      (record as any)[docField] = docUrl;

      if (!record.documentStatuses) record.documentStatuses = {};
      record.documentStatuses[docField] = {
        status: 'uploaded',
        uploadedAt: new Date(),
      };
      record.markModified('documentStatuses');

      if (
        data.plateNumber ||
        data.vehicleMake ||
        data.vehicleModel ||
        data.vehicleYear
      ) {
        record.vehicleInfo = {
          ...record.vehicleInfo,
          plateNumber: data.plateNumber || record.vehicleInfo?.plateNumber,
          make: data.vehicleMake || record.vehicleInfo?.make,
          model: data.vehicleModel || record.vehicleInfo?.model,
          year: data.vehicleYear || record.vehicleInfo?.year,
        };
      }

      if (record.status !== 'approved') {
        record.status = 'pending_admin_review';
      }

      await record.save();

      return {
        success: true,
        data: {
          status: record.status,
          docField,
          docUrl,
          documentStatuses: record.documentStatuses,
          vehicleInfo: record.vehicleInfo,
        },
        message: 'Document uploaded successfully and is pending review.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to submit document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async toggleAvailability(
    userId: string,
    role: string,
    status: 'online' | 'offline',
    location?: { lat: number; lng: number },
  ): Promise<Response> {
    try {
      const record: any =
        role === 'driver'
          ? await this.chauffeurModel.findOne({ user: userId })
          : await this.taxiModel.findOne({ user: userId });

      if (!record) {
        return {
          success: false,
          message: 'Provider record not found. Complete verification first.',
        };
      }

      if (record.availability === 'busy') {
        return {
          success: false,
          message: 'Cannot change status while on an active trip.',
        };
      }

      record.availability = status;
      if (
        status === 'online' &&
        location?.lat != null &&
        location?.lng != null
      ) {
        record.location = {
          coordinates: { lat: location.lat, lng: location.lng },
        };
      }
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

  async updateDriverLocation(
    userId: string,
    role: string,
    location: { lat: number; lng: number },
  ): Promise<Response> {
    try {
      if (location.lat == null || location.lng == null) {
        return { success: false, message: 'Valid coordinates are required' };
      }

      const record: any =
        role === 'driver'
          ? await this.chauffeurModel.findOne({ user: userId })
          : await this.taxiModel.findOne({ user: userId });

      if (!record) {
        return { success: false, message: 'Provider record not found' };
      }

      record.location = {
        coordinates: { lat: location.lat, lng: location.lng },
      };
      await record.save();

      return {
        success: true,
        data: { location: record.location },
        message: 'Location updated',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update location: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getDriverNumber(userId: string, role: string): Promise<Response> {
    try {
      const record: any =
        role === 'driver'
          ? await this.chauffeurModel.findOne({ user: userId })
          : await this.taxiModel.findOne({ user: userId });

      if (!record) {
        return { success: false, message: 'Provider record not found' };
      }

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

  private async generateNextDriverNumber(): Promise<string> {
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
    return nextNum.toString().padStart(3, '0');
  }

  async getMySpaces(userId: string): Promise<Response> {
    try {
      const spaces = await this.parkingSpaceModel
        .find({ owner: userId })
        .sort({ createdAt: -1 })
        .exec();

      const enriched = await Promise.all(
        spaces.map(async (space) => {
          const spaceObj = space.toObject();

          const [activeCount, pendingCount, completedCount, totalRevenue] =
            await Promise.all([
              this.bookingModel.countDocuments({
                serviceId: space._id,
                status: 'accepted',
              }),
              this.bookingModel.countDocuments({
                serviceId: space._id,
                status: 'pending',
              }),
              this.bookingModel.countDocuments({
                serviceId: space._id,
                status: 'completed',
              }),
              this.bookingModel.aggregate([
                {
                  $match: {
                    serviceId: space._id,
                    status: { $in: ['completed', 'accepted'] },
                  },
                },
                {
                  $group: {
                    _id: null,
                    total: { $sum: '$quotedPrice' },
                  },
                },
              ]),
            ]);

          const occupyingCount = activeCount + completedCount;
          const availableSpots = Math.max(
            0,
            (space.totalSpots || 0) - occupyingCount,
          );

          if (space.occupiedSpots !== occupyingCount) {
            await this.parkingSpaceModel.findByIdAndUpdate(space._id, {
              occupiedSpots: occupyingCount,
              isAvailable: availableSpots > 0,
            });
          }

          return {
            ...spaceObj,
            stats: {
              activeBookings: activeCount,
              pendingRequests: pendingCount,
              completedBookings: completedCount,
              totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
              availableSpots,
            },
          };
        }),
      );

      return {
        success: true,
        data: enriched,
        message: `Found ${spaces.length} parking space(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch spaces: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async updateSpace(
    userId: string,
    spaceId: string,
    updates: {
      name?: string;
      description?: string;
      hourlyRate?: number;
      dailyRate?: number;
      totalSpots?: number;
      parkingType?: string;
      bookingMethods?: string[];
      acceptedVehicles?: string[];
      maxStayDetails?: string;
      openingTimes?: Record<string, string>;
      chargesDescription?: string;
      photos?: string[];
      cctvPhotos?: string[];
    },
  ): Promise<Response> {
    try {
      const space = await this.parkingSpaceModel.findOne({
        _id: spaceId,
        owner: userId,
      });

      if (!space) {
        return {
          success: false,
          message: 'Parking space not found or you are not the owner',
        };
      }

      if (updates.name !== undefined) space.name = updates.name;
      if (updates.description !== undefined)
        space.description = updates.description;
      if (updates.hourlyRate !== undefined)
        space.hourlyRate = updates.hourlyRate;
      if (updates.dailyRate !== undefined) space.dailyRate = updates.dailyRate;
      if (updates.parkingType !== undefined)
        space.parkingType = updates.parkingType;
      if (updates.bookingMethods !== undefined)
        space.bookingMethods = updates.bookingMethods;
      if (updates.acceptedVehicles !== undefined)
        space.acceptedVehicles = updates.acceptedVehicles;
      if (updates.maxStayDetails !== undefined)
        space.maxStayDetails = updates.maxStayDetails;
      if (updates.openingTimes !== undefined)
        space.openingTimes = updates.openingTimes;
      if (updates.chargesDescription !== undefined)
        space.chargesDescription = updates.chargesDescription;
      if (updates.photos !== undefined) space.photos = updates.photos;
      if (updates.cctvPhotos !== undefined)
        space.cctvPhotos = updates.cctvPhotos;

      if (updates.totalSpots !== undefined) {
        if (updates.totalSpots < space.occupiedSpots) {
          return {
            success: false,
            message: `Cannot reduce capacity below current occupancy (${space.occupiedSpots} spots are currently occupied)`,
          };
        }
        space.totalSpots = updates.totalSpots;
        space.isAvailable = space.occupiedSpots < space.totalSpots;
      }

      await space.save();

      return {
        success: true,
        data: space,
        message: 'Parking space updated successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update space: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async toggleSpaceAvailability(
    userId: string,
    spaceId: string,
  ): Promise<Response> {
    try {
      const space = await this.parkingSpaceModel.findOne({
        _id: spaceId,
        owner: userId,
      });

      if (!space) {
        return {
          success: false,
          message: 'Parking space not found or you are not the owner',
        };
      }

      if (!space.isAvailable) {
        if (space.occupiedSpots >= space.totalSpots) {
          return {
            success: false,
            message: `Cannot re-enable — all ${space.totalSpots} spots are currently occupied.`,
          };
        }
        space.isAvailable = true;
      } else {
        space.isAvailable = false;
      }

      await space.save();

      return {
        success: true,
        data: { isAvailable: space.isAvailable },
        message: space.isAvailable
          ? 'Parking space is now visible and accepting bookings'
          : 'Parking space has been temporarily hidden from search results',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to toggle availability: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
