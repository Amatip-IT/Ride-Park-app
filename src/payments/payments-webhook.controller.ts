import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

/**
 * Stripe payment webhooks — no auth; verified via stripe-signature header.
 * POST /api/payments/webhook
 */
@Controller('payments')
export class PaymentsWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

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

    const event = this.paymentsService.verifyPaymentWebhookSignature(
      rawBody,
      signature,
    );

    await this.paymentsService.handlePaymentWebhookEvent(event);

    return { received: true };
  }
}
