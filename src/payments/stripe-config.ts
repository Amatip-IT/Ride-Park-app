export type StripeKeyScope = 'payments' | 'connect' | 'identity';

type EnvironmentReader = (name: string) => string | undefined;

const SCOPED_KEY_NAMES: Record<StripeKeyScope, string> = {
  payments: 'STRIPE_PAYMENTS_RESTRICTED_KEY',
  connect: 'STRIPE_CONNECT_RESTRICTED_KEY',
  identity: 'STRIPE_IDENTITY_RESTRICTED_KEY',
};

const SCOPED_WEBHOOK_NAMES: Record<StripeKeyScope, string> = {
  payments: 'STRIPE_PAYMENTS_WEBHOOK_SECRET',
  connect: 'STRIPE_CONNECT_WEBHOOK_SECRET',
  identity: 'STRIPE_IDENTITY_WEBHOOK_SECRET',
};

const processEnvironment: EnvironmentReader = (name) => process.env[name];

function normalizedValue(
  read: EnvironmentReader,
  name: string,
): string | undefined {
  const value = read(name)?.trim();
  return value || undefined;
}

export function getStripeServerKey(
  scope: StripeKeyScope,
  options: {
    required?: boolean;
    read?: EnvironmentReader;
  } = {},
): string | undefined {
  const read = options.read || processEnvironment;
  const nodeEnv = normalizedValue(read, 'NODE_ENV') || process.env.NODE_ENV;
  const key =
    normalizedValue(read, SCOPED_KEY_NAMES[scope]) ||
    normalizedValue(read, 'STRIPE_RESTRICTED_KEY') ||
    normalizedValue(read, 'STRIPE_SECRET_KEY');

  if (!key) {
    if (nodeEnv === 'test') return 'sk_test_mock';
    if (options.required === false) return undefined;
    throw new Error(
      `A server-side Stripe key is required for the ${scope} integration`,
    );
  }

  const isRestrictedLiveKey = key.startsWith('rk_live_');
  const isAnyLiveKey = isRestrictedLiveKey || key.startsWith('sk_live_');
  const isSupportedKey =
    isAnyLiveKey || key.startsWith('rk_test_') || key.startsWith('sk_test_');

  if (!isSupportedKey) {
    throw new Error(
      `The configured Stripe ${scope} key has an unsupported prefix`,
    );
  }

  if (nodeEnv === 'production' && !isRestrictedLiveKey) {
    throw new Error(
      `Production Stripe ${scope} access requires a restricted live key with the rk_live_ prefix`,
    );
  }

  if (
    isAnyLiveKey &&
    nodeEnv !== 'production' &&
    normalizedValue(read, 'STRIPE_ALLOW_LIVE_MODE') !== 'true'
  ) {
    throw new Error(
      'Live Stripe keys are blocked outside production. Set STRIPE_ALLOW_LIVE_MODE=true only for an intentional live-mode run.',
    );
  }

  return key;
}

export function getStripePublishableKey(
  serverKey: string,
  read: EnvironmentReader = processEnvironment,
): string {
  const publishableKey = normalizedValue(read, 'STRIPE_PUBLISHABLE_KEY');
  const nodeEnv = normalizedValue(read, 'NODE_ENV') || process.env.NODE_ENV;

  if (!publishableKey) {
    if (nodeEnv === 'test') return 'pk_test_mock';
    throw new Error('STRIPE_PUBLISHABLE_KEY is required');
  }

  const serverIsLive =
    serverKey.startsWith('rk_live_') || serverKey.startsWith('sk_live_');
  const expectedPrefix = serverIsLive ? 'pk_live_' : 'pk_test_';
  if (!publishableKey.startsWith(expectedPrefix)) {
    throw new Error(
      `STRIPE_PUBLISHABLE_KEY must use the ${expectedPrefix} prefix to match the server key mode`,
    );
  }

  return publishableKey;
}

export function getStripeWebhookSecret(
  scope: StripeKeyScope,
  options: {
    required?: boolean;
    read?: EnvironmentReader;
  } = {},
): string | undefined {
  const read = options.read || processEnvironment;
  const nodeEnv = normalizedValue(read, 'NODE_ENV') || process.env.NODE_ENV;
  const scopedSecret = normalizedValue(read, SCOPED_WEBHOOK_NAMES[scope]);
  const legacySecret = normalizedValue(read, 'STRIPE_WEBHOOK_SECRET');
  // Prefer scoped secrets when set; otherwise use the single shared whsec.
  const secret = scopedSecret || legacySecret;

  if (!secret) {
    if (nodeEnv === 'test') return 'whsec_test_mock';
    if (options.required === false) return undefined;
    throw new Error(
      `${SCOPED_WEBHOOK_NAMES[scope]} or STRIPE_WEBHOOK_SECRET is required`,
    );
  }

  if (!secret.startsWith('whsec_')) {
    throw new Error('Stripe webhook secret must start with whsec_');
  }

  return secret;
}
