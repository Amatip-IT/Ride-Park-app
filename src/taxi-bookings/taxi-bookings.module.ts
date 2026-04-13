import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TaxiBookingsService } from './taxi-bookings.service';
import { TaxiBookingsController } from './taxi-bookings.controller';
import {
  TaxiRideRequest,
  TaxiRideRequestSchema,
} from 'src/schemas/taxi-ride-request.schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import { User, UserSchema } from 'src/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaxiRideRequest.name, schema: TaxiRideRequestSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [TaxiBookingsController],
  providers: [TaxiBookingsService],
  exports: [TaxiBookingsService],
})
export class TaxiBookingsModule {}
