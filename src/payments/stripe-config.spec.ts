import {
  getStripePublishableKey,
  getStripeServerKey,
  getStripeWebhookSecret,
} from './stripe-config';

const reader = (values: Record<string, string | undefined>) => (name: string) =>
  values[name];

describe('Stripe live configuration', () => {
  it('requires a restricted live key in production', () => {
    expect(() =>
      getStripeServerKey('payments', {
        read: reader({
          NODE_ENV: 'production',
          STRIPE_SECRET_KEY: 'sk_live_example',
        }),
      }),
    ).toThrow('rk_live_');
  });

  it('accepts a restricted live key in production', () => {
    expect(
      getStripeServerKey('payments', {
        read: reader({
          NODE_ENV: 'production',
          STRIPE_RESTRICTED_KEY: 'rk_live_example',
        }),
      }),
    ).toBe('rk_live_example');
  });

  it('prefers a scope-specific restricted key', () => {
    expect(
      getStripeServerKey('connect', {
        read: reader({
          NODE_ENV: 'production',
          STRIPE_RESTRICTED_KEY: 'rk_live_shared',
          STRIPE_CONNECT_RESTRICTED_KEY: 'rk_live_connect',
        }),
      }),
    ).toBe('rk_live_connect');
  });

  it('blocks accidental live-mode use outside production', () => {
    expect(() =>
      getStripeServerKey('payments', {
        read: reader({
          NODE_ENV: 'development',
          STRIPE_RESTRICTED_KEY: 'rk_live_example',
        }),
      }),
    ).toThrow('blocked outside production');
  });

  it('requires the publishable key to use the same mode', () => {
    expect(() =>
      getStripePublishableKey(
        'rk_live_example',
        reader({
          NODE_ENV: 'production',
          STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
        }),
      ),
    ).toThrow('pk_live_');
  });

  it('accepts a single shared webhook secret in production', () => {
    expect(
      getStripeWebhookSecret('connect', {
        read: reader({
          NODE_ENV: 'production',
          STRIPE_WEBHOOK_SECRET: 'whsec_legacy',
        }),
      }),
    ).toBe('whsec_legacy');
  });

  it('prefers a scope-specific webhook secret when present', () => {
    expect(
      getStripeWebhookSecret('connect', {
        read: reader({
          NODE_ENV: 'production',
          STRIPE_WEBHOOK_SECRET: 'whsec_legacy',
          STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
        }),
      }),
    ).toBe('whsec_connect');
  });
});
