import { Injectable, HttpException, HttpStatus, InternalServerErrorException, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Ride, RideDocument } from 'src/schemas/ride.schema';
import { Transaction, TransactionDocument } from 'src/schemas/transaction.schema';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key && process.env.NODE_ENV !== 'test') {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    this.stripe = new Stripe(key || 'sk_test_mock', {
      apiVersion: '2023-10-16' as any,
    });
  }

  async getOrCreateCustomer(userId: string): Promise<string> {
    const user = await this.userModel.findById(userId).select('+stripeCustomerId');
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Create a new Customer
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
        { apiVersion: '2022-11-15' as any } // Provide a recognized typed API version string without strict failure
      );

      const setupIntent = await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
      });

      return {
        setupIntent: setupIntent.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customer: customerId,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
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

      return paymentMethods.data.map(pm => ({
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
  ) {
    try {
      const customerId = await this.getOrCreateCustomer(userId);
      
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      if (paymentMethods.data.length === 0) {
        throw new HttpException('No payment method found for user. Please add a card before requesting a ride.', HttpStatus.BAD_REQUEST);
      }

      const userIdStr = typeof userId === 'string' ? userId : String(userId);

      const paymentIntent = await this.stripe.paymentIntents.create({
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
      });

      return paymentIntent;
    } catch (e: any) {
      throw new HttpException(
        e.type === 'StripeCardError' ? 'Payment declined: ' + e.message : 'Payment failed: ' + e.message, 
        HttpStatus.BAD_REQUEST
      );
    }
  }

  verifyPaymentWebhookSignature(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    const webhookSecret =
      process.env.STRIPE_PAYMENTS_WEBHOOK_SECRET ||
      process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'Stripe payments webhook secret not configured',
      );
    }

    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch (error) {
      this.logger.error('Payment webhook signature verification failed', error);
      throw new InternalServerErrorException('Invalid webhook signature');
    }
  }

  async handlePaymentWebhookEvent(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onPaymentIntentSucceeded(paymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await this.onPaymentIntentFailed(paymentIntent);
        break;
      default:
        this.logger.debug(`Unhandled payment webhook event: ${event.type}`);
    }
  }

  private async onPaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    if (paymentIntent.metadata?.type === 'ride' && paymentIntent.metadata?.rideId) {
      await this.rideModel.findByIdAndUpdate(paymentIntent.metadata.rideId, {
        paymentStatus: 'charged',
        paymentIntentId: paymentIntent.id,
      });
    }

    await this.transactionModel.updateOne(
      { referenceId: paymentIntent.id },
      { $set: { status: 'completed' } },
    );
  }

  private async onPaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
    if (paymentIntent.metadata?.type === 'ride' && paymentIntent.metadata?.rideId) {
      await this.rideModel.findByIdAndUpdate(paymentIntent.metadata.rideId, {
        paymentStatus: 'payment_failed',
        paymentIntentId: paymentIntent.id,
      });
    }

    await this.transactionModel.updateOne(
      { referenceId: paymentIntent.id },
      { $set: { status: 'failed' } },
    );
  }

  async refundCustomer(paymentIntentId: string): Promise<Stripe.Refund> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
      });
      return refund;
    } catch (e: any) {
      throw new HttpException(
        'Refund failed: ' + e.message,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
