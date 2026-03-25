import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Headers,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { IdentityVerificationService } from './verification.service';
import { CreateIdentitySessionDto } from '../dto/create-identity-session.dto';
import { AuthGuard } from '../../guards/auth.guard';
import { StripeIdentityService } from '../services/identity/stripe-identity.service';

interface AuthenticatedRequest {
  user: {
    _id: {
      toString(): string;
    };
  };
}

interface StripeVerificationSession {
  id: string;
}

@Controller('verification/identity')
export class IdentityVerificationController {
  constructor(
    private readonly identityVerificationService: IdentityVerificationService,
    private readonly stripeIdentityService: StripeIdentityService,
  ) {}

  /**
   * Create identity verification session
   * POST /verification/identity/create-session
   */
  @UseGuards(AuthGuard)
  @Post('create-session')
  async createSession(
    @Body() createSessionDto: CreateIdentitySessionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const userId = req.user._id.toString();
    return this.identityVerificationService.createVerificationSession(
      userId,
      createSessionDto.returnUrl,
    );
  }

  /**
   * Stripe webhook handler for verification events
   * POST /verification/identity/webhook
   *
   * IMPORTANT: This endpoint must receive raw body for signature verification
   */
  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException(
        'Missing raw body for webhook verification',
      );
    }

    // Verify webhook signature
    const event = this.stripeIdentityService.verifyWebhookSignature(
      rawBody,
      signature,
    );

    const session = event.data.object as StripeVerificationSession;

    // Handle different verification events
    switch (event.type) {
      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input':
      case 'identity.verification_session.canceled':
        await this.identityVerificationService.handleVerificationWebhook(
          session.id,
        );
        break;

      // These are intermediate states - can ignore
      case 'identity.verification_session.created':
      case 'identity.verification_session.processing':
      case 'file.created':
        console.log(`Info: ${event.type} for session ${session.id}`);
        break;

      default:
        console.log(`Unhandled event: ${event.type}`);
    }

    return { received: true };
  }

  /**
   * Check identity verification status
   * GET /verification/identity/status
   */
  @UseGuards(AuthGuard)
  @Get('status')
  async checkStatus(@Request() req: AuthenticatedRequest) {
    const userId = req.user._id.toString();
    return this.identityVerificationService.checkIdentityStatus(userId);
  }

  /**
   * Check if user verified with driving license
   * GET /verification/identity/has-license
   */
  @UseGuards(AuthGuard)
  @Get('has-license')
  async hasLicense(@Request() req: AuthenticatedRequest) {
    const userId = req.user._id.toString();
    const hasLicense =
      await this.identityVerificationService.hasVerifiedWithDrivingLicense(
        userId,
      );

    return {
      success: true,
      hasDrivingLicense: hasLicense,
      message:
        hasLicense === true
          ? 'User verified with driving license'
          : "`User's drivers' license is not verified. Please verify with driving license to become a driver.'",
    };
  }
}
