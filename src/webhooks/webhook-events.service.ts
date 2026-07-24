import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WebhookEvent,
  WebhookEventDocument,
} from '../schemas/webhook-event.schema';
import { OperationalMetricsService } from '../observability/operational-metrics.service';

type WebhookProvider = 'payments' | 'connect';

@Injectable()
export class WebhookEventsService {
  private readonly logger = new Logger(WebhookEventsService.name);

  constructor(
    @InjectModel(WebhookEvent.name)
    private readonly webhookEventModel: Model<WebhookEventDocument>,
    @Optional()
    private readonly metrics?: OperationalMetricsService,
  ) {}

  async processOnce(
    provider: WebhookProvider,
    eventId: string,
    eventType: string,
    handler: () => Promise<void>,
  ): Promise<boolean> {
    const now = new Date();
    let record: WebhookEventDocument | null = null;

    try {
      record = await this.webhookEventModel.create({
        provider,
        eventId,
        eventType,
        status: 'processing',
        attempts: 1,
        processingStartedAt: now,
      });
    } catch (error: unknown) {
      if (!this.isDuplicateKey(error)) {
        throw error;
      }

      const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
      record = await this.webhookEventModel.findOneAndUpdate(
        {
          provider,
          eventId,
          $or: [
            { status: 'failed' },
            { status: 'processing', processingStartedAt: { $lt: staleBefore } },
          ],
        },
        {
          $set: {
            status: 'processing',
            processingStartedAt: now,
            lastError: null,
          },
          $inc: { attempts: 1 },
        },
        { new: true },
      );

      if (!record) {
        return false;
      }
    }

    try {
      await handler();
      await this.webhookEventModel.updateOne(
        { _id: record._id, status: 'processing' },
        {
          $set: { status: 'completed', processedAt: new Date() },
          $unset: { lastError: 1 },
        },
      );
      this.metrics?.increment(`webhook.${provider}.completed`);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.webhookEventModel.updateOne(
        { _id: record._id },
        { $set: { status: 'failed', lastError: message } },
      );
      this.metrics?.increment(`webhook.${provider}.failed`);
      this.logger.error(
        JSON.stringify({
          event: 'webhook_processing_failed',
          provider,
          eventId,
          eventType,
          error: message,
        }),
      );
      throw error;
    }
  }

  private isDuplicateKey(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }
}
