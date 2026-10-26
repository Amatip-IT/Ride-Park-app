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
      {} as never,
      {} as never,
      {} as never,
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

  it('refunds wallet-paid rides to the customer wallet only after an authorised resolution', async () => {
    const dispute: Record<string, any> = {
      _id: { toString: () => 'dispute-2' },
      filedBy: { toString: () => '507f1f77bcf86cd799439011' },
      rideId: '507f1f77bcf86cd799439015',
      rideReference: 'GZ-ABC123',
      status: 'investigating',
      metadata: {},
      save: jest.fn().mockResolvedValue(undefined),
    };
    const disputeModel = {
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(dispute) }),
    };
    const rideModel = {
      findById: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => ({
            exec: jest.fn().mockResolvedValue({
              passenger: '507f1f77bcf86cd799439011',
              paymentMethod: 'wallet',
              paymentStatus: 'charged',
              totalCostPence: 1800,
              hold: { capturedAmountPence: 1800 },
            }),
          }),
        }),
      }),
    };
    const rideWallet = {
      refundToWallet: jest.fn().mockResolvedValue({ ok: true, alreadyDone: false }),
    };
    const paymentsService = { refundCustomer: jest.fn() };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new DisputesService(
      disputeModel as never,
      {} as never,
      rideModel as never,
      {} as never,
      {} as never,
      audit as never,
      { sendNotification: jest.fn().mockResolvedValue(undefined) } as never,
      paymentsService as never,
      {} as never,
      {} as never,
      rideWallet as never,
    );

    const tooMuch = await service.resolveDispute('dispute-2', 'admin-1', {
      resolution: 'issue_refund',
      refundAmount: 19,
    });
    expect(tooMuch.success).toBe(false);
    expect(rideWallet.refundToWallet).not.toHaveBeenCalled();

    const result = await service.resolveDispute('dispute-2', 'admin-1', {
      resolution: 'issue_refund',
      refundAmount: 6.5,
    });
    expect(result.success).toBe(true);
    expect(paymentsService.refundCustomer).not.toHaveBeenCalled();
    expect(rideWallet.refundToWallet).toHaveBeenCalledWith(
      expect.objectContaining({ amountPence: 650, referenceId: 'dispute:dispute-2:refund' }),
    );
    expect(dispute.status).toBe('resolved');
    expect(dispute.resolution).toBe('issue_refund');
    expect(dispute.statusHistory[0].status).toBe('resolved');
  });
});
