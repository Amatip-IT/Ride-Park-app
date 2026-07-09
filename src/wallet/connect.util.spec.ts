import { mapStripeConnectStatus } from './connect.util';

describe('connect.util', () => {
  describe('mapStripeConnectStatus', () => {
    it('returns restricted when Stripe disabled the account', () => {
      expect(
        mapStripeConnectStatus({
          payouts_enabled: false,
          details_submitted: true,
          requirements: { disabled_reason: 'requirements.past_due' } as any,
        }),
      ).toBe('restricted');
    });

    it('returns active when payouts are enabled', () => {
      expect(
        mapStripeConnectStatus({
          payouts_enabled: true,
          details_submitted: true,
          requirements: {},
        }),
      ).toBe('active');
    });

    it('returns pending when details are not fully submitted', () => {
      expect(
        mapStripeConnectStatus({
          payouts_enabled: false,
          details_submitted: false,
          requirements: { currently_due: ['individual.verification.document'] } as any,
        }),
      ).toBe('pending');
    });
  });
});
