import { RideWalletService } from './ride-wallet.service';

const PASSENGER = '507f1f77bcf86cd799439011';
const RIDE = '507f1f77bcf86cd799439022';

function setup(options: { holdApplies?: boolean[]; alreadyHeld?: boolean; balance?: number } = {}) {
  const holdApplies = [...(options.holdApplies ?? [true])];
  const walletModel: any = {
    updateOne: jest.fn((filter: any) => {
      // Conditional hold/settle updates are the ones with appliedHolds in the filter
      if (filter.appliedHolds !== undefined || filter.settledHolds !== undefined) {
        const applied = holdApplies.length ? holdApplies.shift() : true;
        return Promise.resolve({ modifiedCount: applied ? 1 : 0 });
      }
      return Promise.resolve({ modifiedCount: 1 });
    }),
    exists: jest.fn().mockResolvedValue(options.alreadyHeld ? { _id: 'w' } : null),
    findOne: jest.fn(() => ({
      select: () => ({ lean: () => ({ exec: () => Promise.resolve({ balance: options.balance ?? 0, heldBalance: 0 }) }) }),
    })),
  };
  const transactionModel: any = {
    updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
  };
  const paymentsService: any = {
    chargeCustomer: jest.fn().mockResolvedValue({ id: 'pi_topup_1' }),
  };
  const service = new RideWalletService(walletModel, transactionModel, paymentsService);
  return { service, walletModel, transactionModel, paymentsService };
}

describe('RideWalletService', () => {
  it('holds funds with a single conditional update that requires enough balance and no prior hold', async () => {
    const { service, walletModel, paymentsService } = setup();

    const result = await service.holdRideFunds({ rideId: RIDE, passengerId: PASSENGER, amountPence: 1234 });

    expect(result.ok).toBe(true);
    expect(paymentsService.chargeCustomer).not.toHaveBeenCalled();
    const holdCall = walletModel.updateOne.mock.calls.find((c: any[]) => c[0].appliedHolds);
    expect(holdCall[0]).toEqual(
      expect.objectContaining({ appliedHolds: { $ne: RIDE }, balance: { $gte: 12.34 } }),
    );
  });

  it('is idempotent: a retried hold for the same ride does not move money twice', async () => {
    const { service, paymentsService } = setup({ holdApplies: [false], alreadyHeld: true });

    const result = await service.holdRideFunds({ rideId: RIDE, passengerId: PASSENGER, amountPence: 1234 });

    expect(result).toEqual(expect.objectContaining({ ok: true, alreadyDone: true }));
    expect(paymentsService.chargeCustomer).not.toHaveBeenCalled();
  });

  it('tops up only the shortfall from the card (idempotency key per ride) when the wallet is short', async () => {
    const { service, paymentsService } = setup({ holdApplies: [false, true], balance: 5 });

    const result = await service.holdRideFunds({ rideId: RIDE, passengerId: PASSENGER, amountPence: 1234 });

    expect(result.ok).toBe(true);
    expect(paymentsService.chargeCustomer).toHaveBeenCalledWith(
      PASSENGER,
      7.34,
      expect.any(String),
      expect.any(Object),
      `ride:${RIDE}:hold-topup`,
    );
  });

  it('refuses the hold when the card top-up fails', async () => {
    const { service, paymentsService } = setup({ holdApplies: [false], balance: 0 });
    paymentsService.chargeCustomer.mockRejectedValue(new Error('declined'));

    const result = await service.holdRideFunds({ rideId: RIDE, passengerId: PASSENGER, amountPence: 1234 });

    expect(result.ok).toBe(false);
  });

  it('capture returns unused held funds to available balance in the same update', async () => {
    const { service, walletModel } = setup();

    const result = await service.captureRideHold({
      rideId: RIDE,
      passengerId: PASSENGER,
      heldPence: 1700,
      finalPence: 1500,
    });

    expect(result.ok).toBe(true);
    const settle = walletModel.updateOne.mock.calls.find((c: any[]) => c[0].settledHolds);
    expect(settle[0]).toEqual(
      expect.objectContaining({ appliedHolds: RIDE, settledHolds: { $ne: RIDE } }),
    );
    // No extra-funds condition when the final fare is below the hold
    expect(settle[0].balance).toBeUndefined();
  });

  it('capture of a higher final fare requires the extra to be available', async () => {
    const { service, walletModel } = setup();

    const result = await service.captureRideHold({
      rideId: RIDE,
      passengerId: PASSENGER,
      heldPence: 1500,
      finalPence: 1800,
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, extraChargedPence: 300 }));
    const settle = walletModel.updateOne.mock.calls.find((c: any[]) => c[0].settledHolds);
    expect(settle[0].balance).toEqual({ $gte: 3 });
  });

  it('dispute refunds credit the wallet only once per reference', async () => {
    const { service, walletModel, transactionModel } = setup();
    transactionModel.updateOne
      .mockResolvedValueOnce({ upsertedCount: 1 })
      .mockResolvedValueOnce({ upsertedCount: 0 });

    const first = await service.refundToWallet({
      userId: PASSENGER,
      amountPence: 500,
      referenceId: 'dispute:1:refund',
      description: 'Refund',
    });
    const creditsAfterFirst = walletModel.updateOne.mock.calls.length;
    const second = await service.refundToWallet({
      userId: PASSENGER,
      amountPence: 500,
      referenceId: 'dispute:1:refund',
      description: 'Refund',
    });

    expect(first).toEqual({ ok: true, alreadyDone: false });
    expect(second).toEqual({ ok: true, alreadyDone: true });
    // Second call only ensures the wallet exists; it does not credit again
    expect(walletModel.updateOne.mock.calls.length - creditsAfterFirst).toBe(1);
  });
});
