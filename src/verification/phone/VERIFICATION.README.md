# Phone Verification Documentation

Phone verification for Ride and Park using Twilio SMS and 6-digit OTP codes.

## Overview

- ✅ 6-digit OTP sent via Twilio SMS
- ✅ 10-minute expiration
- ✅ Rate limiting (1 request per minute)
- ✅ Welcome SMS after verification
- ✅ Secure OTP storage (excluded from queries)

---

## Endpoints

### 1. Send Phone OTP

**Endpoint:** `POST /verification/send-phone-otp`

**Request Body:**

```json
{
  "phoneNumber": "+1234567890"
}
```

**Validation:**

- `phoneNumber`: Must be in international format (E.164)
- Examples: `+1234567890`, `+447700900123`, `+2348012345678`
- Pattern: `^\+?[1-9]\d{1,14}$`

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "OTP sent successfully to your phone",
  "expiresIn": "10 minutes"
}
```

**Error Responses:**

**User Not Found (404):**

```json
{
  "statusCode": 404,
  "message": "User not found with this phone number",
  "error": "Not Found"
}
```

**Already Verified (400):**

```json
{
  "statusCode": 400,
  "message": "Phone number is already verified",
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

**Invalid Phone Format (400):**

```json
{
  "statusCode": 400,
  "message": [
    "Phone number must be in international format (e.g., +1234567890)"
  ],
  "error": "Bad Request"
}
```

---

### 2. Verify Phone OTP

**Endpoint:** `POST /verification/verify-phone-otp`

**Request Body:**

```json
{
  "phoneNumber": "+1234567890",
  "otp": "123456"
}
```

**Validation:**

- `phoneNumber`: International format, required
- `otp`: Exactly 6 digits, required

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Phone number verified successfully",
  "isVerified": true
}
```

**Side Effects:**

- Updates `User.isVerified.phone` to `true`
- Clears OTP from database
- Sends welcome SMS (async, non-blocking)

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

---

### 3. Check Phone Verification Status

**Endpoint:** `GET /verification/phone-status?phoneNumber=+1234567890`

**Query Parameters:**

- `phoneNumber` (required): User's phone number

**Success Response (200 OK):**

```json
{
  "success": true,
  "isVerified": true,
  "phoneNumber": "+1234567890"
}
```

---

## SMS Messages

### OTP SMS

```
Your Ride and Park verification code is: 123456

This code expires in 10 minutes.

Never share this code with anyone.
```

### Welcome SMS

```
Welcome to Ride and Park, John! 🎉

Your phone number has been verified. You're all set to start using our platform.

Happy riding!
```

---

## Twilio Configuration

### Environment Variables

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

### Getting Twilio Credentials

1. **Sign Up:**
   - Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
   - Create free trial account ($15 credit)

2. **Get Credentials:**
   - Dashboard → Account Info → Account SID
   - Dashboard → Account Info → Auth Token

3. **Get Phone Number:**
   - Console → Phone Numbers → Buy a Number
   - Choose a number (free with trial)
   - Copy the number in E.164 format (+1234567890)

4. **Trial Limitations:**
   - Can only send to verified phone numbers
   - Add test numbers in Console → Phone Numbers → Verified Caller IDs
   - Upgrade to paid account to remove restrictions

---

## OTP Logic

### Generation

- 6 random digits (0-9)
- Generated using `otp-generator` package
- Example: `123456`, `987654`

### Storage

```typescript
User.otpStorage.phoneOtp = {
  code: "123456",
  expiresAt: Date (10 minutes from now)
}
```

### Security

- `otpStorage` field has `select: false`
- Must explicitly select with `.select('+otpStorage')`

### Expiration

- Valid for **10 minutes**
- Cleared automatically on verification attempt if expired

### Rate Limiting

- **1 OTP per minute** per phone number
- Prevents spam and abuse

---

## Testing

### Run Tests

```bash
# All phone verification tests
npm test -- phone/verification.service.spec.ts
npm test -- phone/verification.controller.spec.ts

# Twilio service tests
npm test -- services/twilio.service.spec.ts
```

### Manual Testing with REST Client

Use `.rests/verification.rest`:

```http
### Send Phone OTP
POST http://localhost:5000/verification/send-phone-otp
Content-Type: application/json

{
  "phoneNumber": "+1234567890"
}

### Verify Phone OTP (check SMS for code)
POST http://localhost:5000/verification/verify-phone-otp
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "otp": "123456"
}

### Check Status
GET http://localhost:5000/verification/phone-status?phoneNumber=+1234567890
```

---

## Common Issues

### Issue: SMS Not Sending

**Cause:** Invalid Twilio credentials or trial account restrictions

**Solution:**

1. Verify credentials in `.env`
2. Check Twilio console for errors
3. Verify phone number in Twilio console (trial accounts only)
4. Check Twilio account balance

---

### Issue: "Phone number must be in international format"

**Cause:** Phone number not in E.164 format

**Solution:**

- Always include country code with `+`
- Examples: `+1234567890` (US), `+447700900123` (UK)
- Remove spaces, dashes, and parentheses

---

### Issue: Rate Limit Too Strict

**Cause:** Testing with frequent requests

**Solution:**

1. Wait 1 minute between requests
2. Use different phone numbers for testing
3. Adjust rate limit temporarily (development only):
   ```typescript
   const oneMinute = 60 * 1000; // Change to 10 * 1000 for 10 seconds
   ```

---

## Security Best Practices

### SMS Security

✅ **DO:**

- Use Twilio's secure API
- Rotate auth tokens regularly
- Monitor SMS usage for abuse
- Set spending limits in Twilio

❌ **DON'T:**

- Log OTPs to console in production
- Store OTPs in plain text
- Reuse OTPs
- Skip rate limiting

### Production Checklist

- [ ] Upgrade Twilio account (remove trial restrictions)
- [ ] Set up SMS delivery monitoring
- [ ] Enable Twilio webhooks for delivery status
- [ ] Implement phone number validation service
- [ ] Add CAPTCHA for OTP requests
- [ ] Monitor for SMS fraud patterns

---

## Cost Estimation

### Twilio Pricing (US Numbers)

- **SMS (Outbound):** $0.0079 per message
- **Phone Number:** $1.15/month

**Example Monthly Cost:**

- 1,000 verifications = $7.90
- 10,000 verifications = $79.00
- Phone number rental = $1.15

**Total for 10,000 users/month:** ~$80

---

## References

- [Twilio SMS API](https://www.twilio.com/docs/sms)
- [E.164 Phone Number Format](https://www.twilio.com/docs/glossary/what-e164)
- [Twilio Best Practices](https://www.twilio.com/docs/messaging/best-practices)

---

**Last Updated:** December 6, 2025  
**Author:** [war-riz](https://github.com/war-riz)  
**Feature:** Phone Verification (Feature #2)  
**Branch:** `feature/phone-verification`
