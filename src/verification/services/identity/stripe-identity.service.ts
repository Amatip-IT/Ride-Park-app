import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeIdentityService {
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    this.initializeStripe();
  }

  /**
   * Initialize Stripe client
   */
  private initializeStripe(): void {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      console.warn('⚠️ Stripe credentials not configured. Stripe features will fail if called.');
      return;
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-11-17.clover',
    });

    console.log('Stripe Identity service initialized');
  }

  /**
   * Create identity verification session
   * @param userId - User's ID (for metadata)
   * @param returnUrl - URL to redirect user after verification
   * @returns Verification session object
   */
  async createVerificationSession(
    userId: string,
    returnUrl: string,
  ): Promise<{
    sessionId: string;
    url: string;
    clientSecret: string;
  }> {
    try {
      const session = await this.stripe.identity.verificationSessions.create({
        type: 'document',
        metadata: {
          userId,
        },
        options: {
          document: {
            allowed_types: ['driving_license', 'passport'],
            require_live_capture: true,
            require_matching_selfie: true,
          },
        },
        return_url: returnUrl,
      });

      console.log(`Verification session created: ${session.id}`);

      return {
        sessionId: session.id,
        url: session.url || '',
        clientSecret: session.client_secret || '',
      };
    } catch (error) {
      console.error('❌ Failed to create verification session:', error);
      throw new InternalServerErrorException(
        'Failed to create identity verification session. Please try again later.',
      );
    }
  }

  /**
   * Retrieve verification session details
   * @param sessionId - Stripe verification session ID
   * @returns Verification session with extracted data
   */
  async getVerificationSession(sessionId: string): Promise<{
    id: string;
    status: string;
    verified: boolean;
    idType: 'driving_license' | 'passport' | null;
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    licenseNumber: string | null;
  }> {
    try {
      const session = await this.stripe.identity.verificationSessions.retrieve(
        sessionId,
        {
          expand: ['verified_outputs'],
        },
      );

      interface VerifiedOutputs {
        first_name?: string;
        last_name?: string;
        dob?: {
          day?: number;
          month?: number;
          year?: number;
        };
        document?: {
          type?: 'driving_license' | 'passport';
          number?: string;
        };
      }

      const verifiedOutputs =
        session.verified_outputs as VerifiedOutputs | null;
      const document = verifiedOutputs?.document;
      const dob = verifiedOutputs?.dob;

      // Format DOB to YYYY-MM-DD
      let dateOfBirth: string | null = null;
      if (dob?.day && dob?.month && dob?.year) {
        const month = String(dob.month).padStart(2, '0');
        const day = String(dob.day).padStart(2, '0');
        dateOfBirth = `${dob.year}-${month}-${day}`;
      }

      return {
        id: session.id,
        status: session.status,
        verified: session.status === 'verified',
        idType: document?.type || null,
        firstName: verifiedOutputs?.first_name || null,
        lastName: verifiedOutputs?.last_name || null,
        dateOfBirth,
        licenseNumber: document?.number || null,
      };
    } catch (error) {
      console.error('❌ Failed to retrieve verification session:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve verification details.',
      );
    }
  }

  /**
   * Verify webhook signature
   * @param payload - Webhook payload (raw body)
   * @param signature - Stripe signature header
   * @returns Stripe event object
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'Stripe webhook secret not configured',
      );
    }

    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch (error) {
      console.error('❌ Webhook signature verification failed:', error);
      throw new InternalServerErrorException('Invalid webhook signature');
    }
  }
}
