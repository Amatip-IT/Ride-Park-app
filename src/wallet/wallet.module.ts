import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { Wallet, WalletSchema } from 'src/schemas/wallet.schema';
import { Transaction, TransactionSchema } from 'src/schemas/transaction.schema';
import { PlatformSettings, PlatformSettingsSchema } from 'src/schemas/platform-settings.schema';
import { User, UserSchema } from 'src/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: PlatformSettings.name, schema: PlatformSettingsSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
