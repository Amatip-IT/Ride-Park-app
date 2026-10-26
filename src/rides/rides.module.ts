import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import { RidePricingService } from './ride-pricing.service';
import { Ride, RideSchema } from 'src/schemas/ride.schema';
import {
  TaxiRideRequest,
  TaxiRideRequestSchema,
} from 'src/schemas/taxi-ride-request.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiSchema } from 'src/schemas/taxi.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { PaymentsModule } from 'src/payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ride.name, schema: RideSchema },
      { name: TaxiRideRequest.name, schema: TaxiRideRequestSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    // forwardRef: WalletModule ↔ PaymentsModule ↔ RidesModule cycle
    forwardRef(() => WalletModule),
    forwardRef(() => PaymentsModule),
  ],
  controllers: [RidesController],
  providers: [RidesService, RidePricingService],
  exports: [RidesService, RidePricingService],
})
export class RidesModule {}
