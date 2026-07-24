import { DisputesService } from './disputes.service';

describe('DisputesService refunds', () => {
  it('refunds the verified Stripe payment instead of crediting an internal wallet', async () => {
    const dispute: Record<string, any> = {
      _id: { toString: () => 'dispute-1' },
      filedBy: { toString: () => '507f1f77bcf86cd799439011' },
      relatedServiceId: '507f1f77bcf86cd799439012',
      status: 'investigating',
      metadata: {},
      save: jest.fn().mockResolvedValue(undefined),
    };
    const disputeModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(dispute),
      }),
    };
    const rideModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              paymentIntentId: 'pi_paid_ride',
              totalCost: 40,
            }),
          }),
        }),
      }),
    };
    const bookingModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      }),
    };
    const paymentsService = {
      refundCustomer: jest.fn().mockResolvedValue({ id: 're_123' }),
    };
    const service = new DisputesService(
      disputeModel as never,
      {} as never,
      rideModel as never,
      bookingModel as never,
      {} as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
      { sendNotification: jest.fn().mockResolvedValue(undefined) } as never,
      paymentsService as never,
    );

    const result = await service.resolveDispute('dispute-1', 'admin-1', {
      resolution: 'issue_refund',
      refundAmount: 25,
    });

    expect(result.success).toBe(true);
    expect(paymentsService.refundCustomer).toHaveBeenCalledWith(
      'pi_paid_ride',
      25,
      'dispute:dispute-1:refund',
    );
    expect(dispute.stripeRefundId).toBe('re_123');
    expect(dispute.refundAmount).toBe(25);
  });
});
