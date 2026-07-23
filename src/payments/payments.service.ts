import {
  Injectable,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import Stripe from 'stripe';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Ride, RideDocument } from 'src/schemas/ride.schema';
import {
  Transaction,
  TransactionDocument,
} from 'src/schemas/transaction.schema';
import { WebhookEventsService } from '../webhooks/webhook-events.service';
import { RidesService } from 'src/rides/rides.service';
import { BookingsService } from 'src/bookings/bookings.service';
import {
  getStripePublishableKey,
  getStripeServerKey,
  getStripeWebhookSecret,
} from './stripe-config';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private readonly publishableKey: string;
  private readonly webhookSecret: string;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    private readonly webhookEventsService: WebhookEventsService,
    @Inject(forwardRef(() => RidesService))
    private readonly ridesService: RidesService,
    @Inject(forwardRef(() => BookingsService))
    private readonly bookingsService: BookingsService,
  ) {
    const key = getStripeServerKey('payments')!;
    this.publishableKey = getStripePublishableKey(key);
    this.webhookSecret = getStripeWebhookSecret('payments')!;
    this.stripe = new Stripe(key, {
      apiVersion: '2023-10-16' as any,
    });
  }

  async getOrCreateCustomer(userId: string): Promise<string> {
    const user = await this.userModel
      .findById(userId)
      .select('+stripeCustomerId');
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: { userId: user._id.toString() },
    });

    user.stripeCustomerId = customer.id;
    await user.save();

    return customer.id;
  }

  async createSetupIntent(userId: string) {
    try {
      const customerId = await this.getOrCreateCustomer(userId);

      const ephemeralKey = await this.stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: '2022-11-15' as any },
      );

      const setupIntent = await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
      });

      return {
        setupIntent: setupIntent.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customer: customerId,
        publishableKey: this.publishableKey,
      };
    } catch (e: any) {
      throw new HttpException(e.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getPaymentMethods(userId: string) {
    try {
      const customerId = await this.getOrCreateCustomer(userId);
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      return paymentMethods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
      }));
    } catch (e: any) {
      throw new HttpException(e.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async hasPaymentMethod(userId: string): Promise<boolean> {
    const methods = await this.getPaymentMethods(userId);
    return methods.length > 0;
  }

  async chargeCustomer(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, string>,
    idempotencyKey?: string,
  ) {
    try {
      const customerId = await this.getOrCreateCustomer(userId);

      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      if (paymentMethods.data.length === 0) {
        throw new HttpException(
          'No payment method found for user. Please add a card before requesting a ride.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const userIdStr = typeof userId === 'string' ? userId : String(userId);

      const paymentIntent = await this.stripe.paymentIntents.create(
        {
          amount: Math.round(amount * 100),
          currency: 'gbp',
          customer: customerId,
          payment_method: paymentMethods.data[0].id,
          off_session: true,
          confirm: true,
          description,
          metadata: {
            userId: userIdStr,
            ...metadata,
          },
        },
        idempotencyKey ? { idempotencyKey } : undefined,
      );

      if (paymentIntent.status !== 'succeeded') {
        throw new Error(
          `Payment was not completed (Stripe status: ${paymentIntent.status})`,
        );
      }

      return paymentIntent;
    } catch (e: any) {
      throw new HttpException(
        e.type === 'StripeCardError'
          ? 'Payment declined: ' + e.message
          : 'Payment failed: ' + e.message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  verifyPaymentWebhookSignature(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      this.logger.error('Payment webhook signature verification failed', error);
      throw new InternalServerErrorException('Invalid webhook signature');
    }
  }

  async handlePaymentWebhookEvent(event: Stripe.Event): Promise<boolean> {
    return this.webhookEventsService.processOnce(
      'payments',
      event.id,
      event.type,
      async () => {
        switch (event.type) {
          case 'payment_intent.succeeded': {
            const paymentIntent = event.data.object;
            await this.onPaymentIntentSucceeded(paymentIntent);
            break;
          }
          case 'payment_intent.payment_failed': {
            const paymentIntent = event.data.object;
            await this.onPaymentIntentFailed(paymentIntent);
            break;
          }
          case 'charge.dispute.created':
          case 'charge.dispute.updated':
          case 'charge.dispute.closed':
            await this.onChargeDispute(event.data.object);
            break;
          default:
            this.logger.debug(`Unhandled payment webhook event: ${event.type}`);
        }
      },
    );
  }

  private async onPaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const meta = paymentIntent.metadata || {};

    if (meta.type === 'ride' && meta.rideId) {
      await this.ridesService.reconcilePaymentSucceeded(
        meta.rideId,
        paymentIntent.id,
      );
    } else if (meta.type === 'booking' && meta.bookingId) {
      await this.bookingsService.reconcilePaymentSucceeded(
        meta.bookingId,
        paymentIntent.id,
      );
    } else {
      this.logger.debug(
        `payment_intent.succeeded without ride/booking metadata: ${paymentIntent.id}`,
      );
    }

    await this.transactionModel.updateOne(
      { referenceId: paymentIntent.id },
      { $set: { status: 'completed' } },
    );
  }

  private async onPaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
    const meta = paymentIntent.metadata || {};

    if (meta.type === 'ride' && meta.rideId) {
      await this.ridesService.reconcilePaymentFailed(
        meta.rideId,
        paymentIntent.id,
      );
    } else if (meta.type === 'booking' && meta.bookingId) {
      await this.bookingsService.reconcilePaymentFailed(
        meta.bookingId,
        paymentIntent.id,
      );
    }

    await this.transactionModel.updateOne(
      { referenceId: paymentIntent.id },
      { $set: { status: 'failed' } },
    );
  }

  private async onChargeDispute(dispute: Stripe.Dispute) {
    const paymentIntentId =
      typeof dispute.payment_intent === 'string'
        ? dispute.payment_intent
        : dispute.payment_intent?.id;
    if (!paymentIntentId) {
      this.logger.error(
        JSON.stringify({
          event: 'stripe_dispute_unmatched',
          disputeId: dispute.id,
        }),
      );
      return;
    }

    const resolvedInPlatformFavour =
      dispute.status === 'won' || dispute.status === 'warning_closed';
    await this.transactionModel.updateMany(
      { stripePaymentIntentId: paymentIntentId, type: 'earning' },
      {
        $set: {
          status: resolvedInPlatformFavour
            ? 'completed'
            : dispute.status === 'lost'
              ? 'refunded'
              : 'disputed',
          failureCode: resolvedInPlatformFavour
            ? null
            : `stripe_dispute_${dispute.status}`,
          adminNotes: resolvedInPlatformFavour
            ? `Stripe dispute ${dispute.id} closed in the platform's favour`
            : `Stripe dispute ${dispute.id} is ${dispute.status}; review provider balance recovery`,
        },
      },
    );

    this.logger.warn(
      JSON.stringify({
        event: 'stripe_dispute_status',
        disputeId: dispute.id,
        paymentIntentId,
        status: dispute.status,
        amount: dispute.amount,
      }),
    );
  }

  async refundCustomer(
    paymentIntentId: string,
    amount?: number,
    idempotencyKey?: string,
  ): Promise<Stripe.Refund> {
    try {
      const refund = await this.stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          ...(amount !== undefined ? { amount: Math.round(amount * 100) } : {}),
        },
        idempotencyKey ? { idempotencyKey } : undefined,
      );
      return refund;
    } catch (e: any) {
      throw new HttpException(
        'Refund failed: ' + e.message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
