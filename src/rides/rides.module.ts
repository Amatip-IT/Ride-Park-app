import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import { Ride, RideSchema } from 'src/schemas/ride.schema';
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
      { name: Chauffeur.name, schema: ChauffeurSchema },
      { name: Taxi.name, schema: TaxiSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    WalletModule,
    PaymentsModule,
  ],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}
