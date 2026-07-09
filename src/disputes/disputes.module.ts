import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Dispute, DisputeSchema } from 'src/schemas/dispute.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { ParkingVerification, ParkingVerificationSchema } from 'src/schemas/parking-verification.schema';
import { Wallet, WalletSchema } from 'src/schemas/wallet.schema';
import { Transaction, TransactionSchema } from 'src/schemas/transaction.schema';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { AdminDisputesController } from './admin-disputes.controller';
import { AdminModule } from 'src/admin/admin.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AdminGuard } from 'src/guards/admin.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Dispute.name, schema: DisputeSchema },
      { name: User.name, schema: UserSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: ParkingVerification.name, schema: ParkingVerificationSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    AdminModule,
    NotificationsModule,
  ],
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesService, AdminGuard],
  exports: [DisputesService],
})
export class DisputesModule {}
