import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { WebhookEvent } from '../schemas/webhook-event.schema';
import { WebhookEventsService } from './webhook-events.service';

describe('WebhookEventsService', () => {
  let service: WebhookEventsService;

  const mockWebhookEventModel = {
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookEventsService,
        {
          provide: getModelToken(WebhookEvent.name),
          useValue: mockWebhookEventModel,
        },
      ],
    }).compile();

    service = module.get(WebhookEventsService);
    jest.clearAllMocks();
  });

  it('runs a new event once and marks it completed', async () => {
    const record = { _id: 'webhook-record-1' };
    const handler = jest.fn().mockResolvedValue(undefined);
    mockWebhookEventModel.create.mockResolvedValue(record);
    mockWebhookEventModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const processed = await service.processOnce(
      'payments',
      'evt_new',
      'payment_intent.succeeded',
      handler,
    );

    expect(processed).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockWebhookEventModel.updateOne).toHaveBeenCalledWith(
      { _id: record._id, status: 'processing' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'completed' }),
      }),
    );
  });

  it('suppresses a replay while the original event is complete or active', async () => {
    const duplicateError = Object.assign(new Error('duplicate key'), {
      code: 11000,
    });
    const handler = jest.fn();
    mockWebhookEventModel.create.mockRejectedValue(duplicateError);
    mockWebhookEventModel.findOneAndUpdate.mockResolvedValue(null);

    const processed = await service.processOnce(
      'payments',
      'evt_replayed',
      'payment_intent.succeeded',
      handler,
    );

    expect(processed).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(mockWebhookEventModel.updateOne).not.toHaveBeenCalled();
  });

  it('reclaims a failed event and records another failure for later retry', async () => {
    const duplicateError = Object.assign(new Error('duplicate key'), {
      code: 11000,
    });
    const handlerError = new Error('temporary downstream failure');
    const handler = jest.fn().mockRejectedValue(handlerError);
    mockWebhookEventModel.create.mockRejectedValue(duplicateError);
    mockWebhookEventModel.findOneAndUpdate.mockResolvedValue({
      _id: 'webhook-record-2',
    });
    mockWebhookEventModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await expect(
      service.processOnce('connect', 'evt_retry', 'transfer.reversed', handler),
    ).rejects.toThrow(handlerError);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockWebhookEventModel.updateOne).toHaveBeenCalledWith(
      { _id: 'webhook-record-2' },
      { $set: { status: 'failed', lastError: handlerError.message } },
    );
  });
});
