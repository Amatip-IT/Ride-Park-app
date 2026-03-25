import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../schemas/user.schema';
import { Taxi, TaxiDocument } from '../../schemas/taxi.schema';
import {
  IdentityVerification,
  IdentityVerificationDocument,
} from '../../schemas/identity-verification.schema';
import { DvlaService } from '../services/driver/dvla.service';
import { MotService, VehicleStatus } from '../services/driver/mot.service';
import { FileUploadService } from '../services/file/file-upload.service';
import { ApplyDriverDto } from '../dto/apply-driver.dto';

@Injectable()
export class TaxiVerificationService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Taxi.name)
    private taxiModel: Model<TaxiDocument>,
    @InjectModel(IdentityVerification.name)
    private identityVerificationModel: Model<IdentityVerificationDocument>,
    private dvlaService: DvlaService,
    private motService: MotService,
    private fileUploadService: FileUploadService,
  ) {}

  /**
   * Check vehicle details (before user submits application)
   * This returns DVLA data for user to verify
   */
  async checkVehicleDetails(
    userId: string,
    registrationNumber: string,
  ): Promise<{
    success: boolean;
    message: string;
    vehicleData?: {
      registration: string;
      taxStatus: string;
      motStatus: string;
      motExpiryDate: string | null;
      // Hidden from response (user must confirm these)
      // colour: string;
      // make: string;
      // year: number;
    };
    requiresConfirmation: boolean;
  }> {
    // Check user is identity verified
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isVerified?.identity) {
      throw new ForbiddenException(
        'Please complete identity verification first',
      );
    }

    // Check user verified with driving license
    const identityVerification = await this.identityVerificationModel
      .findOne({ user: userId })
      .sort({ verifiedAt: -1 });

    if (identityVerification?.idType !== 'driving_license') {
      throw new ForbiddenException(
        'You must verify your identity with a UK Driving License to become a driver. Please re-verify with your driving license.',
      );
    }

    // Check if user already has pending/approved application
    const existingApplication = await this.taxiModel.findOne({
      user: userId,
      status: {
        $in: ['pending_auto_check', 'pending_admin_review', 'approved'],
      },
    });

    if (existingApplication) {
      throw new BadRequestException(
        `You already have a driver application with status: ${existingApplication.status}`,
      );
    }

    // Validate registration format
    if (!this.dvlaService.validateRegistrationFormat(registrationNumber)) {
      throw new BadRequestException(
        'Invalid UK vehicle registration format. Example: AB12CDE',
      );
    }

    // Check DVLA
    const dvlaResult = await this.dvlaService.checkVehicle(registrationNumber);

    if (!dvlaResult.data) {
      throw new NotFoundException(
        'Vehicle not found. Please check the registration number.',
      );
    }

    // Check MOT
    const motResult = await this.motService.getMotHistory(registrationNumber);

    return {
      success: true,
      message: 'Vehicle found. Please confirm the details to proceed.',
      vehicleData: {
        registration: dvlaResult.data.registrationNumber,
        taxStatus: dvlaResult.data.taxStatus,
        motStatus: dvlaResult.data.motStatus,
        motExpiryDate: motResult.latestTest?.expiryDate || null,
      },
      requiresConfirmation: true,
    };
  }

  /**
   * Submit driver application with vehicle photos and insurance
   */
  async applyDriver(
    userId: string,
    applyDriverDto: ApplyDriverDto,
    vehiclePhotos: Express.Multer.File[],
    insuranceCertificate: Express.Multer.File,
  ): Promise<{
    success: boolean;
    message: string;
    applicationId: string;
  }> {
    // Validate user
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check for existing application
    const existingApplication = await this.taxiModel.findOne({
      user: userId,
      status: {
        $in: ['pending_admin_review', 'approved'],
      },
    });

    if (existingApplication) {
      if (existingApplication.status === 'approved') {
        throw new BadRequestException(
          'You are already an approved driver. You cannot submit another application.',
        );
      }

      throw new BadRequestException(
        `You already have a driver application with status: ${existingApplication.status}. Please wait for admin review.`,
      );
    }

    // Delete old rejected application (allow resubmission)
    await this.taxiModel.deleteOne({
      user: userId,
      status: 'rejected',
    });

    // Check DVLA data again
    const dvlaResult = await this.dvlaService.checkVehicle(
      applyDriverDto.registrationNumber,
    );

    if (!dvlaResult.success || !dvlaResult.data) {
      throw new BadRequestException(
        'Vehicle verification failed. ' + dvlaResult.message,
      );
    }

    // SMART HYBRID VALIDATION

    // Compare user's answers with DVLA data
    const colourMatch =
      applyDriverDto.vehicleColour.trim().toLowerCase() ===
      dvlaResult.data.colour.trim().toLowerCase();

    const makeMatch =
      applyDriverDto.vehicleMake.trim().toLowerCase() ===
      dvlaResult.data.make.trim().toLowerCase();

    const yearMatch =
      applyDriverDto.vehicleYear === dvlaResult.data.yearOfManufacture;

    if (!colourMatch || !makeMatch || !yearMatch) {
      throw new BadRequestException(
        'Vehicle details do not match. Please check the registration number and try again.',
      );
    }

    // Check legal confirmations
    if (applyDriverDto.hasValidInsurance !== true) {
      throw new BadRequestException(
        'You must confirm you have valid insurance',
      );
    }

    if (applyDriverDto.isRoadworthy !== true) {
      throw new BadRequestException(
        'You must confirm the vehicle is roadworthy',
      );
    }

    if (applyDriverDto.hasPermission !== true) {
      throw new BadRequestException(
        'You must confirm you have permission to use this vehicle',
      );
    }

    // Validate files
    if (!vehiclePhotos || vehiclePhotos.length < 4) {
      throw new BadRequestException(
        'Please upload at least 4 vehicle photos (front, side, rear, interior)',
      );
    }

    if (!insuranceCertificate) {
      throw new BadRequestException('Please upload your insurance certificate');
    }

    // Validate file types
    const imageTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const pdfTypes = ['application/pdf'];

    vehiclePhotos.forEach((photo) => {
      if (!this.fileUploadService.validateFileType(photo, imageTypes)) {
        throw new BadRequestException(
          'Vehicle photos must be JPEG or PNG images',
        );
      }
      if (!this.fileUploadService.validateFileSize(photo, 10)) {
        throw new BadRequestException('Each photo must be less than 10MB');
      }
    });

    if (
      !this.fileUploadService.validateFileType(insuranceCertificate, pdfTypes)
    ) {
      throw new BadRequestException('Insurance certificate must be a PDF file');
    }

    if (!this.fileUploadService.validateFileSize(insuranceCertificate, 10)) {
      throw new BadRequestException(
        'Insurance certificate must be less than 10MB',
      );
    }

    // Check MOT
    const motResult = await this.motService.getMotHistory(
      applyDriverDto.registrationNumber,
    );

    // Build messages array for user/admin
    const motMessages: string[] = [];
    motMessages.push(motResult.message); // Main message

    // Add vehicle status context
    if (motResult.vehicleStatus === VehicleStatus.NEW_VEHICLE) {
      motMessages.push('✅ New vehicle - first MOT not yet required');
    } else if (motResult.vehicleStatus === VehicleStatus.MOT_EXEMPT) {
      motMessages.push('ℹ️ Historic vehicle (40+ years) - MOT exempt');
    } else if (motResult.vehicleStatus === VehicleStatus.REQUIRES_MOT) {
      motMessages.push('📋 Vehicle requires MOT (3-40 years old)');
    }

    // Add specific warnings
    if (motResult.requiresAdminReview) {
      motMessages.push('⚠️ Requires manual admin review');
    }
    if (!motResult.checks.mileageIncreasing) {
      motMessages.push('🚨 Mileage rollback detected - potential fraud');
    }
    if (!motResult.checks.noDangerousDefects) {
      motMessages.push('⚠️ Vehicle has dangerous or major defects');
    }
    if (!motResult.checks.motNotExpired && motResult.checks.requiresMot) {
      motMessages.push('❌ MOT certificate expired - vehicle cannot be driven');
    }
    if (motResult.riskLevel === 'HIGH') {
      motMessages.push('🚨 HIGH RISK - Immediate attention required');
    } else if (motResult.riskLevel === 'MEDIUM') {
      motMessages.push('⚠️ MEDIUM RISK - Review recommended');
    } else if (motResult.riskLevel === 'LOW') {
      motMessages.push('✅ LOW RISK - Vehicle meets requirements');
    }

    // Upload files to S3
    const photoUrls = await this.fileUploadService.uploadMultipleFiles(
      vehiclePhotos,
      `driver-documents/${userId}/photos`,
    );

    const insuranceUrl = await this.fileUploadService.uploadFile(
      insuranceCertificate,
      `driver-documents/${userId}/insurance`,
    );

    // Create driver verification record
    const driverVerification = await this.taxiModel.create({
      user: userId,
      status: 'pending_admin_review',
      isVerified: false,
      isActive: false,
      vehicleInfo: {
        registrationNumber: dvlaResult.data.registrationNumber,
        make: dvlaResult.data.make,
        model: motResult.data?.model || 'Unknown',
        colour: dvlaResult.data.colour,
        year: dvlaResult.data.yearOfManufacture,
        fuelType: dvlaResult.data.fuelType,
      },
      dvlaCheck: {
        passed: dvlaResult.success,
        checkedAt: new Date(),
        data: dvlaResult.data,
      },
      motCheck: {
        passed: motResult.success,
        checkedAt: new Date(),
        data: motResult.data, // Keep full raw data
        analysis: {
          vehicleStatus: motResult.vehicleStatus,
          vehicleAge: motResult.checks.vehicleAge,
          expiryDate: motResult.latestTest?.expiryDate,
          latestMileage: motResult.latestTest
            ? parseInt(motResult.latestTest.odometerValue, 10)
            : null,
          riskLevel: motResult.riskLevel,
          requiresAdminReview: motResult.requiresAdminReview,
          messages: motMessages, // Array of warnings/info
          checks: motResult.checks,
          latestTest: motResult.latestTest
            ? {
                completedDate: motResult.latestTest.completedDate,
                testResult: motResult.latestTest.testResult,
                expiryDate: motResult.latestTest.expiryDate,
                odometerValue: motResult.latestTest.odometerValue,
                motTestNumber: motResult.latestTest.motTestNumber,
                hasDefects: (motResult.latestTest.defects?.length || 0) > 0,
                defectCount: motResult.latestTest.defects?.length || 0,
              }
            : undefined,
          mileageHistory: motResult.mileageHistory,
        },
      },
      documents: {
        vehiclePhotos: photoUrls,
        insuranceCertificate: insuranceUrl,
      },
      appliedAt: new Date(),
    });

    return {
      success: true,
      message:
        'Driver application submitted successfully. Our team will review it shortly.',
      applicationId: driverVerification._id.toString(),
    };
  }

  /**
   * Check driver application status
   */
  async checkDriverStatus(userId: string): Promise<{
    success: boolean;
    hasApplied: boolean;
    isVerified: boolean;
    isActive: boolean;
    status?: string;
    applicationDetails?: {
      vehicleInfo: unknown;
      appliedAt: Date;
      approvedAt?: Date;
      rejectionReason?: string;
    };
  }> {
    const driverVerification = await this.taxiModel
      .findOne({ user: userId })
      .sort({ createdAt: -1 });

    if (!driverVerification) {
      return {
        success: true,
        hasApplied: false,
        isVerified: false,
        isActive: false,
      };
    }

    return {
      success: true,
      hasApplied: true,
      isVerified: driverVerification.isVerified,
      isActive: driverVerification.isActive,
      status: driverVerification.status,
      applicationDetails: {
        vehicleInfo: driverVerification.vehicleInfo,
        appliedAt: driverVerification.createdAt!,
        approvedAt: driverVerification.updatedAt,
        rejectionReason: driverVerification.rejectionReason,
      },
    };
  }

  /**
   * Admin: Approve driver application
   */
  async approveDriver(
    userId: string,
    adminId: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const driverVerification = await this.taxiModel.findOne({
      user: userId,
      status: 'pending_admin_review',
    });

    if (!driverVerification) {
      throw new NotFoundException(
        'No pending driver application found for this user',
      );
    }

    driverVerification.status = 'approved';
    driverVerification.isVerified = true;
    driverVerification.approvedBy = adminId;
    await driverVerification.save();

    return {
      success: true,
      message: 'Driver application approved successfully',
    };
  }

  /**
   * Admin: Reject driver application
   */
  async rejectDriver(
    userId: string,
    adminId: string,
    reason: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const driverVerification = await this.taxiModel.findOne({
      user: userId,
      status: 'pending_admin_review',
    });

    if (!driverVerification) {
      throw new NotFoundException(
        'No pending driver application found for this user',
      );
    }

    driverVerification.status = 'rejected';
    driverVerification.rejectionReason = reason;
    driverVerification.approvedBy = adminId;
    await driverVerification.save();

    return {
      success: true,
      message: 'Driver application rejected',
    };
  }
}
