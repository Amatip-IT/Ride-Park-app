import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminMessagingController } from './admin-messaging.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminMessagingService } from './admin-messaging.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import {
  ParkingVerification,
  ParkingVerificationSchema,
} from 'src/schemas/parking-verification.schema';
import {
  ParkingSpace,
  ParkingSpaceSchema,
} from 'src/schemas/parking-space.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { Wallet, WalletSchema } from 'src/schemas/wallet.schema';
import { Transaction, TransactionSchema } from 'src/schemas/transaction.schema';
import {
  PlatformSettings,
  PlatformSettingsSchema,
} from 'src/schemas/platform-settings.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { UtilityModule } from 'src/utility/utility.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { VerificationModule } from 'src/verification/verification.module';
import { AdminGuard } from 'src/guards/admin.guard';
import {
  AdminAuditLog,
  AdminAuditLogSchema,
} from 'src/schemas/admin-audit-log.schema';
import {
  AdminMessage,
  AdminMessageSchema,
} from 'src/schemas/admin-message.schema';
import {
  AdminMessageTemplate,
  AdminMessageTemplateSchema,
} from 'src/schemas/admin-message-template.schema';
import { AdminAuditService } from './admin-audit.service';
import { WalletModule } from '../wallet/wallet.module';
import {
  WebhookEvent,
  WebhookEventSchema,
} from '../schemas/webhook-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParkingVerification.name, schema: ParkingVerificationSchema },
      { name: ParkingSpace.name, schema: ParkingSpaceSchema },
      { name: User.name, schema: UserSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: PlatformSettings.name, schema: PlatformSettingsSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
      { name: AdminMessage.name, schema: AdminMessageSchema },
      { name: AdminMessageTemplate.name, schema: AdminMessageTemplateSchema },
      { name: WebhookEvent.name, schema: WebhookEventSchema },
    ]),
    UtilityModule,
    NotificationsModule,
    VerificationModule,
    WalletModule,
  ],
  controllers: [
    AdminController,
    AdminMessagingController,
    AdminAnalyticsController,
  ],
  providers: [
    AdminService,
    AdminAuditService,
    AdminMessagingService,
    AdminAnalyticsService,
    AdminGuard,
  ],
  exports: [
    AdminService,
    AdminAuditService,
    AdminMessagingService,
    AdminAnalyticsService,
  ],
})
export class AdminModule {}
