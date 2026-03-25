# Verification Module Documentation

This module handles all user verification processes for the Ride and Park application, including email, phone, identity, driver, and parking space verification.

## Table of Contents

1. [Email Verification](#email-verification)
2. [Module Structure](#module-structure)
3. [Environment Variables](#environment-variables)
4. [Email Templates](#email-templates)
5. [Testing](#testing)

---

## Email Verification

Email verification uses a 6-digit OTP (One-Time Password) sent via Gmail SMTP.

### Features

- ✅ 6-digit OTP generation
- ✅ 10-minute expiration
- ✅ Rate limiting (1 request per minute)
- ✅ Handlebars email templates
- ✅ Welcome email after verification
- ✅ Secure OTP storage (excluded from queries)

---

## Endpoints

### 1. Send Email OTP (Verification)

**Endpoint:** `POST /verification/send-email-otp-verification`

**Authentication:** Not required

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Validation Rules:**

- `email`: Must be valid email format
- `email`: Required

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "OTP sent successfully to your email",
  "expiresIn": "10 minutes"
}
```

**Error Responses:**

**User Not Found (404):**

```json
{
  "statusCode": 404,
  "message": "User not found with this email",
  "error": "Not Found"
}
```

**Already Verified (400):**

```json
{
  "statusCode": 400,
  "message": "Email is already verified",
  "error": "Bad Request"
}
```

**Rate Limited (400):**

```json
{
  "statusCode": 400,
  "message": "Please wait 45 seconds before requesting a new OTP",
  "error": "Bad Request"
}
```

**Invalid Email Format (400):**

```json
{
  "statusCode": 400,
  "message": ["Invalid email format"],
  "error": "Bad Request"
}
```

---

### 2. Verify Email OTP (Verification)

**Endpoint:** `POST /verification/verify-email-otp-verification`

**Authentication:** Not required

**Request Body:**

```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Validation Rules:**

- `email`: Must be valid email format, required
- `otp`: Must be exactly 6 digits, required

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Email verified successfully",
  "isVerified": true
}
```

**Side Effects:**

- Updates `User.isVerified.email` to `true`
- Clears OTP from database
- Sends welcome email (async, non-blocking)

**Error Responses:**

**Invalid OTP (400):**

```json
{
  "statusCode": 400,
  "message": "Invalid OTP. Please check and try again",
  "error": "Bad Request"
}
```

**Expired OTP (400):**

```json
{
  "statusCode": 400,
  "message": "OTP has expired. Please request a new one",
  "error": "Bad Request"
}
```

**No OTP Found (400):**

```json
{
  "statusCode": 400,
  "message": "No OTP found. Please request a new OTP",
  "error": "Bad Request"
}
```

**User Not Found (404):**

```json
{
  "statusCode": 404,
  "message": "User not found with this email",
  "error": "Not Found"
}
```

**OTP Not 6 Digits (400):**

```json
{
  "statusCode": 400,
  "message": ["OTP must be exactly 6 digits"],
  "error": "Bad Request"
}
```

---

### 3. Send Email OTP (Login)

**Endpoint:** `POST /verification/send-email-otp-login`

**Authentication:** Not required

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Purpose:** Sends a one-time code for passwordless login. Email verification is not enforced here (token issued after OTP match).

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "OTP sent successfully to your email",
  "expiresIn": "10 minutes"
}
```

**Error Responses:**

- `404 User not found`
- `400 Please wait X seconds...` (rate limit)

---

### 3b. Resend Email OTP (Login)

**Endpoint:** `POST /verification/resend-email-otp-login`

**Authentication:** Not required

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Purpose:** Resends a login OTP if the user opted into OTP-for-login and recently signed in.

---

### 4. Verify Email OTP (Login)

**Endpoint:** `POST /verification/verify-email-otp-login`

**Authentication:** Not required

**Request Body:**

```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Purpose:** Confirms the login OTP and issues a JWT plus user profile. Does **not** change the email verification flag.

**Success Response (200 OK):**

```json
{
  "success": true,
  "requiresOTP": false,
  "token": "<jwt-token>",
  "data": {
    "_id": "...",
    "firstName": "John",
    "lastName": "Doe",
    "username": "johndoe",
    "email": "john@example.com",
    "phoneNumber": "+1234567890",
    "role": "user"
  },
  "message": "Login successful"
}
```

**Error Responses:**

- `400 Invalid/Expired/No OTP`
- `404 User not found`

---

### 5. Check Email Verification Status

**Endpoint:** `GET /verification/email-status?email=user@example.com`

**Authentication:** Not required

**Query Parameters:**

- `email` (required): User's email address

**Success Response (200 OK):**

```json
{
  "success": true,
  "isVerified": true,
  "email": "user@example.com"
}
```

**Error Response:**

**User Not Found (404):**

```json
{
  "statusCode": 404,
  "message": "User not found with this email",
  "error": "Not Found"
}
```

---

## OTP Logic

### Generation

- 6 random digits (0-9)
- Generated using `otp-generator` package
- Example: `123456`, `987654`

### Storage

```typescript
User.otpStorage.emailOtp = {
  code: "123456",
  expiresAt: Date (10 minutes from now)
}
```

**Security:**

- `otpStorage` field has `select: false` (not returned in queries)
- Must explicitly select with `.select('+otpStorage')` to access

### Expiration

- OTP valid for **10 minutes** from generation
- Expired OTPs are automatically cleared when verification is attempted
- Formula: `expiresAt = Date.now() + 10 * 60 * 1000`

### Rate Limiting

- **1 OTP per minute** per email
- If OTP sent less than 1 minute ago, request is rejected
- Prevents spam and abuse

**Rate Limit Calculation:**

```typescript
const lastOtpTime = expiresAt - 10 minutes;
const timeSinceLastOtp = now - lastOtpTime;
if (timeSinceLastOtp < 1 minute) {
  throw BadRequestException("Please wait X seconds");
}
```

### Verification Flow

1. User requests OTP → OTP generated & stored → Email sent
2. User receives email → Enters OTP in app
3. Backend verifies OTP → Clears OTP → Marks email as verified → Sends welcome email

---

## Module Structure

```
verification
├─ dto
│  ├─ send-email-otp.dto.ts             # { email }
│  └─ verify-email-otp.dto.ts           # { email, otp }
├─ email
│  ├─ verification.controller.spec.ts   # EMAIL API endpoints
│  ├─ verification.controller.ts        # Controller tests
│  ├─ VERIFICATION.README.md            # This file
│  ├─ verification.service.spec.ts      # Service tests
│  └─ verification.service.ts           # Business logic
├─ guards                               # (Future: identity, driver, parking guards)
├─ services
│  ├─ email.service.ts                  # Gmail SMTP with Handlebars
│  └─ email.service.spec.ts             # Tests
└─ verification.module.ts               # Module configuration
```

---

## Environment Variables

Add these to your `.env` file:

```env
# Gmail SMTP Configuration
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password
```

### How to Get Gmail App Password

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (if not already enabled)
3. Go to **App passwords** (search for it in settings)
4. Select **Mail** and **Other (Custom name)**
5. Enter "Ride and Park Backend"
6. Copy the 16-character password
7. Paste into `.env` as `GMAIL_APP_PASSWORD`

**Note:** Never commit `.env` file to version control!

---

## Email Templates

Email templates use Handlebars and are located in `src/email/templates/`.

### Template Structure

```
email/templates/
├── layouts/
│   └── main.hbs               # Main layout wrapper
├── partials/
│   ├── header.hbs             # Email header
│   └── footer.hbs             # Email footer
├── otp.hbs                    # OTP verification email
└── welcome.hbs                # Welcome email
```

### Layout System

All emails use the same layout (`main.hbs`) which includes:

- Responsive design
- Header (customizable colors/text)
- Footer (year, contact info)
- Body content (injected from templates)

**Example:**

```handlebars
{{!-- Header is a partial --}}
{{> header}}

{{!-- Body content from specific template --}}
{{{body}}}

{{!-- Footer is a partial --}}
{{> footer}}
```

### OTP Email Template (`otp.hbs`)

**Dynamic Data:**

```typescript
{
  otp: "123456",
  subject: "Email Verification - Ride and Park",
  headerGradient: "linear-gradient(...)",
  year: 2025,
  contactEmail: "support@rideandpark.com"
}
```

**Visual Features:**

- Large OTP display (36px, letter-spaced)
- Expiration notice (10 minutes)
- Security warnings
- Responsive design

### Welcome Email Template (`welcome.hbs`)

**Dynamic Data:**

```typescript
{
  firstName: "John",
  subject: "Welcome to Ride and Park! 🎉",
  year: 2025
}
```

**Content:**

- Personalized greeting
- Platform features overview
- Call-to-action button

### Adding New Templates

1. Create `.hbs` file in `src/email/templates/`
2. Use layout system: content only, header/footer automatic
3. Call via `EmailService.sendTemplateEmail()`:

```typescript
await emailService.sendTemplateEmail(email, 'Your Subject', 'template-name', {
  customData: 'value',
});
```

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
# Verification service tests
npm test -- verification.service.spec.ts

# Email service tests
npm test -- email.service.spec.ts

# Controller tests
npm test -- verification.controller.spec.ts
```

### Test Coverage

```bash
npm run test:cov
```

### Manual Testing with REST Client

Use `.rests/email-verification.rest` with the VS Code REST Client extension.

**Verification Flow:**

```http
### 1. Send OTP
POST http://localhost:5000/verification/send-email-otp-verification
Content-Type: application/json

{
  "email": "test@example.com"
}

### 2. Check email for OTP (or see console logs in dev)

### 3. Verify OTP
POST http://localhost:5000/verification/verify-email-otp-verification
Content-Type: application/json

{
  "email": "test@example.com",
  "otp": "123456"
}

### 4. Check status
GET http://localhost:5000/verification/email-status?email=test@example.com
```

**Login Flow:**

```http
### 1. Send OTP
POST http://localhost:5000/verification/send-email-otp-login
Content-Type: application/json

{
  "email": "loginuser@example.com"
}

### 2. Verify OTP
POST http://localhost:5000/verification/verify-email-otp-login
Content-Type: application/json

{
  "email": "loginuser@example.com",
  "otp": "123456"
}
```

---

## Common Issues

### Issue: Email Not Sending

**Cause:** Invalid Gmail credentials

**Solution:**

1. Verify `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env`
2. Check console logs for initialization errors
3. Ensure 2-Step Verification is enabled on Google Account
4. Regenerate app password if needed

---

### Issue: "Email template not found"

**Cause:** Missing `.hbs` template file

**Solution:**

1. Check file exists: `src/email/templates/[template-name].hbs`
2. Check layout exists: `src/email/templates/layouts/main.hbs`
3. Verify file name matches (case-sensitive)

---

### Issue: OTP Expired Immediately

**Cause:** Server time incorrect

**Solution:**

1. Check server time: `date`
2. Sync time if needed: `sudo ntpdate -s time.nist.gov`
3. Verify timezone settings

---

### Issue: Rate Limit Too Strict

**Cause:** Testing with frequent requests

**Solution:**

1. Wait 1 minute between requests
2. Use different email addresses for testing
3. Adjust rate limit in service (development only):
   ```typescript
   const oneMinute = 60 * 1000; // Change to 10 * 1000 for 10 seconds
   ```

---

## Security Best Practices

### OTP Security

✅ **DO:**

- Store OTPs with `select: false`
- Clear OTPs after verification
- Use rate limiting
- Set reasonable expiration (10 minutes)

❌ **DON'T:**

- Log OTPs to console in production
- Send OTPs via insecure channels
- Reuse OTPs
- Skip rate limiting

### Email Security

✅ **DO:**

- Use app passwords, not account password
- Rotate app passwords regularly
- Monitor failed login attempts

❌ **DON'T:**

- Commit `.env` with real credentials
- Share app passwords
- Use personal Gmail for production

### Production Checklist

- [ ] Use dedicated email service (SendGrid, AWS SES, etc.)
- [ ] Enable email logging/monitoring
- [ ] Set up email delivery alerts
- [ ] Implement IP-based rate limiting
- [ ] Add CAPTCHA for OTP requests
- [ ] Monitor for abuse patterns

---

## Future Features (Coming Soon)

- [ ] Phone verification (Twilio SMS)
- [ ] Identity verification (Stripe Identity)
- [ ] Driver verification (DVLA + MOT)
- [ ] Parking verification (Postcodes.io + What3Words)
- [ ] Verification guards
- [ ] Admin approval dashboard

---

## References

- [Nodemailer Documentation](https://nodemailer.com/)
- [Handlebars Documentation](https://handlebarsjs.com/)
- [Gmail App Passwords](https://support.google.com/accounts/answer/185833)
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)

---

**Last Updated:** December 6, 2025  
**Author:** [war-riz](https://github.com/war-riz)  
**Feature:** Email Verification (Feature #1)  
**Branch:** `feature/email-verification`
