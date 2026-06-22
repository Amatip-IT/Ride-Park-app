import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/schemas/user.schema';
import {
  user_settings,
  UserSettingsSchema,
} from 'src/schemas/user-settings-schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { Wallet, WalletSchema } from 'src/schemas/wallet.schema';
import { BookingRequest, BookingRequestSchema } from 'src/schemas/booking-request.schema';
import { ParkingVerification, ParkingVerificationSchema } from 'src/schemas/parking-verification.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { VerificationModule } from 'src/verification/verification.module';
import { AdminGuard } from 'src/guards/admin.guard';
import { AuthGuard } from 'src/guards/auth.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: user_settings.name, schema: UserSettingsSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: Wallet.name, schema: WalletSchema },
      { name: BookingRequest.name, schema: BookingRequestSchema },
      { name: ParkingVerification.name, schema: ParkingVerificationSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
    ]),
    VerificationModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, AuthGuard, AdminGuard],
})
export class UsersModule {}
