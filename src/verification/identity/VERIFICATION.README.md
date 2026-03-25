# Identity Verification Documentation

This module handles identity verification for the Ride and Park application using **Stripe Identity**. Users upload government-issued documents (driving license or passport) to verify their identity.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Endpoints](#endpoints)
4. [Webhook Setup](#webhook-setup)
5. [Environment Variables](#environment-variables)
6. [Verification Flow](#verification-flow)
7. [Document Types](#document-types)
8. [Testing](#testing)
9. [Security](#security)
10. [Common Issues](#common-issues)

---

## Overview

Identity verification uses **Stripe Identity** to verify users through government-issued documents. This is a critical requirement for:

- **Drivers**: Must verify with a UK driving license
- **Parking Hosts**: Can verify with either driving license or passport
- **General Users**: Must also verify to increases trust

### Why Stripe Identity?

✅ Automated document verification  
✅ Live photo capture (prevents fake documents)  
✅ Selfie matching (prevents impersonation)  
✅ PCI compliant  
✅ Global document support  
✅ Real-time webhook notifications

---

## Features

- ✅ **Create verification sessions** with Stripe
- ✅ **Document upload** (driving license, passport)
- ✅ **Live photo capture** (selfie)
- ✅ **Selfie matching** (matches photo to document)
- ✅ **Real-time webhook updates** from Stripe
- ✅ **Persistent verification status** in database
- ✅ **Driving license detection** (required for drivers)
- ✅ **Automatic data extraction** (name, DOB, license number)

---

## Endpoints

### 1. Create Verification Session

**Endpoint:** `POST /verification/identity/create-session`

**Authentication:** Required (JWT token)

**Request Body:**

```json
{
  "returnUrl": "http://localhost:3000/verification/complete"
}
```

**Validation Rules:**

- `returnUrl`: Must be valid frontend URL format, required. It is where user will go after verification.
- Must be authenticated user
- User must not be already verified
- Also user with ID verified can aslso re-verify if he want to become driver 

**Success Response (200 OK):**

```json
{
  "success": true,
  "sessionId": "vs_1QNqYX2eZvKYlo2C8H7zg123",
  "url": "https://verify.stripe.com/start/test_YWNjdF8xUU5...",
  "clientSecret": "vs_1QNqYX2eZvKYlo2C8H7zg123_secret_abc123",
  "message": "Verification session created"
}
```

**What happens next:**

1. Frontend receives the `url`
2. User is redirected to Stripe's verification page
3. User uploads documents and takes selfie
4. Stripe processes verification
5. Webhook fires to update our database
6. User is redirected to `returnUrl`

**Error Responses:**

**Unauthorized (401):**

```json
{
  "statusCode": 401,
  "message": "Authorization header is missing or invalid",
  "error": "Unauthorized"
}
```

**Already Verified (400):**

```json
{
  "statusCode": 400,
  "message": "Identity already verified",
  "error": "Bad Request"
}
```

**Invalid Return URL (400):**

```json
{
  "statusCode": 400,
  "message": ["returnUrl must be a URL address"],
  "error": "Bad Request"
}
```

---

### 2. Check Verification Status

**Endpoint:** `GET /verification/identity/status`

**Authentication:** Required (JWT token)

**Success Response (Verified):**

```json
{
  "success": true,
  "isVerified": true,
  "details": {
    "idType": "driving_license",
    "verifiedName": "John Smith",
    "verifiedDOB": "1990-05-15",
    "licenseNumber": "SMITH905156JD9XX",
    "verifiedAt": "2025-12-06T14:30:00.000Z"
  }
}
```

**Success Response (Not Verified):**

```json
{
  "success": true,
  "isVerified": false,
  "details": null
}
```

**Success Response (Pending):**

```json
{
  "success": true,
  "isVerified": false,
  "status": "processing",
  "message": "Verification is being processed"
}
```

---

### 3. Check Driving License Status

**Endpoint:** `GET /verification/identity/has-license`

**Authentication:** Required (JWT token)

**Purpose:** Checks if user verified with driving license (required for driver role)

**Success Response (Has License):**

```json
{
  "success": true,
  "hasDrivingLicense": true,
  "message": "User verified with driving license"
}
```

**Success Response (Passport Only):**

```json
{
  "success": true,
  "hasDrivingLicense": false,
  "message": "User verified with passport. Please re-verify with driving license to become a driver."
}
```

---

### 4. Webhook Endpoint

**Endpoint:** `POST /verification/identity/webhook`

**Authentication:** Stripe signature verification

**Headers:**

- `stripe-signature`: Signature from Stripe (required)

**Purpose:** Receives real-time updates from Stripe when verification completes

**⚠️ IMPORTANT:** This endpoint should ONLY be called by Stripe. See [Webhook Setup](#webhook-setup) section.

**Success Response:**

```json
{
  "received": true
}
```

---

## Webhook Setup

Webhooks are critical for identity verification. When a user completes verification on Stripe, a webhook is sent to your backend to update the database.

### Local Development Setup (Stripe CLI)

#### 1. Install Stripe CLI

**macOS (Homebrew):**

```bash
brew install stripe/stripe-cli/stripe
```

**Windows:**

Download from: https://github.com/stripe/stripe-cli/releases/latest

**Linux:**

```bash
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.4/stripe_1.19.4_linux_x86_64.tar.gz
tar -xvf stripe_1.19.4_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin
```

#### 2. Login to Stripe

```bash
stripe login
```

This opens your browser to authorize the CLI.

#### 3. Forward Webhooks to Localhost

```bash
stripe listen --forward-to localhost:5000/verification/identity/webhook
```

**Output:**

```
> Ready! Your webhook signing secret is whsec_abc123xyz... (^C to quit)
```

#### 4. Update `.env` with Webhook Secret

Copy the webhook secret from the output above:

```env
STRIPE_WEBHOOK_SECRET=whsec_abc123xyz...
```

#### 5. Test Webhook

In another terminal:

```bash
stripe trigger identity.verification_session.verified
```

You should see the webhook received in your backend logs.

#### 6. Keep Stripe CLI Running

While developing, keep the `stripe listen` command running in a terminal. This forwards all webhooks to your local backend.

---

### Production Webhook Setup

#### 1. Add Webhook in Stripe Dashboard

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **Webhooks**
3. Click **Add endpoint**
4. Enter your webhook URL:
   ```
   https://api.rideandpark.com/verification/identity/webhook
   ```
5. Select events to listen to:
   - `identity.verification_session.verified`
   - `identity.verification_session.requires_input`
   - `identity.verification_session.processing`
   - `identity.verification_session.canceled`
6. Click **Add endpoint**

#### 2. Get Webhook Signing Secret

1. After creating the endpoint, click on it
2. Click **Reveal** under "Signing secret"
3. Copy the secret (starts with `whsec_`)

#### 3. Add to Production Environment

Add to your production server's environment variables:

```env
STRIPE_WEBHOOK_SECRET=whsec_your_production_secret_here
```

#### 4. Test Production Webhook

1. In Stripe Dashboard, go to your webhook endpoint
2. Click **Send test webhook**
3. Select `identity.verification_session.verified`
4. Check your backend logs to confirm receipt

---

### Webhook Events

The webhook endpoint listens for these Stripe events:

| Event                                           | Description                          | Action                               |
| ----------------------------------------------- | ------------------------------------ | ------------------------------------ |
| `identity.verification_session.verified`        | Verification successful              | Update user status, save data        |
| `identity.verification_session.requires_input`  | User needs to retry                  | Log for debugging                    |
| `identity.verification_session.processing`      | Verification in progress             | Log status update                    |
| `identity.verification_session.canceled`        | User canceled verification           | Log cancellation                     |

**Current Implementation:** Only `verified` event updates the database. Others are logged.

---

## Environment Variables

Add these to your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# JWT Configuration (for authentication)
JWT_SECRET=your_jwt_secret_here
```

### How to Get Stripe Keys

#### Test Mode (Development)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)
2. Click **Developers** → **API keys**
3. Copy **Secret key** (starts with `sk_test_`)
4. Add to `.env` as `STRIPE_SECRET_KEY`

#### Live Mode (Production)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Toggle to **Live mode** (top right)
3. Copy **Secret key** (starts with `sk_live_`)
4. Add to production environment as `STRIPE_SECRET_KEY`

**⚠️ NEVER commit `.env` to version control!**

---

## Verification Flow

### Step-by-Step Process

```
┌─────────────────────────────────────────────────────────────────┐
│  1. USER INITIATES VERIFICATION                                 │
│     POST /verification/identity/create-session                  │
│     { "returnUrl": "https://app.example.com/complete" }         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. BACKEND CREATES STRIPE SESSION                              │
│     - Calls Stripe API                                          │
│     - Gets verification URL                                     │
│     - Returns URL to frontend                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. USER REDIRECTED TO STRIPE                                   │
│     - Opens Stripe verification page                            │
│     - Uploads document (license or passport)                    │
│     - Takes live selfie                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. STRIPE PROCESSES VERIFICATION                               │
│     - Validates document authenticity                           │
│     - Checks for tampering                                      │
│     - Matches selfie to document photo                          │
│     - Extracts data (name, DOB, document number)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. STRIPE SENDS WEBHOOK                                        │
│     POST /verification/identity/webhook                         │
│     { "type": "identity.verification_session.verified", ... }   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. BACKEND UPDATES DATABASE                                    │
│     - Verifies webhook signature                                │
│     - Fetches verification data from Stripe                     │
│     - Saves to IdentityVerification collection                  │
│     - Updates User.isVerified.identity = true                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. USER REDIRECTED BACK                                        │
│     - Stripe redirects to returnUrl                             │
│     - Frontend shows success message                            │
│     - User can now access verified-only features                │
└─────────────────────────────────────────────────────────────────┘
```

### Frontend Integration Example

```typescript
// 1. Create verification session
const createVerification = async () => {
  const response = await fetch('/verification/identity/create-session', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      returnUrl: window.location.origin + '/verification/complete'
    })
  });

  const data = await response.json();
  
  // 2. Redirect user to Stripe
  window.location.href = data.url;
};

// 3. Handle return from Stripe (on /verification/complete page)
const checkVerificationStatus = async () => {
  const response = await fetch('/verification/identity/status', {
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  });

  const data = await response.json();
  
  if (data.isVerified) {
    showSuccess('Identity verified!');
  } else {
    showError('Verification failed or pending');
  }
};
```

---

## Document Types

### Accepted Documents

| Document Type     | Code              | Required for Drivers | Extracted Data                       |
| ----------------- | ----------------- | -------------------- | ------------------------------------ |
| UK Driving License | `driving_license` | ✅ Yes               | Name, DOB, License Number           |
| Passport          | `passport`        | ❌ No                | Name, DOB, Passport Number          |

### Driving License Requirements

To become a **driver** in the Ride and Park platform:

1. Must verify identity with **UK driving license**
2. Passport verification is **not sufficient**
3. License must be valid (not expired)
4. Must match selfie photo

**Why driving license is required:**

- Confirms user can legally drive in the UK
- Required for insurance purposes
- DVLA and MOT integration for driver verification (coming soon)

### Passport Verification

Users can verify with a passport for:

- General identity verification
- Parking host accounts
- Increased trust badge

**Passport verified users cannot:**

- Become drivers (must re-verify with license)
- Access driver-only features

**To upgrade passport → license:**

1. User creates new verification session
2. Uploads driving license this time
3. System updates `idType` to `driving_license`
4. User can now become a driver

---

## Testing

### Run Tests

```bash
# Run all identity verification tests
npm test -- verification/identity

# Run specific test file
npm test -- verification.controller.spec.ts
npm test -- verification.service.spec.ts
npm test -- stripe-identity.service.spec.ts

# Run with coverage
npm run test:cov
```

### Manual Testing with REST Client

Use `.rests/identity-verification.rest` with VS Code REST Client extension.

#### Test Flow 1: Complete Verification

```http
### 1. Create session
POST http://localhost:5000/verification/identity/create-session
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "returnUrl": "http://localhost:3000/verification/complete"
}

### 2. Open the URL from response in browser
### 3. Upload document and take selfie
### 4. Wait for webhook (automatic)
### 5. Check status
GET http://localhost:5000/verification/identity/status
Authorization: Bearer <your-token>
```

#### Test Flow 2: Check License Requirement

```http
### After verification with passport
GET http://localhost:5000/verification/identity/has-license
Authorization: Bearer <your-token>

### Expected: hasDrivingLicense = false
```

### Testing Webhooks Locally

#### Option 1: Stripe CLI (Recommended)

```bash
# Terminal 1: Start your backend
npm run start:dev

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:5000/verification/identity/webhook

# Terminal 3: Trigger test webhook
stripe trigger identity.verification_session.verified
```

#### Option 2: Manual Testing

```bash
# Get your webhook secret from Stripe CLI output
export WEBHOOK_SECRET="whsec_abc123..."

# Use curl to test webhook
curl -X POST http://localhost:5000/verification/identity/webhook \
  -H "stripe-signature: $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_test",
    "type": "identity.verification_session.verified",
    "data": {
      "object": {
        "id": "vs_test_123",
        "status": "verified"
      }
    }
  }'
```

### Test Mode vs Live Mode

**Test Mode (Development):**

- Use test API keys (`sk_test_...`)
- Use test documents (Stripe provides test document images)
- Webhooks work with Stripe CLI
- No real verification happens
- Free to use

**Live Mode (Production):**

- Use live API keys (`sk_live_...`)
- Real documents required
- Real identity checks
- Costs money (see Stripe pricing)
- Production webhooks required

---

## Security

### Webhook Signature Verification

**Why it's critical:**

- Prevents unauthorized webhook calls
- Ensures webhooks are from Stripe
- Protects against replay attacks

**How it works:**

1. Stripe signs each webhook with your secret
2. Backend verifies signature before processing
3. Invalid signatures are rejected

**⚠️ NEVER disable signature verification in production!**

### Data Storage

**What we store:**

- Verification status (verified/pending/failed)
- Document type (driving_license/passport)
- Extracted data (name, DOB, document number)
- Stripe session ID (for reference)

**What we DON'T store:**

- Document images (stored by Stripe)
- Selfie photos (stored by Stripe)
- Full document details (only extracted data)

### PCI Compliance

Stripe Identity is PCI compliant:

- Documents encrypted at rest
- Secure transmission (HTTPS only)
- Access controls enforced
- Audit logs maintained

### Best Practices

✅ **DO:**

- Use HTTPS in production
- Verify webhook signatures
- Rotate API keys regularly
- Monitor for suspicious activity
- Use environment variables for secrets
- Implement rate limiting
- Log all verification attempts

❌ **DON'T:**

- Commit API keys to Git
- Disable signature verification
- Store document images
- Share API keys
- Use test keys in production
- Log sensitive data

---

## Common Issues

### Issue: Webhook Not Received

**Symptoms:**

- User completes verification
- Status not updated in database
- No logs showing webhook received

**Causes & Solutions:**

**Local Development:**

1. **Stripe CLI not running**
   ```bash
   # Start Stripe CLI
   stripe listen --forward-to localhost:5000/verification/identity/webhook
   ```

2. **Wrong webhook URL**
   ```bash
   # Check URL matches your backend
   stripe listen --forward-to localhost:5000/verification/identity/webhook
   ```

3. **Backend not running**
   ```bash
   npm run start:dev
   ```

**Production:**

1. **Webhook not configured in Stripe Dashboard**
   - Go to Developers → Webhooks
   - Add endpoint: `https://api.yourapp.com/verification/identity/webhook`
   - Select events: `identity.verification_session.*`

2. **Wrong webhook secret**
   - Get secret from Stripe Dashboard
   - Update `STRIPE_WEBHOOK_SECRET` in production env

3. **Firewall blocking webhooks**
   - Whitelist Stripe IPs
   - Check server logs for blocked requests

---

### Issue: "Invalid webhook signature"

**Cause:** Webhook secret mismatch

**Solution:**

```bash
# Get correct secret
stripe listen --print-secret

# Or from Stripe Dashboard:
# Developers → Webhooks → Your endpoint → Reveal signing secret

# Update .env
STRIPE_WEBHOOK_SECRET=whsec_correct_secret_here

# Restart backend
npm run start:dev
```

---

### Issue: Verification Session Expired

**Symptoms:**

- User gets "Session expired" error on Stripe page

**Cause:** User waited too long (30+ days)

**Solution:**

User must create a new session:

```http
POST /verification/identity/create-session
{
  "returnUrl": "http://localhost:3000/verification/complete"
}
```

---

### Issue: "User already verified"

**Symptoms:**

- Cannot create new session
- Error: "Identity already verified"

**Cause:** User has already completed verification

**Solution:**

This is **not an error** - user is already verified. To re-verify:

1. Admin must manually clear verification status
2. Or user can contact support

---

### Issue: Documents Not Accepted

**Common reasons Stripe rejects documents:**

1. **Document expired**
2. **Document not clear** (blurry, dark)
3. **Document not supported** (e.g., non-UK license)
4. **Selfie doesn't match** document photo
5. **Document tampered** or fake

**Solution for users:**

- Use clear, well-lit photos
- Ensure document is valid
- Make sure selfie matches ID photo
- Use original document (not photocopy)

---

### Issue: Development Webhook Secret Not Working

**Cause:** Using production webhook secret in development

**Solution:**

```bash
# Use Stripe CLI for local development
stripe listen --forward-to localhost:5000/verification/identity/webhook

# Copy the whsec_... from output
# Update .env with LOCAL webhook secret
```

**Key Point:** Local and production webhook secrets are **different**.

---

## Production Checklist

Before deploying to production:

- [ ] Use live Stripe API keys (`sk_live_...`)
- [ ] Configure production webhook in Stripe Dashboard
- [ ] Update `STRIPE_WEBHOOK_SECRET` with production secret
- [ ] Test webhook with "Send test webhook" in Stripe Dashboard
- [ ] Enable HTTPS for webhook endpoint
- [ ] Set up monitoring/alerts for failed verifications
- [ ] Implement rate limiting on verification endpoint
- [ ] Add logging for all verification attempts
- [ ] Test with real documents in test mode first
- [ ] Train support team on verification issues
- [ ] Create user documentation for verification process
- [ ] Set up Stripe billing (pay for verification usage)

---

## Cost & Limits

### Stripe Identity Pricing

- **Verification:** $1.50 per successful verification
- **Failed verifications:** Free
- **Abandoned sessions:** Free

See: https://stripe.com/pricing#identity

### Rate Limits

- No explicit rate limits on our endpoints
- Stripe has internal rate limits (thousands/second)
- Recommend client-side rate limiting (1 session/user/hour)

---

## Future Enhancements

- [ ] DVLA integration for license validation
- [ ] MOT check integration for drivers
- [ ] Re-verification flow for expired documents
- [ ] Admin dashboard for manual review
- [ ] Verification status webhooks to frontend (WebSocket)
- [ ] Multi-document support (license + insurance)
- [ ] Age verification for specific features
- [ ] Verification reminder emails

---

## API Reference

Complete API documentation: [Stripe Identity Docs](https://stripe.com/docs/identity)

---

## Support

**Stripe Identity Issues:**

- [Stripe Support](https://support.stripe.com)
- [Stripe Status Page](https://status.stripe.com)

**Ride and Park Issues:**

- Email: info@amatip.co.uk
- GitHub: [Issue Tracker](https://github.com/war-riz/ride_and_park_backend/issues)

---

**Last Updated:** December 10, 2025  
**Author:** [war-riz](https://github.com/war-riz)  
**Feature:** Identity Verification with Stripe  
**Branch:** `feature/identity-verification`