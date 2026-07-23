# Phase 4 operations and recovery

## Security controls

- Sensitive routes use authentication plus role/ownership checks. Bulk booking auto-completion and the admin active-ride feed are admin-only.
- Login, registration, OTP, wallet, withdrawal, booking-payment, ride-request, and dispute mutation routes have fixed-window rate limits.
- Production CORS requires an explicit `CORS_ORIGINS` allowlist; wildcard production CORS fails at startup.
- Global validation rejects unknown fields. Payment amounts, bank details, auth payloads, and dispute actions have bounded DTO validation.
- The rate limiter is process-local. A shared Redis-backed limiter is required before running more than one API instance in Phase 5.

## Operational visibility

- Every HTTP response has an `x-request-id`. Logs are JSON-shaped and include route, status, duration, request ID, and authenticated user ID; bodies, credentials, and card data are excluded.
- `GET /api/admin/analytics/operations` exposes in-process request/error/latency counters.
- `GET /api/admin/analytics/queue-health` exposes failed/stuck webhooks, recovering withdrawals, and disputed/refunded earnings.
- Alert when `failedWebhooks`, `stuckWebhooks`, or `disputedEarnings` is non-zero; alert when a route's 5xx ratio exceeds 2% or its average latency exceeds the agreed SLO.
- Metrics reset when the process restarts. Phase 5 should export them to the production metrics platform and configure durable alerts.

## Withdrawal reconciliation

`WithdrawalRecoveryTask` runs every ten minutes. It selects withdrawals stuck for more than five minutes in `transferring`, `transfer_failed`, `transferred`, or `payout_pending`.

- A four-minute database lease prevents duplicate work across app instances.
- Stripe transfer and payout idempotency keys make retries safe.
- Pending payouts are retrieved from Stripe and reconciled with the local transaction.
- Retries use bounded exponential backoff and stop after five attempts.
- An administrator can use the existing withdrawal approval action to retry after correcting a connected-account or bank issue.

Never manually mark a withdrawal `paid`; `payout.paid` or a retrieved Stripe payout with status `paid` is the source of truth.

## Webhook recovery

- Webhook IDs are unique per provider, so a replay cannot apply the same event twice.
- Failed events and `processing` events older than five minutes can be reclaimed on Stripe replay.
- Use the Stripe Dashboard to replay the original event after correcting the cause. Confirm queue health returns to zero.
- Payment disputes mark related provider earnings `disputed` or `refunded` and raise the queue-health alert. Provider-balance recovery remains an explicit finance/admin action; it is not automatically debited without review.

## Refund and dispute workflow

1. A customer files a dispute linked to a ride or booking.
2. An administrator investigates and selects `issue_refund` with an amount.
3. The backend verifies the service belongs to the filer and has a stored successful PaymentIntent.
4. The amount is capped at the original service price.
5. Stripe receives an idempotent refund request (`dispute:<id>:refund`).
6. The Stripe refund ID and amount are stored on the dispute and included in the audit trail.

Do not credit an internal wallet as a substitute for a card refund.

## Index and slow-query review

New queue indexes cover webhook status/age, withdrawal status/recovery schedule, unique connected-account IDs, and payment IDs. Before launch, apply schema indexes in staging and verify them:

```javascript
db.webhookevents.getIndexes()
db.transactions.getIndexes()
db.wallets.getIndexes()
db.rides.getIndexes()
db.bookingrequests.getIndexes()
```

Profile staging only, during a controlled window:

```javascript
db.setProfilingLevel(1, { slowms: 200, sampleRate: 0.1 })
db.system.profile.find({ millis: { $gte: 200 } }).sort({ ts: -1 }).limit(50)
db.setProfilingLevel(0)
```

Use `explain('executionStats')` for any repeated slow query. Require an indexed plan and avoid large `COLLSCAN`, blocking sorts, or returning full documents when only counts/IDs are needed. Index application and production backfills remain Phase 5 deployment work.

## Jest lifecycle

SMTP verification no longer runs as a constructor side effect. It is opt-in with `SMTP_VERIFY_ON_STARTUP=true` and is disabled during tests, eliminating the open DNS/socket handle and post-test logging warning.
