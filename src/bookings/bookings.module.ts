import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingRequest, BookingRequestSchema } from 'src/schemas/booking-request.schema';
import { ParkingSpace, ParkingSpaceSchema } from 'src/schemas/parking-space.schema';
import { User, UserSchema } from 'src/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BookingRequest.name, schema: BookingRequestSchema },
      { name: ParkingSpace.name, schema: ParkingSpaceSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
