import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingRequest, BookingRequestSchema } from 'src/schemas/booking-request.schema';
import { ParkingSpace, ParkingSpaceSchema } from 'src/schemas/parking-space.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { Chauffeur, ChauffeurSchema } from 'src/schemas/chauffeur.schema';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { PaymentsModule } from 'src/payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BookingRequest.name, schema: BookingRequestSchema },
      { name: ParkingSpace.name, schema: ParkingSpaceSchema },
      { name: User.name, schema: UserSchema },
      { name: Chauffeur.name, schema: ChauffeurSchema },
    ]),
    NotificationsModule,
    WalletModule,
    PaymentsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
