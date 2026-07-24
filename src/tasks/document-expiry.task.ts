import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Chauffeur, ChauffeurDocument } from '../schemas/chauffeur.schema';
import { Taxi, TaxiDocument } from '../schemas/taxi.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';

// Default expiry durations by document type (in days)
const DEFAULT_EXPIRY_DAYS: Record<string, number> = {
  dvlaLicenceUrl: 365 * 10, // 10 years
  insuranceUrl: 365, // 1 year
  bankStatementUrl: 90, // 3 months
  phvDriverLicenceUrl: 365 * 3, // 3 years
  profilePhotoUrl: 365 * 2, // 2 years
  phvlUrl: 365 * 3, // 3 years
  v5cUrl: 365, // 1 year
  vehicleInspectionUrl: 365, // 1 year
  natInsuranceUrl: 365, // 1 year
  vatCertUrl: 365, // 1 year
  dvlaCheckCodeUrl: 365, // 1 year
};

@Injectable()
export class DocumentExpiryTask {
  private readonly logger = new Logger(DocumentExpiryTask.name);

  constructor(
    @InjectModel(Chauffeur.name)
    private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Run daily at 2 AM to check for expiring documents
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDocumentExpiry() {
    this.logger.log('Starting document expiry check task...');

    try {
      // Check Chauffeur documents
      await this.checkChauffeurDocuments();

      // Check Taxi documents
      await this.checkTaxiDocuments();

      this.logger.log('Document expiry check completed successfully');
    } catch (error) {
      this.logger.error(
        `Document expiry check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async checkChauffeurDocuments() {
    const chauffeurs = await this.chauffeurModel
      .find({ isActive: true, status: 'approved' })
      .populate('user')
      .exec();

    for (const chauffeur of chauffeurs) {
      await this.processDriverDocuments(chauffeur, 'chauffeur');
    }
  }

  private async checkTaxiDocuments() {
    const taxis = await this.taxiModel
      .find({ isActive: true, status: 'approved' })
      .populate('user')
      .exec();

    for (const taxi of taxis) {
      await this.processDriverDocuments(taxi, 'taxi');
    }
  }

  private async processDriverDocuments(
    driver: any,
    type: 'chauffeur' | 'taxi',
  ) {
    const now = new Date();
    let hasExpiredDocs = false;

    // Initialize documentExpiries if not exists
    if (!driver.documentExpiries) {
      driver.documentExpiries = {};
    }

    // Check each document field
    for (const [docField, expiryData] of Object.entries(
      driver.documentExpiries,
    )) {
      const expiry = expiryData as any;
      if (!expiry.expiryDate) continue;

      const expiryDate = new Date(expiry.expiryDate);
      const daysUntilExpiry = Math.floor(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Document already expired
      if (daysUntilExpiry < 0) {
        if (expiry.renewalReminderLevel !== 'expired') {
          await this.handleExpiredDocument(driver, docField, type);
          hasExpiredDocs = true;
        }
      }
      // 7 days until expiry (URGENT)
      else if (
        daysUntilExpiry <= 7 &&
        expiry.renewalReminderLevel !== '7_day'
      ) {
        await this.sendExpiryNotification(driver, docField, 7, type);
        expiry.renewalReminderLevel = '7_day';
        expiry.renewalNotificationSent = now;
      }
      // 30 days until expiry
      else if (
        daysUntilExpiry <= 30 &&
        expiry.renewalReminderLevel !== '30_day' &&
        expiry.renewalReminderLevel !== '7_day'
      ) {
        await this.sendExpiryNotification(driver, docField, 30, type);
        expiry.renewalReminderLevel = '30_day';
        expiry.renewalNotificationSent = now;
      }
    }

    // Update canAcceptRides flag if any doc is expired
    if (hasExpiredDocs) {
      driver.canAcceptRides = false;
    }

    driver.markModified('documentExpiries');
    await driver.save();
  }

  private async handleExpiredDocument(
    driver: any,
    docField: string,
    type: string,
  ) {
    this.logger.warn(`Document ${docField} expired for ${type} ${driver._id}`);

    // Update reminder level
    driver.documentExpiries[docField].renewalReminderLevel = 'expired';
    driver.documentExpiries[docField].renewalNotificationSent = new Date();

    // Disable driver from accepting rides
    driver.canAcceptRides = false;

    // Notify driver
    const user =
      driver.user || (await this.userModel.findById(driver.user).exec());
    if (user) {
      try {
        await this.notificationsService.sendNotification(
          user._id.toString(),
          '⚠️ Document Expired',
          `Your ${docField} document has expired. You can no longer accept rides until you renew it.`,
          'system',
          { docField },
        );
      } catch (err) {
        this.logger.warn(`Failed to send expiry notification: ${err}`);
      }
    }
  }

  private async sendExpiryNotification(
    driver: any,
    docField: string,
    daysRemaining: number,
    type: string,
  ) {
    const user =
      driver.user || (await this.userModel.findById(driver.user).exec());
    if (!user) return;

    const urgency = daysRemaining <= 7 ? 'URGENT' : '';
    const message =
      daysRemaining <= 7
        ? `⚠️ URGENT: Your ${docField} document expires in ${daysRemaining} days. Renew now to avoid service interruption.`
        : `Your ${docField} document will expire in ${daysRemaining} days. Please renew it.`;

    try {
      await this.notificationsService.sendNotification(
        user._id.toString(),
        `${urgency} Document Expiring Soon`.trim(),
        message,
        'system',
        { docField, daysRemaining },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to send ${daysRemaining}-day expiry notification: ${err}`,
      );
    }
  }
}
