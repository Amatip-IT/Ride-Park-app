import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ParkingVerification, ParkingVerificationDocument } from 'src/schemas/parking-verification.schema';
import { ParkingSpace, ParkingSpaceDocument } from 'src/schemas/parking-space.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Wallet, WalletDocument } from 'src/schemas/wallet.schema';
import { Transaction, TransactionDocument } from 'src/schemas/transaction.schema';
import { PlatformSettings, PlatformSettingsDocument } from 'src/schemas/platform-settings.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { Response } from 'src/common/interfaces/response.interface';
import { What3WordsService } from 'src/utility/what3words.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { EmailService } from 'src/verification/services/email/email.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditContext } from './admin-audit.types';
import Stripe from 'stripe';

// All valid document field names
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

// Human-readable labels for document fields
const DOC_LABELS: Record<string, string> = {
  natInsuranceUrl: 'National Insurance',
  vatCertUrl: 'VAT Certificate',
  dvlaLicenceUrl: 'DVLA Plastic Driving Licence',
  bankStatementUrl: 'Bank Statement',
  dvlaCheckCodeUrl: 'DVLA Electronic Counterpart Check Code',
  phvDriverLicenceUrl: 'Private Hire Driver Licence (Paper & Badge)',
  profilePhotoUrl: 'Profile Photo',
  phvlUrl: 'Private Hire Vehicle Licence (PHVL)',
  v5cUrl: 'V5C Vehicle Logbook',
  insuranceUrl: 'Insurance Certificate',
  vehicleInspectionUrl: 'UK Vehicle Inspection',
};

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
    @InjectModel(Chauffeur.name) private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    private what3wordsService: What3WordsService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private auditService: AdminAuditService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');
  }

  // ══════════════════════════════════════════════
  // ── Parking Space Verifications ──
  // ══════════════════════════════════════════════

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
  async approveParkingVerification(id: string, customHourlyRate = 5, audit?: AdminAuditContext): Promise<Response> {
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

      // Resolve photos: provider submits as 'parkPhotos' (array) or 'parkPhotoUrl' (legacy single)
      const parkPhotos: string[] = Array.isArray(docs.parkPhotos)
        ? docs.parkPhotos
        : docs.parkPhotoUrl
          ? [docs.parkPhotoUrl]
          : [];
      const cctvPhotos: string[] = Array.isArray(docs.cctvPhotos)
        ? docs.cctvPhotos
        : docs.cctvPhotoUrl
          ? [docs.cctvPhotoUrl]
          : [];

      // 3. Create the official, searchable Parking Space!
      const newSpace = new this.parkingSpaceModel({
        owner: user._id,
        name: parkName,
        description: docs.description || 'Secure parking space approved by Gleezip admins.',
        postCode: verification.postcode || docs.parkPostcode || 'UNKNOWN',
        hourlyRate: parseFloat(docs.hourlyRate) || customHourlyRate,
        dailyRate: docs.dailyRate ? parseFloat(docs.dailyRate) : undefined,
        totalSpots: parseInt(docs.totalSpots) || 1,
        occupiedSpots: 0,
        parkingType: docs.parkingType || 'Short Stay',
        bookingMethods: docs.bookingMethods ? docs.bookingMethods.split(',').map((s: string) => s.trim()) : ['Online / App'],
        acceptedVehicles: docs.acceptedVehicles ? docs.acceptedVehicles.split(',').map((s: string) => s.trim()) : ['Car'],
        maxStayDetails: docs.maxStayDetails || undefined,
        openingTimes: { "Everyday": docs.openingTimes || "24 Hours" },
        chargesDescription: docs.chargesDescription || undefined,
        isAvailable: true,
        isVerified: true,
        photos: parkPhotos,
        cctvPhotos: cctvPhotos,
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

      await this.auditService.log(audit, {
        action: 'approve_parking',
        targetType: 'parking_verification',
        targetId: id,
        newValue: { status: 'approved', parkingSpaceId: newSpace._id.toString() },
      });

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
  async rejectParkingVerification(id: string, reason: string, audit?: AdminAuditContext): Promise<Response> {
    try {
      const verification = await this.parkingVerifModel.findById(id).exec();
      if (!verification) {
        return { success: false, message: 'Verification application not found' };
      }

      verification.status = 'rejected';
      verification.rejectionReason = reason;
      await verification.save();

      // Fetch user and send notifications
      const user = await this.userModel.findById(verification.user).exec();
      if (user) {
        try {
          // Send push notification
          await this.notificationsService.sendNotification(
            user._id.toString(),
            '❌ Parking Verification Rejected',
            `Your parking space verification was not approved. Check your email for details.`,
            'system',
            { verificationId: id, reason }
          );
        } catch (notifErr) {
          this.logger.warn(`Failed to send push notification for parking rejection: ${notifErr}`);
        }

        try {
          // Send email with rejection reason
          const emailHtml = `
            <h2>Parking Space Verification Rejected</h2>
            <p>Hi ${user.firstName},</p>
            <p>Unfortunately, your parking space verification application was not approved.</p>
            <h3>Reason for Rejection:</h3>
            <p><strong>${reason}</strong></p>
            <h3>Next Steps:</h3>
            <ol>
              <li>Review the rejection reason carefully</li>
              <li>Address any issues mentioned</li>
              <li>Resubmit your application with updated information</li>
            </ol>
            <p>If you have any questions, please contact our support team.</p>
            <p>Best regards,<br/>Gleezip Admin Team</p>
          `;

          await this.emailService.sendMail({
            to: user.email,
            subject: `Parking Verification Rejected - Please Resubmit`,
            html: emailHtml,
          });
        } catch (emailErr) {
          this.logger.warn(`Failed to send parking rejection email: ${emailErr}`);
        }
      }

      await this.auditService.log(audit, {
        action: 'reject_parking',
        targetType: 'parking_verification',
        targetId: id,
        newValue: { status: 'rejected', reason },
        reason,
      });

      return {
        success: true,
        data: null,
        message: 'Parking verification rejected. Provider has been notified.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to reject verification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // ══════════════════════════════════════════════
  // ── Driver / Taxi Document Verifications ──
  // ══════════════════════════════════════════════

  /**
   * Get all drivers and taxi drivers with pending verification status
   * Returns combined list from both Chauffeur and Taxi collections
   */
  async getPendingDriverVerifications(): Promise<Response> {
    try {
      // Fetch pending chauffeurs
      const pendingChauffeurs = await this.chauffeurModel
        .find({ status: 'pending_admin_review' })
        .populate('user', 'firstName lastName email phoneNumber role')
        .sort({ updatedAt: -1 })
        .exec();

      // Fetch pending taxis
      const pendingTaxis = await this.taxiModel
        .find({ status: 'pending_admin_review' })
        .populate('user', 'firstName lastName email phoneNumber role')
        .sort({ updatedAt: -1 })
        .exec();

      // Combine and annotate with provider type
      const combined = [
        ...pendingChauffeurs.map(c => {
          const obj = c.toObject();
          return { ...obj, providerType: 'driver' };
        }),
        ...pendingTaxis.map(t => {
          const obj = t.toObject();
          return { ...obj, providerType: 'taxi_driver' };
        }),
      ];

      // Sort by most recently updated
      combined.sort((a: any, b: any) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });

      return {
        success: true,
        data: combined,
        message: `Found ${combined.length} pending driver/taxi verifications`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch driver verifications: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get full detail of a single driver/taxi verification record
   */
  async getDriverVerificationDetail(recordId: string, providerType: string): Promise<Response> {
    try {
      let record: any = null;

      if (providerType === 'driver') {
        record = await this.chauffeurModel
          .findById(recordId)
          .populate('user', 'firstName lastName email phoneNumber role')
          .exec();
      } else {
        record = await this.taxiModel
          .findById(recordId)
          .populate('user', 'firstName lastName email phoneNumber role')
          .exec();
      }

      if (!record) {
        return { success: false, message: 'Verification record not found' };
      }

      // Build a structured document list for the admin UI
      const documentsList = VALID_DOC_FIELDS.map(field => ({
        field,
        label: DOC_LABELS[field] || field,
        url: record[field] || null,
        status: record.documentStatuses?.[field] || (record[field] ? 'uploaded' : 'not_submitted'),
      }));

      return {
        success: true,
        data: {
          ...record.toObject(),
          providerType,
          documentsList,
        },
        message: 'Verification detail retrieved',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch detail: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Approve a driver/taxi verification — sets status to 'approved' and isVerified to true
   */
  async approveDriverVerification(
    recordId: string,
    providerType: string,
    adminUserId?: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      let record: any = null;

      if (providerType === 'driver') {
        record = await this.chauffeurModel.findById(recordId).exec();
      } else {
        record = await this.taxiModel.findById(recordId).exec();
      }

      if (!record) {
        return { success: false, message: 'Verification record not found' };
      }

      if (record.status === 'approved') {
        return { success: false, message: 'This provider is already approved' };
      }

      // Set status and isVerified
      record.status = 'approved';
      record.isVerified = true;
      record.isActive = true;
      if (adminUserId) record.approvedBy = adminUserId;

      // Mark all uploaded documents as verified
      if (record.documentStatuses) {
        for (const field of VALID_DOC_FIELDS) {
          if (record[field] && record.documentStatuses[field]) {
            record.documentStatuses[field] = 'verified';
          }
        }
        record.markModified('documentStatuses');
      }

      await record.save();

      await this.auditService.log(audit, {
        action: 'approve_driver',
        targetType: 'driver_verification',
        targetId: recordId,
        oldValue: { status: 'pending_admin_review' },
        newValue: { status: 'approved', providerType },
      });

      // Get user info for the response
      const user = await this.userModel.findById(record.user).exec();

      return {
        success: true,
        data: {
          recordId: record._id,
          status: record.status,
          isVerified: record.isVerified,
        },
        message: `${providerType === 'driver' ? 'Driver' : 'Taxi driver'} ${user?.firstName || ''} ${user?.lastName || ''} has been approved and can now accept rides.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to approve verification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Reject a driver/taxi verification
   */
  async rejectDriverVerification(
    recordId: string,
    providerType: string,
    reason: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      let record: any = null;

      if (providerType === 'driver') {
        record = await this.chauffeurModel.findById(recordId).exec();
      } else {
        record = await this.taxiModel.findById(recordId).exec();
      }

      if (!record) {
        return { success: false, message: 'Verification record not found' };
      }

      const previousStatus = record.status;
      record.status = 'rejected';
      record.isVerified = false;
      record.rejectionReason = reason;

      // Mark all document statuses as rejected
      if (record.documentStatuses) {
        for (const field of VALID_DOC_FIELDS) {
          if (record[field] && record.documentStatuses[field]) {
            record.documentStatuses[field] = 'rejected';
          }
        }
        record.markModified('documentStatuses');
      }

      await record.save();

      // Fetch user and send notifications
      const user = await this.userModel.findById(record.user).exec();
      if (user) {
        try {
          // Send push notification
          await this.notificationsService.sendNotification(
            user._id.toString(),
            '❌ Verification Rejected',
            `Your ${providerType === 'taxi_driver' ? 'taxi driver' : 'driver'} verification was not approved. Check your email for details.`,
            'system',
            { recordId, reason }
          );
        } catch (notifErr) {
          this.logger.warn(`Failed to send push notification for rejection: ${notifErr}`);
        }

        try {
          // Send email with rejection reason and next steps
          const roleLabel = providerType === 'taxi_driver' ? 'Taxi Driver' : 'Private Driver';
          const emailHtml = `
            <h2>Verification Rejected</h2>
            <p>Hi ${user.firstName},</p>
            <p>Unfortunately, your ${roleLabel} verification application was not approved.</p>
            <h3>Reason for Rejection:</h3>
            <p><strong>${reason}</strong></p>
            <h3>Next Steps:</h3>
            <ol>
              <li>Review the rejection reason carefully</li>
              <li>Gather the correct or updated documents</li>
              <li>Resubmit your application through the app</li>
            </ol>
            <p>If you have any questions, please contact our support team.</p>
            <p>Best regards,<br/>Gleezip Admin Team</p>
          `;

          await this.emailService.sendMail({
            to: user.email,
            subject: `Verification Rejected - Action Required`,
            html: emailHtml,
          });
        } catch (emailErr) {
          this.logger.warn(`Failed to send rejection email: ${emailErr}`);
        }
      }

      if (audit) {
        await this.auditService.log(audit, {
          action: 'reject_driver',
          targetType: providerType === 'driver' ? 'chauffeur' : 'taxi',
          targetId: recordId,
          oldValue: { status: previousStatus },
          newValue: { status: 'rejected', reason },
          reason,
        });
      }

      return {
        success: true,
        data: null,
        message: `Verification rejected. Driver has been notified.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to reject verification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // ══════════════════════════════════════════════
  // ── Per-Document Approval/Rejection ──
  // ══════════════════════════════════════════════

  /**
   * Approve a single document field for a driver/taxi
   */
  async approveDocumentField(
    recordId: string,
    providerType: string,
    docField: string,
    adminUserId?: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      if (!VALID_DOC_FIELDS.includes(docField as any)) {
        return { success: false, message: `Invalid document field: ${docField}` };
      }

      let record: any = null;

      if (providerType === 'driver') {
        record = await this.chauffeurModel.findById(recordId).exec();
      } else if (providerType === 'taxi_driver') {
        record = await this.taxiModel.findById(recordId).exec();
      }

      if (!record) {
        return { success: false, message: 'Verification record not found' };
      }

      if (!record[docField]) {
        return { success: false, message: `No document uploaded for ${docField}` };
      }

      // Update document status
      if (!record.documentStatuses) {
        record.documentStatuses = {};
      }

      record.documentStatuses[docField] = {
        status: 'verified',
        reviewedAt: new Date(),
        reviewedBy: adminUserId,
      };

      record.markModified('documentStatuses');
      await record.save();

      // Check if ALL documents are now verified
      const allVerified = VALID_DOC_FIELDS.every(field => {
        return !record[field] || record.documentStatuses?.[field]?.status === 'verified';
      });

      if (allVerified) {
        // Auto-approve overall status
        record.status = 'approved';
        record.isVerified = true;
        record.isActive = true;
        if (adminUserId) record.approvedBy = adminUserId;
        await record.save();
      }

      await this.auditService.log(audit, {
        action: 'approve_document',
        targetType: providerType === 'driver' ? 'chauffeur' : 'taxi',
        targetId: recordId,
        newValue: { docField, status: 'verified', allDocsVerified: allVerified },
      });

      return {
        success: true,
        data: { docField, status: 'verified', allDocsVerified: allVerified },
        message: `Document ${docField} approved.${allVerified ? ' All documents verified - driver approved!' : ''}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to approve document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Reject a single document field for a driver/taxi
   */
  async rejectDocumentField(
    recordId: string,
    providerType: string,
    docField: string,
    reason: string,
    adminUserId?: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      if (!VALID_DOC_FIELDS.includes(docField as any)) {
        return { success: false, message: `Invalid document field: ${docField}` };
      }

      if (!reason?.trim()) {
        return { success: false, message: 'Rejection reason is required' };
      }

      let record: any = null;

      if (providerType === 'driver') {
        record = await this.chauffeurModel.findById(recordId).exec();
      } else if (providerType === 'taxi_driver') {
        record = await this.taxiModel.findById(recordId).exec();
      }

      if (!record) {
        return { success: false, message: 'Verification record not found' };
      }

      if (!record[docField]) {
        return { success: false, message: `No document uploaded for ${docField}` };
      }

      // Update document status
      if (!record.documentStatuses) {
        record.documentStatuses = {};
      }

      record.documentStatuses[docField] = {
        status: 'rejected',
        rejectionReason: reason,
        reviewedAt: new Date(),
        reviewedBy: adminUserId,
      };

      record.markModified('documentStatuses');
      await record.save();

      // Fetch user and send notification
      const user = await this.userModel.findById(record.user).exec();
      if (user) {
        try {
          const docLabel = DOC_LABELS[docField as keyof typeof DOC_LABELS] || docField;
          await this.notificationsService.sendNotification(
            user._id.toString(),
            '❌ Document Rejected',
            `Your ${docLabel} document was rejected. Please resubmit.`,
            'system',
            { docField, reason }
          );
        } catch (notifErr) {
          this.logger.warn(`Failed to send document rejection notification: ${notifErr}`);
        }

        try {
          const docLabel = DOC_LABELS[docField as keyof typeof DOC_LABELS] || docField;
          const emailHtml = `
            <h2>Document Rejected</h2>
            <p>Hi ${user.firstName},</p>
            <p>Your document "<strong>${docLabel}</strong>" was rejected and needs to be resubmitted.</p>
            <h3>Reason:</h3>
            <p><strong>${reason}</strong></p>
            <h3>What to do:</h3>
            <ol>
              <li>Review the rejection reason above</li>
              <li>Gather a new or updated document</li>
              <li>Resubmit through the verification section in the app</li>
            </ol>
            <p>Best regards,<br/>Gleezip Admin Team</p>
          `;

          await this.emailService.sendMail({
            to: user.email,
            subject: `Document Rejected: ${docLabel}`,
            html: emailHtml,
          });
        } catch (emailErr) {
          this.logger.warn(`Failed to send document rejection email: ${emailErr}`);
        }
      }

      await this.auditService.log(audit, {
        action: 'reject_document',
        targetType: providerType === 'driver' ? 'chauffeur' : 'taxi',
        targetId: recordId,
        newValue: { docField, status: 'rejected', reason },
        reason,
      });

      return {
        success: true,
        data: { docField, status: 'rejected', reason },
        message: `Document ${docField} rejected. Driver has been notified.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to reject document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // ══════════════════════════════════════════════
  // ── Provider Identity Verifications ──
  // ══════════════════════════════════════════════

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
  async approveIdentityVerification(userId: string, audit?: AdminAuditContext): Promise<Response> {
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

      await this.auditService.log(audit, {
        action: 'approve_identity',
        targetType: 'user',
        targetId: userId,
        newValue: { identityStatus: 'verified' },
      });

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
  async rejectIdentityVerification(userId: string, reason: string, audit?: AdminAuditContext): Promise<Response> {
    try {
      const user = await this.userModel.findById(userId).exec();

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      (user as any).identityStatus = 'rejected';
      await user.save();

      try {
        // Send push notification
        await this.notificationsService.sendNotification(
          userId,
          '❌ Identity Verification Rejected',
          `Your identity verification was not approved. Check your email for details.`,
          'system',
          { reason }
        );
      } catch (notifErr) {
        this.logger.warn(`Failed to send push notification for identity rejection: ${notifErr}`);
      }

      try {
        // Send email with rejection reason
        const emailHtml = `
          <h2>Identity Verification Rejected</h2>
          <p>Hi ${user.firstName},</p>
          <p>Unfortunately, your identity verification was not approved.</p>
          <h3>Reason for Rejection:</h3>
          <p><strong>${reason}</strong></p>
          <h3>Next Steps:</h3>
          <ol>
            <li>Review the rejection reason carefully</li>
            <li>Ensure your documents are clear and valid</li>
            <li>Resubmit your identity verification through the app</li>
          </ol>
          <p>If you have any questions, please contact our support team.</p>
          <p>Best regards,<br/>Gleezip Admin Team</p>
        `;

        await this.emailService.sendMail({
          to: user.email,
          subject: `Identity Verification Rejected - Please Resubmit`,
          html: emailHtml,
        });
      } catch (emailErr) {
        this.logger.warn(`Failed to send identity rejection email: ${emailErr}`);
      }

      await this.auditService.log(audit, {
        action: 'reject_identity',
        targetType: 'user',
        targetId: userId,
        newValue: { identityStatus: 'rejected', reason },
        reason,
      });

      return {
        success: true,
        data: null,
        message: `Identity verification rejected for ${user.firstName} ${user.lastName}. User has been notified.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to reject identity: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // ══════════════════════════════════════════════
  // ── Platform Settings ──
  // ══════════════════════════════════════════════

  async getPlatformSettings(): Promise<Response> {
    let settings = await this.platformSettingsModel.findOne();
    if (!settings) {
      settings = await this.platformSettingsModel.create({ platformFeePercentage: 10 });
    }
    return { success: true, data: settings, message: 'Settings retrieved' };
  }

  async updatePlatformFee(percentage: number, audit?: AdminAuditContext): Promise<Response> {
    let settings = await this.platformSettingsModel.findOne();
    const oldPercentage = settings?.platformFeePercentage;
    if (!settings) {
      settings = new this.platformSettingsModel({ platformFeePercentage: percentage });
    } else {
      settings.platformFeePercentage = percentage;
    }
    await settings.save();

    await this.auditService.log(audit, {
      action: 'update_platform_fee',
      targetType: 'platform_settings',
      oldValue: { platformFeePercentage: oldPercentage ?? null },
      newValue: { platformFeePercentage: percentage },
    });

    return { success: true, data: settings, message: `Platform fee updated to ${percentage}%` };
  }

  // ══════════════════════════════════════════════
  // ── Payouts (Withdrawals) ──
  // ══════════════════════════════════════════════

  async getPendingWithdrawals(): Promise<Response> {
    const pending = await this.transactionModel
      .find({ type: 'withdrawal', status: 'pending' })
      .populate('providerId', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .exec();
    return { success: true, data: pending, message: 'Pending withdrawals retrieved' };
  }

  async approveWithdrawal(transactionId: string, audit?: AdminAuditContext): Promise<Response> {
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

      if (wallet.stripeConnectStatus !== 'active') {
        const account = await this.stripe.accounts.retrieve(wallet.stripeConnectId);
        if (!account.payouts_enabled) {
          return {
            success: false,
            message:
              'Provider Stripe Connect account cannot receive payouts yet. They must complete verification.',
          };
        }
      }

      const amountInPence = Math.round(transaction.amount * 100);
      const transfer = await this.stripe.transfers.create({
        amount: amountInPence,
        currency: 'gbp',
        destination: wallet.stripeConnectId,
        description: `Payout for ${transactionId}`,
        metadata: {
          transactionId: transactionId.toString(),
          providerId: transaction.providerId.toString(),
        },
      });

      transaction.status = 'completed';
      transaction.referenceId = transfer.id;
      await transaction.save();

      await this.auditService.log(audit, {
        action: 'approve_withdrawal',
        targetType: 'transaction',
        targetId: transactionId,
        newValue: { status: 'completed', stripeTransferId: transfer.id },
      });

      return { success: true, data: transaction, message: 'Withdrawal approved and funds transferred' };
    } catch (e: any) {
      this.logger.error(`Stripe Transfer Failed: ${e.message}`);
      return { success: false, message: `Stripe Transfer Failed: ${e.message}` };
    }
  }

  async rejectWithdrawal(transactionId: string, reason: string, audit?: AdminAuditContext): Promise<Response> {
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

      await this.auditService.log(audit, {
        action: 'reject_withdrawal',
        targetType: 'transaction',
        targetId: transactionId,
        newValue: { status: 'rejected', reason },
        reason,
      });

      return { success: true, data: transaction, message: 'Withdrawal rejected and funds refunded to provider' };
    } catch (error) {
      return { success: false, message: `Failed to reject withdrawal: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  // ══════════════════════════════════════════════
  // ── User Account Management (Suspend/Ban) ──
  // ══════════════════════════════════════════════

  /**
   * Temporarily suspend a user account
   */
  async suspendUser(
    userId: string,
    reason: string,
    durationDays?: number,
    adminUserId?: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      if (adminUserId && userId === adminUserId) {
        return { success: false, message: 'You cannot suspend your own account' };
      }

      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (user.role === 'admin') {
        return { success: false, message: 'Admin accounts cannot be suspended through this endpoint' };
      }

      const suspensionEndDate = durationDays
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
        : undefined;

      user.accountStatus = 'suspended';
      user.suspensionReason = reason;
      user.suspensionEndDate = suspensionEndDate;
      user.suspendedBy = adminUserId;
      user.suspendedAt = new Date();
      await user.save();

      // Send notification
      try {
        const subject = durationDays
          ? `Your account has been suspended for ${durationDays} days`
          : 'Your account has been suspended';

        await this.notificationsService.sendNotification(
          userId,
          '⚠️ Account Suspended',
          `Your account has been suspended. Reason: ${reason}`,
          'system'
        );
      } catch (notifErr) {
        this.logger.warn(`Failed to send suspension notification: ${notifErr}`);
      }

      await this.auditService.log(audit, {
        action: 'suspend_user',
        targetType: 'user',
        targetId: userId,
        newValue: { accountStatus: 'suspended', reason, durationDays, suspensionEndDate },
        reason,
      });

      return {
        success: true,
        data: { userId, status: 'suspended', suspensionEndDate },
        message: `User suspended${durationDays ? ` for ${durationDays} days` : ''}.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to suspend user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Unsuspend a user account
   */
  async unsuspendUser(userId: string, audit?: AdminAuditContext): Promise<Response> {
    try {
      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      user.accountStatus = 'active';
      user.suspensionReason = undefined;
      user.suspensionEndDate = undefined;
      await user.save();

      // Send notification
      try {
        await this.notificationsService.sendNotification(
          userId,
          '✅ Account Restored',
          'Your account suspension has been lifted. Welcome back!',
          'system'
        );
      } catch (notifErr) {
        this.logger.warn(`Failed to send unsuspend notification: ${notifErr}`);
      }

      await this.auditService.log(audit, {
        action: 'unsuspend_user',
        targetType: 'user',
        targetId: userId,
        newValue: { accountStatus: 'active' },
      });

      return {
        success: true,
        message: 'User account restored to active status.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to unsuspend user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Permanently ban a user account
   */
  async banUser(
    userId: string,
    reason: string,
    adminUserId?: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      if (adminUserId && userId === adminUserId) {
        return { success: false, message: 'You cannot ban your own account' };
      }

      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (user.role === 'admin') {
        return { success: false, message: 'Admin accounts cannot be banned through this endpoint' };
      }

      user.accountStatus = 'banned';
      user.suspensionReason = reason;
      user.suspendedBy = adminUserId;
      user.suspendedAt = new Date();
      await user.save();

      // Send notification
      try {
        await this.notificationsService.sendNotification(
          userId,
          '🚫 Account Banned',
          `Your account has been permanently banned. Reason: ${reason}`,
          'system'
        );
      } catch (notifErr) {
        this.logger.warn(`Failed to send ban notification: ${notifErr}`);
      }

      await this.auditService.log(audit, {
        action: 'ban_user',
        targetType: 'user',
        targetId: userId,
        newValue: { accountStatus: 'banned', reason },
        reason,
      });

      return {
        success: true,
        data: { userId, status: 'banned' },
        message: 'User account has been permanently banned.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to ban user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // ══════════════════════════════════════════════
  // ── Document Expiry Management ──
  // ══════════════════════════════════════════════

  /**
   * Get drivers with expiring or expired documents
   */
  async getExpiringDocuments(alertLevel?: 'all' | '30_day' | '7_day' | 'expired'): Promise<Response> {
    try {
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const expiringChauffeurs: any[] = [];
      const expiringTaxis: any[] = [];

      // Check Chauffeur documents
      const chauffeurs = await this.chauffeurModel
        .find({ isActive: true, status: 'approved' })
        .populate('user', 'firstName lastName email')
        .exec();

      for (const chauffeur of chauffeurs) {
        const expiringDocs = this.getExpiringDocsForDriver(
          chauffeur.documentExpiries || {},
          now,
          thirtyDaysFromNow,
          sevenDaysFromNow,
          alertLevel
        );

        if (expiringDocs.length > 0) {
          expiringChauffeurs.push({
            _id: chauffeur._id,
            providerType: 'driver',
            user: chauffeur.user,
            expiringDocuments: expiringDocs,
            canAcceptRides: chauffeur.canAcceptRides,
          });
        }
      }

      // Check Taxi documents
      const taxis = await this.taxiModel
        .find({ isActive: true, status: 'approved' })
        .populate('user', 'firstName lastName email')
        .exec();

      for (const taxi of taxis) {
        const expiringDocs = this.getExpiringDocsForDriver(
          taxi.documentExpiries || {},
          now,
          thirtyDaysFromNow,
          sevenDaysFromNow,
          alertLevel
        );

        if (expiringDocs.length > 0) {
          expiringTaxis.push({
            _id: taxi._id,
            providerType: 'taxi_driver',
            user: taxi.user,
            expiringDocuments: expiringDocs,
            canAcceptRides: taxi.canAcceptRides,
          });
        }
      }

      const allExpiring = [...expiringChauffeurs, ...expiringTaxis];

      return {
        success: true,
        data: {
          total: allExpiring.length,
          chauffeurs: expiringChauffeurs,
          taxis: expiringTaxis,
          all: allExpiring,
        },
        message: `Found ${allExpiring.length} drivers with expiring documents`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch expiring documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Helper: Extract expiring documents based on alert level
   */
  private getExpiringDocsForDriver(
    documentExpiries: Record<string, any>,
    now: Date,
    thirtyDaysFromNow: Date,
    sevenDaysFromNow: Date,
    alertLevel?: string
  ): Array<{ docField: string; expiryDate: Date; daysRemaining: number; alertLevel: string }> {
    const expiring: Array<{
      docField: string;
      expiryDate: Date;
      daysRemaining: number;
      alertLevel: string;
    }> = [];

    for (const [docField, expiry] of Object.entries(documentExpiries)) {
      if (!expiry || !expiry.expiryDate) continue;

      const expiryDate = new Date(expiry.expiryDate);
      const daysRemaining = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let level = '';
      if (daysRemaining < 0) {
        level = 'expired';
      } else if (daysRemaining <= 7) {
        level = '7_day';
      } else if (daysRemaining <= 30) {
        level = '30_day';
      } else {
        continue; // Not expiring soon
      }

      // Filter by alert level if specified
      if (alertLevel && alertLevel !== 'all' && level !== alertLevel) {
        continue;
      }

      expiring.push({
        docField,
        expiryDate,
        daysRemaining,
        alertLevel: level,
      });
    }

    return expiring;
  }

  /**
   * Manually approve document renewal
   */
  async renewDocument(
    recordId: string,
    providerType: string,
    docField: string,
    newExpiryDate: Date,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    try {
      let record: any = null;

      if (providerType === 'driver') {
        record = await this.chauffeurModel.findById(recordId).exec();
      } else if (providerType === 'taxi_driver') {
        record = await this.taxiModel.findById(recordId).exec();
      }

      if (!record) {
        return { success: false, message: 'Driver record not found' };
      }

      if (!record.documentExpiries) {
        record.documentExpiries = {};
      }

      // Update expiry date and reset notification level
      record.documentExpiries[docField] = {
        expiryDate: newExpiryDate,
        renewalNotificationSent: undefined,
        renewalReminderLevel: undefined,
      };

      // Re-enable rides if all docs are now valid
      const allDocsValid = Object.values(record.documentExpiries).every(
        (doc: any) => !doc.expiryDate || new Date(doc.expiryDate) > new Date()
      );
      if (allDocsValid) {
        record.canAcceptRides = true;
      }

      record.markModified('documentExpiries');
      await record.save();

      // Notify user
      const user = await this.userModel.findById(record.user).exec();
      if (user) {
        try {
          await this.notificationsService.sendNotification(
            user._id.toString(),
            '✅ Document Renewed',
            `Your ${docField} has been approved for renewal. New expiry date: ${newExpiryDate.toLocaleDateString()}`,
            'system'
          );
        } catch (notifErr) {
          this.logger.warn(`Failed to send renewal notification: ${notifErr}`);
        }
      }

      await this.auditService.log(audit, {
        action: 'renew_document',
        targetType: providerType === 'driver' ? 'chauffeur' : 'taxi',
        targetId: recordId,
        newValue: { docField, newExpiryDate: newExpiryDate.toISOString() },
      });

      return {
        success: true,
        data: { docField, newExpiryDate },
        message: `Document ${docField} renewed successfully.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to renew document: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Unban a user account
   */
  async unbanUser(userId: string, audit?: AdminAuditContext): Promise<Response> {
    try {
      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      if (user.accountStatus !== 'banned') {
        return { success: false, message: 'User is not banned' };
      }

      user.accountStatus = 'active';
      user.suspensionReason = undefined;
      user.suspendedBy = undefined;
      user.suspendedAt = undefined;
      await user.save();

      // Send notification
      try {
        await this.notificationsService.sendNotification(
          userId,
          '✅ Ban Lifted',
          'Your account ban has been lifted. You may now use the platform again.',
          'system'
        );
      } catch (notifErr) {
        this.logger.warn(`Failed to send unban notification: ${notifErr}`);
      }

      await this.auditService.log(audit, {
        action: 'unban_user',
        targetType: 'user',
        targetId: userId,
        newValue: { accountStatus: 'active' },
      });

      return {
        success: true,
        message: 'User ban has been lifted and account is now active.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to unban user: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // ══════════════════════════════════════════════
  // ── Phase 2: Search, Bulk Ops ──
  // ══════════════════════════════════════════════

  async searchDriverVerifications(filters: {
    q?: string;
    status?: string;
    providerType?: string;
    days?: number;
    sort?: string;
  }): Promise<Response> {
    try {
      const statusFilter = filters.status || 'pending_admin_review';
      const statuses =
        statusFilter === 'all'
          ? ['pending_admin_review', 'approved', 'rejected', 'pending_auto_check']
          : [statusFilter];

      const dateCutoff = filters.days
        ? new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000)
        : null;

      const fetchCollection = async (model: Model<any>, providerType: string) => {
        if (filters.providerType && filters.providerType !== providerType) {
          return [];
        }

        const query: Record<string, unknown> = { status: { $in: statuses } };
        if (dateCutoff) {
          query.createdAt = { $gte: dateCutoff };
        }

        const records = await model
          .find(query)
          .populate('user', 'firstName lastName email phoneNumber role')
          .exec();

        return records.map((record) => {
          const obj = record.toObject();
          return { ...obj, providerType };
        });
      };

      let combined: any[] = [
        ...(await fetchCollection(this.chauffeurModel, 'driver')),
        ...(await fetchCollection(this.taxiModel, 'taxi_driver')),
      ];

      if (filters.q?.trim()) {
        const q = filters.q.trim().toLowerCase();
        combined = combined.filter((item) => {
          const user = item.user || {};
          const searchText = [
            user.firstName,
            user.lastName,
            user.email,
            user.phoneNumber,
            item.driverNumber,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return searchText.includes(q);
        });
      }

      const sort = filters.sort || 'newest';
      const docCompleteness = (item: any) =>
        VALID_DOC_FIELDS.filter((field) => item[field]).length / VALID_DOC_FIELDS.length;

      combined.sort((a, b) => {
        if (sort === 'name') {
          const nameA = `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim().toLowerCase();
          const nameB = `${b.user?.firstName || ''} ${b.user?.lastName || ''}`.trim().toLowerCase();
          return nameA.localeCompare(nameB);
        }
        if (sort === 'oldest') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sort === 'completeness') {
          return docCompleteness(b) - docCompleteness(a);
        }
        if (sort === 'waiting') {
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        }
        return (
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
        );
      });

      return {
        success: true,
        data: combined,
        message: `Found ${combined.length} driver verification record(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async bulkApproveDrivers(
    items: Array<{ recordId: string; providerType: string }>,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    const results: Array<{ recordId: string; success: boolean; message?: string }> = [];

    for (const item of items) {
      const result = await this.approveDriverVerification(
        item.recordId,
        item.providerType,
        audit?.adminId,
      );
      results.push({
        recordId: item.recordId,
        success: result.success,
        message: result.message,
      });
    }

    const successCount = results.filter((result) => result.success).length;

    await this.auditService.log(audit, {
      action: 'bulk_approve_drivers',
      targetType: 'driver_verification',
      newValue: {
        count: successCount,
        total: items.length,
        recordIds: items.map((item) => item.recordId),
      },
    });

    return {
      success: true,
      data: { results, successCount, failedCount: items.length - successCount },
      message: `Bulk approved ${successCount} of ${items.length} driver(s)`,
    };
  }

  async bulkRejectDrivers(
    items: Array<{ recordId: string; providerType: string }>,
    reason: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    const results: Array<{ recordId: string; success: boolean; message?: string }> = [];

    for (const item of items) {
      const result = await this.rejectDriverVerification(
        item.recordId,
        item.providerType,
        reason,
      );
      results.push({
        recordId: item.recordId,
        success: result.success,
        message: result.message,
      });
    }

    const successCount = results.filter((result) => result.success).length;

    await this.auditService.log(audit, {
      action: 'bulk_reject_drivers',
      targetType: 'driver_verification',
      newValue: {
        count: successCount,
        total: items.length,
        reason,
        recordIds: items.map((item) => item.recordId),
      },
      reason,
    });

    return {
      success: true,
      data: { results, successCount, failedCount: items.length - successCount },
      message: `Bulk rejected ${successCount} of ${items.length} driver(s)`,
    };
  }

  async bulkMessageDrivers(
    items: Array<{ recordId: string; providerType: string }>,
    message: string,
    audit?: AdminAuditContext,
  ): Promise<Response> {
    const results: Array<{ recordId: string; success: boolean; message?: string }> = [];

    for (const item of items) {
      try {
        let record: any = null;
        if (item.providerType === 'driver') {
          record = await this.chauffeurModel.findById(item.recordId).exec();
        } else {
          record = await this.taxiModel.findById(item.recordId).exec();
        }
        if (!record) {
          results.push({ recordId: item.recordId, success: false, message: 'Record not found' });
          continue;
        }

        const user = await this.userModel.findById(record.user).exec();
        if (!user) {
          results.push({ recordId: item.recordId, success: false, message: 'User not found' });
          continue;
        }

        await this.notificationsService.sendNotification(
          user._id.toString(),
          'Message from Gleezip Admin',
          message,
          'system',
        );

        try {
          await this.emailService.sendMail({
            to: user.email,
            subject: 'Message from Gleezip Admin',
            html: `<p>Hi ${user.firstName},</p><p>${message}</p><p>Best regards,<br/>Gleezip Admin Team</p>`,
          });
        } catch (emailErr) {
          this.logger.warn(`Failed to send bulk message email: ${emailErr}`);
        }

        results.push({ recordId: item.recordId, success: true });
      } catch (error) {
        results.push({
          recordId: item.recordId,
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((result) => result.success).length;

    await this.auditService.log(audit, {
      action: 'bulk_message_drivers',
      targetType: 'driver_verification',
      notes: message,
      newValue: {
        count: successCount,
        total: items.length,
        recordIds: items.map((item) => item.recordId),
      },
    });

    return {
      success: true,
      data: { results, successCount, failedCount: items.length - successCount },
      message: `Message sent to ${successCount} of ${items.length} driver(s)`,
    };
  }
}

