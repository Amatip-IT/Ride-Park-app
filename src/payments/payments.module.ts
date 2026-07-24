import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { User, UserSchema } from 'src/schemas/user.schema';
import { Ride, RideSchema } from 'src/schemas/ride.schema';
import { Transaction, TransactionSchema } from 'src/schemas/transaction.schema';
import { WebhookEventsModule } from '../webhooks/webhook-events.module';
import { RidesModule } from 'src/rides/rides.module';
import { BookingsModule } from 'src/bookings/bookings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Ride.name, schema: RideSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    WebhookEventsModule,
    forwardRef(() => RidesModule),
    forwardRef(() => BookingsModule),
  ],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
