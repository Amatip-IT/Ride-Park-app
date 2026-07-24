import Stripe from 'stripe';

export type ConnectAccountStatus = 'pending' | 'active' | 'restricted';

export function mapStripeConnectStatus(
  account: Pick<
    Stripe.Account,
    'payouts_enabled' | 'details_submitted' | 'requirements'
  >,
): ConnectAccountStatus {
  if (account.requirements?.disabled_reason) {
    return 'restricted';
  }
  if (account.payouts_enabled && account.details_submitted) {
    return 'active';
  }
  return 'pending';
}
