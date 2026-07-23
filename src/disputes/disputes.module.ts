import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Dispute, DisputeSchema } from 'src/schemas/dispute.schema';
import { User, UserSchema } from 'src/schemas/user.schema';
import { Ride, RideSchema } from 'src/schemas/ride.schema';
import {
  BookingRequest,
  BookingRequestSchema,
} from 'src/schemas/booking-request.schema';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { AdminDisputesController } from './admin-disputes.controller';
import { AdminModule } from 'src/admin/admin.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AdminGuard } from 'src/guards/admin.guard';
import { PaymentsModule } from 'src/payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Dispute.name, schema: DisputeSchema },
      { name: User.name, schema: UserSchema },
      { name: Ride.name, schema: RideSchema },
      { name: BookingRequest.name, schema: BookingRequestSchema },
    ]),
    AdminModule,
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesService, AdminGuard],
  exports: [DisputesService],
})
export class DisputesModule {}
