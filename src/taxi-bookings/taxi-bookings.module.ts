import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TaxiBookingsService } from './taxi-bookings.service';
import { TaxiBookingsController } from './taxi-bookings.controller';
import { TaxiBookingsGateway } from './taxi-bookings.gateway';
import {
  TaxiRideRequest,
  TaxiRideRequestSchema,
} from 'src/schemas/taxi-ride-request.schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { PaymentsModule } from 'src/payments/payments.module';
import { RidesModule } from 'src/rides/rides.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaxiRideRequest.name, schema: TaxiRideRequestSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    PaymentsModule,
    RidesModule,
  ],
  controllers: [TaxiBookingsController],
  providers: [TaxiBookingsService, TaxiBookingsGateway],
  exports: [TaxiBookingsService, TaxiBookingsGateway],
})
export class TaxiBookingsModule {}
