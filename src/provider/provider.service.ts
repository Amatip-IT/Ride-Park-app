import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParkingVerification, ParkingVerificationDocument } from 'src/schemas/parking-verification.schema';
import { ParkingSpace, ParkingSpaceDocument } from 'src/schemas/parking-space.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { BookingRequest, BookingRequestDocument } from 'src/schemas/booking-request.schema';
import { Response } from 'src/common/interfaces/response.interface';

// All valid document field names that can be uploaded
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
    @InjectModel(ParkingVerification.name) private parkingVerifModel: Model<ParkingVerificationDocument>,
    @InjectModel(ParkingSpace.name) private parkingSpaceModel: Model<ParkingSpaceDocument>,
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
        case 'parking_provider': {
          const records = await this.parkingVerifModel.find({ user: userId }).sort({ createdAt: -1 });
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
            message: records.length ? `Found ${records.length} parking applications` : 'No verification application found',
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

      // Build individual documents map for driver/taxi
      const docs: Record<string, string | null> = {};
      const docStatuses: Record<string, string> = {};

      if (record) {
        for (const field of VALID_DOC_FIELDS) {
          docs[field] = record[field] || null;
          if (record.documentStatuses?.[field]) {
            docStatuses[field] = record.documentStatuses[field];
          } else if (record[field]) {
            // Backward compatibility: if doc exists but no per-doc status, derive from overall status
            docStatuses[field] = record.status === 'approved' ? 'verified' : 'uploaded';
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
      let record;
      
      if (data._id) {
        record = await this.parkingVerifModel.findOne({ _id: data._id, user: userId });
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
   * Submit or update a single document for a driver (chauffeur).
   * Each document is stored in its own dedicated field.
   */
  async submitDriverVerification(userId: string, data: {
    docField: string;
    docUrl: string;
  }): Promise<Response> {
    try {
      const { docField, docUrl } = data;

      // Validate the field name
      if (!VALID_DOC_FIELDS.includes(docField as any)) {
        return { success: false, message: `Invalid document field: ${docField}` };
      }

      let record = await this.chauffeurModel.findOne({ user: userId });

      if (!record) {
        record = new this.chauffeurModel({
          user: userId,
          status: 'pending_admin_review',
          documentStatuses: {},
        });
      }

      // Set the specific document URL on its own field
      (record as any)[docField] = docUrl;

      // Set per-document status to 'uploaded'
      if (!record.documentStatuses) record.documentStatuses = {};
      record.documentStatuses[docField] = 'uploaded';
      record.markModified('documentStatuses');

      // Update overall status to pending_admin_review if not already approved
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

  /**
   * Submit or update a single document for a taxi driver.
   * Each document is stored in its own dedicated field.
   */
  async submitTaxiVerification(userId: string, data: {
    docField: string;
    docUrl: string;
    // Optional vehicle info
    plateNumber?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
  }): Promise<Response> {
    try {
      const { docField, docUrl } = data;

      // Validate the field name
      if (!VALID_DOC_FIELDS.includes(docField as any)) {
        return { success: false, message: `Invalid document field: ${docField}` };
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

      // Set the specific document URL on its own field
      (record as any)[docField] = docUrl;

      // Set per-document status to 'uploaded'
      if (!record.documentStatuses) record.documentStatuses = {};
      record.documentStatuses[docField] = 'uploaded';
      record.markModified('documentStatuses');

      // Update vehicle info if provided
      if (data.plateNumber || data.vehicleMake || data.vehicleModel || data.vehicleYear) {
        record.vehicleInfo = {
          ...record.vehicleInfo,
          plateNumber: data.plateNumber || record.vehicleInfo?.plateNumber,
          make: data.vehicleMake || record.vehicleInfo?.make,
          model: data.vehicleModel || record.vehicleInfo?.model,
          year: data.vehicleYear || record.vehicleInfo?.year,
        };
      }

      // Update overall status to pending_admin_review if not already approved
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

  // ══════════════════════════════════════════════
  // ── Parking Space Management (Post-Approval) ──
  // ══════════════════════════════════════════════

  /**
   * Get all approved parking spaces owned by this provider
   * Returns each space with live occupancy, booking stats, and revenue
   */
  async getMySpaces(userId: string): Promise<Response> {
    try {
      const spaces = await this.parkingSpaceModel
        .find({ owner: userId })
        .sort({ createdAt: -1 })
        .exec();

      // Enrich each space with booking stats
      const enriched = await Promise.all(
        spaces.map(async (space) => {
          const spaceObj = space.toObject();

          // Count bookings by status for this space
          const [activeCount, pendingCount, completedCount, totalRevenue] = await Promise.all([
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

          return {
            ...spaceObj,
            stats: {
              activeBookings: activeCount,
              pendingRequests: pendingCount,
              completedBookings: completedCount,
              totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
              availableSpots: Math.max(0, (space.totalSpots || 0) - (space.occupiedSpots || 0)),
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

  /**
   * Update an approved parking space's details
   * Provider can change: pricing, description, opening times, capacity, photos, accepted vehicles
   */
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
        return { success: false, message: 'Parking space not found or you are not the owner' };
      }

      // Apply only provided updates
      if (updates.name !== undefined) space.name = updates.name;
      if (updates.description !== undefined) space.description = updates.description;
      if (updates.hourlyRate !== undefined) space.hourlyRate = updates.hourlyRate;
      if (updates.dailyRate !== undefined) space.dailyRate = updates.dailyRate;
      if (updates.parkingType !== undefined) space.parkingType = updates.parkingType;
      if (updates.bookingMethods !== undefined) space.bookingMethods = updates.bookingMethods;
      if (updates.acceptedVehicles !== undefined) space.acceptedVehicles = updates.acceptedVehicles;
      if (updates.maxStayDetails !== undefined) space.maxStayDetails = updates.maxStayDetails;
      if (updates.openingTimes !== undefined) space.openingTimes = updates.openingTimes;
      if (updates.chargesDescription !== undefined) space.chargesDescription = updates.chargesDescription;
      if (updates.photos !== undefined) space.photos = updates.photos;
      if (updates.cctvPhotos !== undefined) space.cctvPhotos = updates.cctvPhotos;

      // Handle totalSpots change carefully
      if (updates.totalSpots !== undefined) {
        if (updates.totalSpots < space.occupiedSpots) {
          return {
            success: false,
            message: `Cannot reduce capacity below current occupancy (${space.occupiedSpots} spots are currently occupied)`,
          };
        }
        space.totalSpots = updates.totalSpots;
        // Re-evaluate availability
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

  /**
   * Manually toggle a parking space's availability on/off
   * Guards: cannot enable if all spots are occupied
   */
  async toggleSpaceAvailability(userId: string, spaceId: string): Promise<Response> {
    try {
      const space = await this.parkingSpaceModel.findOne({
        _id: spaceId,
        owner: userId,
      });

      if (!space) {
        return { success: false, message: 'Parking space not found or you are not the owner' };
      }

      if (!space.isAvailable) {
        // Trying to re-enable — check capacity first
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
