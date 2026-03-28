import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProviderService } from './provider.service';
import { ProviderController } from './provider.controller';
import { ParkingVerification, ParkingVerificationSchema } from 'src/schemas/parking-verification.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { BookingRequest, BookingRequestSchema } from 'src/schemas/booking-request.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ParkingVerification.name, schema: ParkingVerificationSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: User.name, schema: UserSchema },
      { name: BookingRequest.name, schema: BookingRequestSchema },
    ]),
  ],
  controllers: [ProviderController],
  providers: [ProviderService],
  exports: [ProviderService],
})
export class ProviderModule {}
