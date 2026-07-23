# Stripe setup (simple: rk + sk + pk + one whsec)

Gleezip is configured for **four** Stripe backend values:

| Variable | Prefix | Who uses it |
| --- | --- | --- |
| `STRIPE_RESTRICTED_KEY` | `rk_live_` (prod) / `rk_test_` (dev) | Backend — preferred server key |
| `STRIPE_SECRET_KEY` | `sk_live_` / `sk_test_` | Backend — fallback if restricted key unset |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_` / `pk_test_` | Backend (returned to app for SetupIntent) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_` | Backend — one signing secret for all Stripe webhooks |

Mobile production build only:

```env
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Never put `rk_`, `sk_`, or `whsec_` in the mobile app.

## Production rules

- `NODE_ENV=production`
- `STRIPE_RESTRICTED_KEY` must be `rk_live_...` (unrestricted `sk_live_` alone is rejected)
- Publishable key must be `pk_live_...` to match
- `STRIPE_ALLOW_LIVE_MODE` stays unset/false in normal deploys

## Webhook URL(s)

Point your Stripe webhook(s) at the public API. With one `whsec`, you can use one endpoint that receives the events you need, or reuse the same signing secret if Stripe gives you one endpoint for now:

- `https://YOUR_API_HOST/api/payments/webhook`
- `https://YOUR_API_HOST/api/wallet/connect-webhook`
- `https://YOUR_API_HOST/api/verification/identity/webhook` (if using Identity)

Later you can split into separate `whsec` values per endpoint if you want stricter isolation.

## DevOps replace list

```env
STRIPE_RESTRICTED_KEY=rk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```
