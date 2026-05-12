import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ParkingVerification, ParkingVerificationSchema } from 'src/schemas/parking-verification.schema';
import { ParkingSpace, ParkingSpaceSchema } from 'src/schemas/parking-space.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { Wallet, WalletSchema } from 'src/schemas/wallet.schema';
import { Transaction, TransactionSchema } from 'src/schemas/transaction.schema';
import { PlatformSettings, PlatformSettingsSchema } from 'src/schemas/platform-settings.schema';
import { UtilityModule } from 'src/utility/utility.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParkingVerification.name, schema: ParkingVerificationSchema },
      { name: ParkingSpace.name, schema: ParkingSpaceSchema },
      { name: User.name, schema: UserSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: PlatformSettings.name, schema: PlatformSettingsSchema },
    ]),
    UtilityModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
