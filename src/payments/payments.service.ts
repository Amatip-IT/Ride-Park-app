import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import Stripe from 'stripe';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/schemas/user.schema';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');
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
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_mock',
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

  async chargeCustomer(userId: string, amount: number, description: string) {
    try {
      const customerId = await this.getOrCreateCustomer(userId);
      
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      if (paymentMethods.data.length === 0) {
        throw new HttpException('No payment method found for user. Please add a card before requesting a ride.', HttpStatus.BAD_REQUEST);
      }

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe expects amounts in pence/cents
        currency: 'gbp',
        customer: customerId,
        payment_method: paymentMethods.data[0].id,
        off_session: true,
        confirm: true,
        description,
      });

      return paymentIntent;
    } catch (e: any) {
      throw new HttpException(
        e.type === 'StripeCardError' ? 'Payment declined: ' + e.message : 'Payment failed: ' + e.message, 
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
