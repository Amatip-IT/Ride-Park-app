import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProviderService } from './provider.service';
import { ProviderController } from './provider.controller';
import { ParkingVerification, ParkingVerificationSchema } from 'src/schemas/parking-verification.schema';
import { ParkingSpace, ParkingSpaceSchema } from 'src/schemas/parking-space.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { BookingRequest, BookingRequestSchema } from 'src/schemas/booking-request.schema';
import { VerificationModule } from '../verification/verification.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { ProviderGuard } from 'src/guards/provider.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParkingVerification.name, schema: ParkingVerificationSchema },
      { name: ParkingSpace.name, schema: ParkingSpaceSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: User.name, schema: UserSchema },
      { name: BookingRequest.name, schema: BookingRequestSchema },
    ]),
    VerificationModule,
    WalletModule,
  ],
  controllers: [ProviderController],
  providers: [ProviderService, ProviderGuard],
  exports: [ProviderService],
})
export class ProviderModule {}
