import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { WalletService } from './wallet.service';

/**
 * Stripe Connect webhooks — no auth; verified via stripe-signature header.
 * POST /api/wallet/connect-webhook
 */
@Controller('wallet')
export class WalletWebhookController {
  constructor(private readonly walletService: WalletService) {}

  @Post('connect-webhook')
  async handleConnectWebhook(
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

    const event = this.walletService.verifyConnectWebhookSignature(
      rawBody,
      signature,
    );

    await this.walletService.handleConnectWebhookEvent(event);

    return { received: true };
  }
}
