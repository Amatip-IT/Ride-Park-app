# Taxi (Driver) Verification Documentation

This module handles driver verification for the Ride and Park application using **DVLA API** (vehicle tax check), **MOT API** (MOT history check), and **manual insurance verification** by admins.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Prerequisites](#prerequisites)
4. [Endpoints](#endpoints)
5. [DVLA Integration](#dvla-integration)
6. [MOT Integration](#mot-integration)
7. [File Upload Setup](#file-upload-setup)
8. [Verification Flow](#verification-flow)
9. [Smart Hybrid Validation](#smart-hybrid-validation)
10. [Testing](#testing)
11. [Security](#security)
12. [Common Issues](#common-issues)

---

## Overview

Taxi/driver verification ensures that users who want to accept rides have:

1. ✅ **Valid UK Driving License** (verified via Stripe Identity)
2. ✅ **Legitimate Vehicle** (checked via DVLA API)
3. ✅ **Valid MOT** (checked via MOT API)
4. ✅ **Valid Insurance** (manually verified by admin)
5. ✅ **Roadworthy Vehicle** (confirmed by user, verified via photos)

### Why This Verification?

- **Legal Compliance**: UK law requires drivers to have valid license, insurance, and MOT
- **Safety**: Ensures vehicles are roadworthy and safe for passengers
- **Trust**: Builds confidence in the platform for riders
- **Insurance**: Required for platform's insurance policy

---

## Features

### ✅ **Automated Checks**

- DVLA vehicle tax status check
- MOT history and expiry check
- Mileage history validation (detects odometer rollback)
- Vehicle details extraction (make, model, colour, year)

### ✅ **Smart Hybrid Validation**

- User confirms vehicle details (colour, make, year)
- Backend compares with DVLA data
- Prevents unauthorized vehicle usage

### ✅ **Manual Review**

- Admin reviews vehicle photos
- Admin verifies insurance certificate
- Admin can approve or reject with reason

### ✅ **File Management**

- AWS S3 integration for secure storage
- 4 vehicle photos required (front, side, rear, interior)
- Insurance certificate upload (PDF only)
- File validation (type, size, format)

---

## Prerequisites

Before using driver verification, users must:

1. ✅ **Complete email verification** (`isVerified.email = true`)
2. ✅ **Complete phone verification** (`isVerified.phone = true`)
3. ✅ **Complete identity verification** (`isVerified.identity = true`)
4. ✅ **Verify with UK Driving License** (not passport)

**Important:** Users who verified with a passport cannot become drivers. They must re-verify with their UK driving license.

---

## Endpoints

### 1. Check Vehicle Details

**Endpoint:** `GET /verification/taxi/check-vehicle?registration=AB12CDE`

**Authentication:** Required (JWT token)

**Guards:** `AuthGuard`, `IdentityVerifiedGuard`

**Query Parameters:**

- `registration` (required): UK vehicle registration number

**Purpose:**

- Step 1 of driver application
- Checks DVLA and MOT data
- Returns vehicle info for user confirmation

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Vehicle found. Please confirm the details to proceed.",
  "vehicleData": {
    "registration": "AB12CDE",
    "taxStatus": "Taxed",
    "motStatus": "Valid",
    "motExpiryDate": "2025-11-14"
  },
  "requiresConfirmation": true
}
```

**Error Responses:**

**User Not Identity Verified (403):**

```json
{
  "statusCode": 403,
  "message": "Please complete identity verification first"
}
```

**Wrong ID Type (403):**

```json
{
  "statusCode": 403,
  "message": "You must verify your identity with a UK Driving License to become a driver. Please re-verify with your driving license."
}
```

**Existing Application (400):**

```json
{
  "statusCode": 400,
  "message": "You already have a driver application with status: pending_admin_review"
}
```

**Invalid Registration Format (400):**

```json
{
  "statusCode": 400,
  "message": "Invalid UK vehicle registration format. Example: AB12CDE"
}
```

**Vehicle Not Found (404):**

```json
{
  "statusCode": 404,
  "message": "Vehicle not found. Please check the registration number."
}
```

---

### 2. Submit Driver Application

**Endpoint:** `POST /verification/taxi/apply`

**Authentication:** Required (JWT token)

**Guards:** `AuthGuard`, `IdentityVerifiedGuard`

**Content-Type:** `multipart/form-data`

**Form Fields:**

```json
{
  "registrationNumber": "AB12CDE",
  "vehicleColour": "Blue",
  "vehicleMake": "TOYOTA",
  "vehicleYear": 2020,
  "hasValidInsurance": true,
  "isRoadworthy": true,
  "hasPermission": true
}
```

**Files:**

- `vehiclePhotos[]`: 4 images (JPEG/PNG, max 10MB each)
  - Front view
  - Side view
  - Rear view (showing number plate)
  - Interior view
- `insuranceCertificate`: 1 PDF (max 10MB)

**Validation Rules:**

- All fields are required
- `hasValidInsurance`, `isRoadworthy`, `hasPermission` must be `true`
- Vehicle details must match DVLA data
- Exactly 4 vehicle photos required
- Insurance certificate must be PDF

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Driver application submitted successfully. Our team will review it shortly.",
  "applicationId": "67584f9a2c3d1e4b5a6f7890"
}
```

**Error Responses:**

**Vehicle Details Mismatch (400):**

```json
{
  "statusCode": 400,
  "message": "Vehicle details do not match. Please check the registration number and try again."
}
```

**Legal Confirmations Not Checked (400):**

```json
{
  "statusCode": 400,
  "message": "You must confirm all legal requirements to proceed."
}
```

**Missing Files (400):**

```json
{
  "statusCode": 400,
  "message": "Please upload vehicle photos and insurance certificate"
}
```

**Not Enough Photos (400):**

```json
{
  "statusCode": 400,
  "message": "Please upload at least 4 vehicle photos (front, side, rear, interior)"
}
```

**Invalid File Type (400):**

```json
{
  "statusCode": 400,
  "message": "Vehicle photos must be JPEG or PNG images"
}
```

**File Too Large (400):**

```json
{
  "statusCode": 400,
  "message": "Each photo must be less than 10MB"
}
```

---

### 3. Check Driver Status

**Endpoint:** `GET /verification/taxi/status`

**Authentication:** Required (JWT token)

**Guards:** `AuthGuard`

**Purpose:** Check current driver application/verification status

**Success Response (Not Applied):**

```json
{
  "success": true,
  "hasApplied": false,
  "isVerified": false,
  "isActive": false
}
```

**Success Response (Application Pending):**

```json
{
  "success": true,
  "hasApplied": true,
  "isVerified": false,
  "isActive": false,
  "status": "pending_admin_review",
  "applicationDetails": {
    "vehicleInfo": {
      "registrationNumber": "AB12CDE",
      "make": "TOYOTA",
      "model": "Corolla",
      "colour": "Blue",
      "year": 2020,
      "fuelType": "Petrol"
    },
    "appliedAt": "2025-12-10T10:30:00.000Z"
  }
}
```

**Success Response (Approved & Active):**

```json
{
  "success": true,
  "hasApplied": true,
  "isVerified": true,
  "isActive": true,
  "status": "approved",
  "applicationDetails": {
    "vehicleInfo": {
      "registrationNumber": "AB12CDE",
      "make": "TOYOTA",
      "model": "Corolla",
      "colour": "Blue",
      "year": 2020,
      "fuelType": "Petrol"
    },
    "appliedAt": "2025-12-10T10:30:00.000Z",
    "approvedAt": "2025-12-11T14:20:00.000Z"
  }
}
```

**Success Response (Rejected):**

```json
{
  "success": true,
  "hasApplied": true,
  "isVerified": false,
  "isActive": false,
  "status": "rejected",
  "applicationDetails": {
    "vehicleInfo": {
      "registrationNumber": "AB12CDE",
      "make": "TOYOTA",
      "model": "Corolla",
      "colour": "Blue",
      "year": 2020,
      "fuelType": "Petrol"
    },
    "appliedAt": "2025-12-10T10:30:00.000Z",
    "rejectionReason": "Insurance certificate expired. Please upload current insurance and re-apply."
  }
}
```

---

### 4. Admin: Approve/Reject Driver

**Endpoint:** `POST /verification/taxi/admin/approve-reject`

**Authentication:** Required (JWT token)

**Guards:** `AuthGuard`, `AdminGuard`

**Request Body (Approve):**

```json
{
  "userId": "67584f9a2c3d1e4b5a6f7890",
  "decision": "approve"
}
```

**Request Body (Reject):**

```json
{
  "userId": "67584f9a2c3d1e4b5a6f7890",
  "decision": "reject",
  "reason": "Insurance certificate expired. Please upload current insurance and re-apply."
}
```

**Validation Rules:**

- `userId` is required
- `decision` must be "approve" or "reject"
- `reason` is required when rejecting

**Success Response (Approved):**

```json
{
  "success": true,
  "message": "Driver application approved successfully"
}
```

**Success Response (Rejected):**

```json
{
  "success": true,
  "message": "Driver application rejected"
}
```

**Error Responses:**

**No Pending Application (404):**

```json
{
  "statusCode": 404,
  "message": "No pending driver application found for this user"
}
```

**Rejection Without Reason (400):**

```json
{
  "statusCode": 400,
  "message": "Rejection reason is required when rejecting"
}
```

---

## DVLA Integration

The DVLA (Driver and Vehicle Licensing Agency) API provides vehicle information for UK registered vehicles.

### API Endpoint

```
POST https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles
```

### Getting API Access

1. **Register for API Key:**
   - Visit: https://developer-portal.driver-vehicle-licensing.api.gov.uk
   - Create account
   - Subscribe to "Vehicle Enquiry Service"
   - Generate API key

2. **API Key Pricing:**
   - Test environment: Free
   - Production: Pay-as-you-go (check DVLA pricing)

3. **Add to Environment:**
   ```env
   DVLA_API_KEY=your_dvla_api_key_here
   ```

### What DVLA Checks

The service checks:

| Check              | Description                    | Pass Criteria                                          |
| ------------------ | ------------------------------ | ------------------------------------------------------ |
| **Vehicle Exists** | Vehicle found in DVLA database | Vehicle data returned                                  |
| **Tax Status**     | Current vehicle tax status     | `taxStatus === "Taxed"`                                |
| **MOT Status**     | Current MOT status             | `motStatus === "Valid"` or `"No details held by DVLA"` |
| **Export Status**  | Vehicle marked for export      | `markedForExport === false`                            |

### DVLA Data Returned

```typescript
{
  registrationNumber: "AB12CDE",
  taxStatus: "Taxed" | "Untaxed" | "SORN",
  taxDueDate: "2025-12-01",
  motStatus: "Valid" | "Expired" | "No details held by DVLA",
  make: "TOYOTA",
  monthOfFirstRegistration: "2020-01",
  yearOfManufacture: 2020,
  engineCapacity: 1500,
  co2Emissions: 120,
  fuelType: "Petrol",
  markedForExport: false,
  colour: "Blue",
  typeApproval: "M1",
  wheelplan: "2 AXLE RIGID BODY",
  revenueWeight: 1500
}
```

### Registration Format Validation

Supports UK registration formats:

- **Current format (2001-present):** `AB12CDE`
- **Prefix format (1983-2001):** `A123BCD`
- **Suffix format (1963-1983):** `ABC123D`

**Examples:**

- ✅ Valid: `AB12CDE`, `A123BCD`, `ABC123D`
- ❌ Invalid: `INVALID`, `12345`, `A`

### Error Handling

- **404 Not Found:** Vehicle not in DVLA database
- **500 Server Error:** DVLA API temporarily unavailable
- **Timeout:** Request takes longer than 10 seconds

---

## MOT Integration

The MOT API provides MOT test history for UK registered vehicles.

### API Endpoint

**CORRECT Live Endpoint:**

```
GET https://history.mot.api.gov.uk/v1/trade/vehicles/registration/{registration}
```

### Getting API Access

1. **Register for API Key:**
   - Visit: https://documentation.history.mot.api.gov.uk
   - Click "Register for API"
   - Create account and verify email
   - Request trade API access
   - Generate API key

2. **API Key Pricing:**
   - Test environment: Free
   - Production: Free (subject to rate limits)
   - Rate limit: 10 requests/second

3. **Add to Environment:**
   ```env
   MOT_API_KEY=your_mot_api_key_here
   ```

### API Response Structure

The MOT History API returns data in this format:

```json
{
  "registration": "AB12CDE",
  "make": "TOYOTA",
  "model": "Corolla",
  "firstUsedDate": "2020-01-15",
  "fuelType": "Petrol",
  "primaryColour": "Blue",
  "registrationDate": "2020-01-10",
  "manufactureDate": "2019-12",
  "engineSize": "1598",
  "motTests": [
    {
      "completedDate": "2024-11-15T09:17:46.000Z",
      "testResult": "PASSED",
      "expiryDate": "2025-11-14",
      "odometerValue": "45000",
      "odometerUnit": "mi",
      "motTestNumber": "TEST123456",
      "defects": [
        {
          "text": "Front brake disc worn",
          "type": "ADVISORY",
          "dangerous": false
        }
      ]
    }
  ]
}
```

### What MOT Checks

| Check                    | Description              | Pass Criteria                     |
| ------------------------ | ------------------------ | --------------------------------- |
| **Vehicle Age**          | Calculate vehicle age    | Determine if MOT required         |
| **New Vehicle**          | Under 3 years old        | MOT not required yet              |
| **MOT Exempt**           | 40+ years old            | Historic vehicle exemption        |
| **Has MOT History**      | Vehicle has test records | At least 1 test (if 3+ years old) |
| **Latest Test Passed**   | Most recent test passed  | `testResult === "PASSED"`         |
| **MOT Not Expired**      | MOT certificate valid    | `expiryDate > currentDate`        |
| **Mileage Increasing**   | Odometer consistent      | No rollback detected              |
| **No Dangerous Defects** | No critical issues       | No `DANGEROUS` or `MAJOR` defects |

### Vehicle Age Categories

**1. New Vehicle (Under 3 years)**

- ✅ MOT not required yet
- ✅ First MOT due at 3 years from first registration
- ✅ Application succeeds even without MOT history

**2. Requires MOT (3-40 years)**

- ⚠️ Must have valid MOT
- ⚠️ Must have MOT history
- ❌ No MOT history = Application rejected

**3. MOT Exempt (40+ years)**

- ✅ Historic vehicle exemption
- ✅ MOT not legally required
- ⚠️ Must still be roadworthy
- ✅ Application succeeds even without MOT

### Mileage Validation

The system checks mileage consistency across MOT tests:

- **Increasing Trend:** Mileage should increase over time
- **Tolerance:** Allows up to 1000 miles decrease (for reading errors)
- **Rollback Detection:** Flags significant mileage decreases

**Example:**

```
Test 1 (2023): 40,000 miles
Test 2 (2024): 45,000 miles ✅ Valid (increasing)

Test 1 (2023): 50,000 miles
Test 2 (2024): 30,000 miles ❌ Rollback detected

Test 1 (2023): 45,000 miles
Test 2 (2024): 44,500 miles ✅ Valid (within tolerance)
```

### Defect Types

| Type          | Severity       | Action             | Application Impact |
| ------------- | -------------- | ------------------ | ------------------ |
| **ADVISORY**  | Minor issue    | Noted, but passes  | ✅ Allowed         |
| **MINOR**     | Small defect   | Passes, should fix | ✅ Allowed         |
| **MAJOR**     | Serious defect | Fails MOT          | ❌ Rejected        |
| **DANGEROUS** | Safety risk    | Fails MOT          | ❌ Rejected        |

**Our system rejects applications with DANGEROUS or MAJOR defects.**

### Error Handling

**404 Not Found**

```json
{
  "statusCode": 404,
  "message": "Vehicle not found in DVLA database. Please check the registration number."
}
```

**500 Server Error**

```json
{
  "statusCode": 500,
  "message": "Failed to retrieve MOT history. Please try again later."
}
```

**Timeout (>10 seconds)**

```json
{
  "statusCode": 500,
  "message": "Failed to communicate with MOT service."
}
```

### Special Cases

**Case 1: Brand New Car (0-3 years)**

```json
{
  "success": true,
  "message": "Vehicle is 2 year(s) old and does not require MOT yet.",
  "vehicleStatus": "NEW_VEHICLE",
  "checks": {
    "hasMotHistory": false,
    "requiresMot": false,
    "isExempt": false
  }
}
```

**Case 2: Classic Car (40+ years)**

```json
{
  "success": true,
  "message": "Vehicle is 42 years old and is MOT exempt (historic vehicle).",
  "vehicleStatus": "MOT_EXEMPT",
  "checks": {
    "requiresMot": false,
    "isExempt": true
  }
}
```

**Case 3: No MOT on 5-year-old Car**

```json
{
  "success": false,
  "message": "⚠️ WARNING: Vehicle is 5 years old and legally requires MOT, but has NO MOT history.",
  "vehicleStatus": "REQUIRES_MOT",
  "checks": {
    "hasMotHistory": false,
    "requiresMot": true
  }
}
```

### Testing with MOT API

**Test Vehicle Registrations:**

For testing, you can use these approaches:

1. **Use your own vehicle** (if you own one)
2. **Use the API sandbox** (if provided by MOT)
3. **Check the MOT documentation** for test registrations

**Test Endpoint:**

```bash
curl -X GET \
  "https://history.mot.api.gov.uk/v1/trade/vehicles/registration/AB12CDE" \
  -H "x-api-key: YOUR_API_KEY"
```

### Rate Limits

- **Production:** 10 requests/second
- **Burst:** 50 requests in 10 seconds
- **Daily:** Unlimited (subject to fair use)

**Recommendation:** Implement caching for frequently checked vehicles.

### Best Practices

1. **Always clean registration numbers:**

   ```typescript
   const cleaned = registration.replace(/\s+/g, '').toUpperCase();
   ```

2. **Handle all vehicle age cases:**
   - New vehicles (under 3 years)
   - Regular vehicles (3-40 years)
   - Historic vehicles (40+ years)

3. **Cache MOT results:**
   - MOT data doesn't change frequently
   - Cache for 24 hours
   - Reduces API calls

4. **Validate before driver approval:**
   - Check MOT status is current
   - Verify no dangerous defects
   - Confirm mileage consistency

5. **Monitor API usage:**
   - Track API calls per day
   - Alert on rate limit approaches
   - Log failed requests

---

## File Upload Setup

Driver verification requires AWS S3 for secure file storage.

### AWS S3 Configuration

1. **Create S3 Bucket:**

   ```bash
   # Using AWS CLI
   aws s3 mb s3://ride-and-park-driver-documents --region eu-west-2
   ```

2. **Create IAM User:**
   - Go to AWS Console → IAM → Users
   - Create user: `ride-and-park-s3-uploader`
   - Attach policy: `AmazonS3FullAccess` (or custom policy)

3. **Generate Access Keys:**
   - User → Security credentials → Create access key
   - Save Access Key ID and Secret Access Key

4. **Add to Environment:**
   ```env
   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   AWS_REGION=eu-west-2
   AWS_S3_BUCKET=ride-and-park-driver-documents
   ```

### Custom IAM Policy (Recommended)

For better security, use a custom policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::ride-and-park-driver-documents/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::ride-and-park-driver-documents"
    }
  ]
}
```

### File Storage Structure

```
ride-and-park-driver-documents/
├── driver-documents/
│   ├── {userId}/
│   │   ├── photos/
│   │   │   ├── {uuid}.jpg  (front)
│   │   │   ├── {uuid}.jpg  (side)
│   │   │   ├── {uuid}.jpg  (rear)
│   │   │   └── {uuid}.jpg  (interior)
│   │   └── insurance/
│   │       └── {uuid}.pdf
```

### File Validation

**Vehicle Photos:**

- **Format:** JPEG, PNG
- **Max Size:** 10MB per photo
- **Count:** Exactly 4 photos required
- **Content:** Front, side, rear (with plate), interior

**Insurance Certificate:**

- **Format:** PDF only
- **Max Size:** 10MB
- **Content:** Valid insurance certificate showing:
  - Policy holder name
  - Vehicle registration
  - Coverage dates
  - Insurance company details

### S3 Security

- **ACL:** Private (not publicly accessible)
- **Access:** Only via backend API with signed URLs
- **Encryption:** Server-side encryption (SSE-S3)
- **Lifecycle:** Archive old files after 7 years (GDPR)

---

## Verification Flow

### Complete Step-by-Step Process

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: USER CHECKS VEHICLE                                    │
│  GET /verification/driver/check-vehicle?registration=AB12CDE    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND CHECKS:                                                │
│  1. User is identity verified? ✅                               │
│  2. User has driving license? ✅                                │
│  3. No existing application? ✅                                 │
│  4. Valid registration format? ✅                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  DVLA API CALL:                                                 │
│  - Check vehicle exists                                         │
│  - Check tax status                                             │
│  - Check MOT status                                             │
│  - Get vehicle details (make, colour, year)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  MOT API CALL:                                                  │
│  - Get MOT history                                              │
│  - Check expiry date                                            │
│  - Validate mileage history                                     │
│  - Check for dangerous defects                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  RESPONSE TO USER:                                              │
│  {                                                              │
│    "registration": "AB12CDE",                                   │
│    "taxStatus": "Taxed",                                        │
│    "motStatus": "Valid",                                        │
│    "motExpiryDate": "2025-11-14"                                │
│  }                                                              │
│  ⚠️ User does NOT see colour/make/year yet                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: USER SUBMITS APPLICATION                               │
│  POST /verification/driver/apply                                │
│                                                                 │
│  User provides:                                                 │
│  - vehicleColour: "Blue"                                        │
│  - vehicleMake: "TOYOTA"                                        │
│  - vehicleYear: 2020                                            │
│  - hasValidInsurance: true                                      │
│  - isRoadworthy: true                                           │
│  - hasPermission: true                                          │
│  - 4 vehicle photos                                             │
│  - Insurance certificate PDF                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SMART HYBRID VALIDATION:                                       │
│                                                                 │
│  Backend compares user's answers with DVLA data:                │
│  - User said: "Blue" → DVLA says: "Blue" ✅                     │
│  - User said: "TOYOTA" → DVLA says: "TOYOTA" ✅                 │
│  - User said: 2020 → DVLA says: 2020 ✅                         │
│                                                                 │
│  If mismatch → Reject application                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  FILE UPLOAD:                                                   │
│  - Upload 4 photos to S3                                        │
│  - Upload insurance PDF to S3                                   │
│  - Generate secure URLs                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  CREATE DRIVER VERIFICATION RECORD:                             │
│  {                                                              │
│    user: userId,                                                │
│    status: "pending_admin_review",                              │
│    isVerified: false,                                           │
│    isActive: false,                                             │
│    vehicleInfo: { ... },                                        │
│    dvlaCheck: { passed: true, data: { ... } },                 │
│    motCheck: { passed: true, data: { ... } },                  │
│    documents: {                                                 │
│      vehiclePhotos: [s3_url1, s3_url2, ...],                   │
│      insuranceCertificate: s3_url                               │
│    }                                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: ADMIN REVIEWS APPLICATION                              │
│  (Admin dashboard shows pending applications)                   │
│                                                                 │
│  Admin checks:                                                  │
│  - Vehicle photos (clear, matches description)                  │
│  - Insurance certificate (valid, correct vehicle)               │
│  - DVLA/MOT checks (already passed)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN DECISION:                                                │
│  POST /verification/driver/admin/approve                        │
│                                                                 │
│  Option A: Approve                                              │
│  {                                                              │
│    "userId": "...",                                             │
│    "decision": "approve"                                        │
│  }                                                              │
│  → status: "approved"                                           │
│  → isVerified: true                                             │
│                                                                 │
│  Option B: Reject                                               │
│  {                                                              │
│    "userId": "...",                                             │
│    "decision": "reject",                                        │
│    "reason": "Insurance expired"                                │
│  }                                                              │
│  → status: "rejected"                                           │
│  → rejectionReason: "Insurance expired"                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: USER ACTIVATES DRIVER MODE                             │
│  (Separate feature - not in this module)                        │
│                                                                 │
│  PATCH /verification/toggle-driver-mode                         │
│  { "isActive": true }                                           │
│                                                                 │
│  → driverVerification.isActive = true                           │
│  → User appears in available drivers list                       │
│  → User can accept ride requests                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Smart Hybrid Validation

### What is Smart Hybrid Validation?

Traditional validation methods have weaknesses:

1. **Pure API Validation:**
   - ❌ User might not own the vehicle
   - ❌ Anyone can look up any registration

2. **Pure Manual Validation:**
   - ❌ Slow (admin must check every detail)
   - ❌ Prone to human error

**Smart Hybrid combines both:**

- ✅ API verifies vehicle legitimacy (DVLA/MOT)
- ✅ User knowledge proves ownership
- ✅ Admin verifies documents

### How It Works

**Step 1: User enters registration**

```
User: "I want to register vehicle AB12CDE"
```

**Step 2: Backend checks DVLA (hidden from user)**

```javascript
DVLA Response:
{
  registrationNumber: "AB12CDE",
  colour: "Blue",
  make: "TOYOTA",
  year: 2020
}
```

**Step 3: Backend shows limited info**

```json
{
  "registration": "AB12CDE",
  "taxStatus": "Taxed",
  "motStatus": "Valid"
}
```

**User does NOT see colour/make/year**

**Step 4: User must answer questions**

```
Frontend asks:
- What colour is your vehicle?
- What make is your vehicle?
- What year was it manufactured?
```

**Step 5: Backend validates answers**

```javascript
User says: "Blue, TOYOTA, 2020"
DVLA says: "Blue, TOYOTA, 2020"
✅ Match! User likely owns the vehicle
```

**Step 6: If mismatch → Reject**

```javascript
User says: "Red, HONDA, 2019"
DVLA says: "Blue, TOYOTA, 2020"
❌ Mismatch! Application rejected
```

### Why This Works

1. **Prevents Fraud:**
   - Random person can't register someone else's vehicle
   - Must know specific details only owner would know

2. **Quick Validation:**
   - Instant API check
   - No waiting for documents

3. **Reduces Admin Work:**
   - Only checks photos and insurance
   - Doesn't need to verify basic vehicle info

### Implementation

```typescript
// Backend compares answers
const colourMatch =
  userAnswer.colour.toLowerCase() === dvlaData.colour.toLowerCase();

const makeMatch = userAnswer.make.toLowerCase() === dvlaData.make.toLowerCase();

const yearMatch = userAnswer.year === dvlaData.yearOfManufacture;

if (!colourMatch || !makeMatch || !yearMatch) {
  throw new BadRequestException(
    'Vehicle details do not match. Please check the registration number.',
  );
}
```

---

## Testing

### Run Tests

```bash
# Run all driver verification tests
npm test -- verification/driver

# Run specific test files
npm test -- verification.service.spec.ts
npm test -- dvla.service.spec.ts
npm test -- mot.service.spec.ts
npm test -- file-upload.service.spec.ts

# Run with coverage
npm run test:cov

# Watch mode
npm test -- --watch verification/driver
```

### Manual Testing

Use the REST file: `.rests/driver-verification.rest`

**Prerequisites:**

1. Create user account
2. Get JWT token from login
3. Complete email verification
4. Complete phone verification
5. Complete identity verification (with driving license)

### Test Scenarios

#### **Scenario 1: Complete Driver Application**

```http
### 1. Check vehicle
GET http://localhost:5000/verification/driver/check-vehicle?registration=AB12CDE
Authorization: Bearer {{token}}

### 2. Submit application (use the registration from step 1)
POST http://localhost:5000/verification/driver/apply
Authorization: Bearer {{token}}
Content-Type: multipart/form-data

### 3. Check status
GET http://localhost:5000/verification/driver/status
Authorization: Bearer {{token}}

### 4. Admin approves
POST http://localhost:5000/verification/driver/admin/approve
Authorization: Bearer {{adminToken}}
Content-Type: application/json

{
  "userId": "user123",
  "decision": "approve"
}
```

#### **Scenario 2: Test Error Cases**

```http
### Try without identity verification
GET http://localhost:5000/verification/driver/check-vehicle?registration=AB12CDE
Authorization: Bearer {{unverifiedToken}}
# Expected: 403 Forbidden

### Try with invalid registration
GET http://localhost:5000/verification/driver/check-vehicle?registration=INVALID
Authorization: Bearer {{token}}
# Expected: 400 Bad Request

### Try with vehicle not found
GET http://localhost:5000/verification/driver/check-vehicle?registration=ZZ99ZZZ
Authorization: Bearer {{token}}
# Expected: 404 Not Found
```

---

## Security

### Data Protection

**What We Store:**

- Vehicle registration number
- DVLA data (make, model, colour, year)
- MOT history (latest test info)
- File URLs (S3 paths)
- Application status

**What We DON'T Store:**

- Full MOT history (only latest test)
- Vehicle images (stored in S3, not database)
- Insurance certificate content (only S3 URL)

### File Security

- **S3 ACL:** Private (not publicly accessible)
- **Signed URLs:** Generate temporary access URLs
- **Encryption:** Server-side encryption (SSE-S3)
- **Access Control:** Only authorized users can access files

### API Key Security

✅ **DO:**

- Store API keys in environment variables
- Rotate keys regularly (quarterly)
- Use different keys for test/production
- Monitor API usage for anomalies

❌ **DON'T:**

- Commit API keys to Git
- Share API keys in Slack/email
- Use production keys in development
- Log API keys in console

### Rate Limiting

**Recommended limits:**

- Vehicle check: 10 requests/hour per user
- Application submit: 1 request/day per user
- Status check: 60 requests/hour per user

**Implementation:**

```typescript
// Add rate limiting middleware
import rateLimit from 'express-rate-limit';

const checkVehicleLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: 'Too many vehicle checks. Please try again later.'
});

// Apply to route
@UseGuards(checkVehicleLimiter)
@Get('check-vehicle')
async checkVehicle() { ... }
```

---

## Common Issues

### Issue: "DVLA API key not configured"

**Cause:** Missing or invalid DVLA API key

**Solution:**

1. Check `.env` file has `DVLA_API_KEY`
2. Verify key is correct (no extra spaces), we have test key for development and live key for production
3. Restart backend server
4. Test key with DVLA API directly

```bash
# Test DVLA API with test key
curl -X POST https://uat.driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"registrationNumber":"AB12CDE"}'
```

```bash
# Test DVLA API with live key
curl -X POST https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"registrationNumber":"AB12CDE"}'
```

---

### Issue: "MOT API key not configured"

**Cause:** Missing or invalid MOT API key

**Solution:**

1. Check `.env` file has `MOT_API_KEY, MOT_CLIENT_ID, MOT_CLIENT_SECRET, MOT_SCOPE_URL, MOT_TENANT_ID`
2. Request API access if not registered
3. Verify key works with MOT API
4. You will also need access token together with the API Key for checking vehicles registration. [Check documentations for more info](https://documentation.history.mot.api.gov.uk/mot-history-api/authentication/)

```bash
# Test MOT API
curl -X GET "https://history.mot.api.gov.uk/v1/trade/vehicles/registration/AB12CDE" \
  -H "x-api-key: YOUR_KEY"
```

---

### Issue: "AWS S3 credentials not configured"

**Cause:** Missing AWS credentials

**Solution:**

1. Check `.env` has all AWS variables:
   ```env
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=eu-west-2
   AWS_S3_BUCKET=your-bucket-name
   ```
2. Verify IAM user has S3 permissions
3. Test AWS credentials

```bash
# Test AWS credentials
aws s3 ls s3://your-bucket-name --profile your-profile
```

---

### Issue: "Vehicle not found"

**Symptoms:**

- DVLA returns 404
- Error: "Vehicle not found with this registration number"

**Possible Causes:**

1. **Typo in registration:** Check spelling
2. **Spaces in registration:** Backend auto-removes spaces
3. **Vehicle not registered:** Very new or imported vehicle
4. **Test environment:** Using test API key with real registration

**Solution:**

- Verify registration is correct
- Check on official DVLA website: https://www.gov.uk/check-vehicle-tax
- For testing, use test registrations provided by DVLA

---

### Issue: "No MOT history found"

**Possible Causes:**

1. **New vehicle:** Cars under 3 years old don't need MOT
2. **Historic vehicle:** MOT exempt (40+ years old)
3. **Recent registration:** MOT data not yet available

**Solution:**

- Check vehicle age
- For new cars, adjust validation logic
- For historic cars, allow manual override

---

### Issue: "Vehicle details do not match"

**Cause:** User's answers don't match DVLA data

**Common mistakes:**

- Wrong colour (e.g., "Dark Blue" vs "Blue")
- Wrong make spelling (e.g., "VOLKSWAGEN" vs "VW")
- Wrong year (e.g., registered 2020 but manufactured 2019)

**Solution:**

- Display error message clearly
- Show user what to double-check
- Allow retry with corrected information

---

### Issue: "Mileage rollback detected"

**Cause:** MOT history shows decreasing mileage

**Possible reasons:**

1. **Odometer tampering:** Illegal
2. **Reading error:** Garage mistyped mileage
3. **Engine replacement:** New odometer

**Solution:**

- Flag for admin review
- Request additional documentation
- For genuine cases, allow admin override

---

### Issue: File upload fails

**Symptoms:**

- "Failed to upload file" error
- Files not appearing in S3

**Possible Causes:**

1. **S3 bucket doesn't exist**
2. **IAM permissions insufficient**
3. **File size too large**
4. **Invalid file type**
5. **Network timeout**

**Solution:**

```bash
# Check bucket exists
aws s3 ls s3://your-bucket-name

# Check IAM permissions
aws iam get-user-policy --user-name ride-and-park-s3-uploader --policy-name s3-access

# Test upload
aws s3 cp test.jpg s3://your-bucket-name/test.jpg
```

---

### Issue: "Insurance certificate must be a PDF file"

**Cause:** User uploaded image instead of PDF

**Solution:**

- Frontend should validate file type before upload
- Show clear error message
- Provide example of correct format
- Allow users to convert images to PDF

---

### Issue: Admin can't see pending applications

**Possible causes:**

1. **Not logged in as admin**
2. **Admin guard not working**
3. **No pending applications**

**Solution:**

- Check user has `role: 'admin'` in database
- Verify AdminGuard is applied to endpoint
- Check application status in database

```bash
# Check admin role
db.users.findOne({ email: "admin@example.com" })

# Check pending applications
db.driververifications.find({ status: "pending_admin_review" })
```

---

## Production Checklist

Before deploying to production:

- [ ] Use live DVLA API key (not test key)
- [ ] Use live MOT API key (not test key)
- [ ] Configure production AWS S3 bucket
- [ ] Set up S3 lifecycle policies (archive old files)
- [ ] Enable S3 encryption (SSE-S3)
- [ ] Configure S3 CORS (if needed)
- [ ] Set up CloudWatch alarms for API errors
- [ ] Implement rate limiting on endpoints
- [ ] Add monitoring for failed applications
- [ ] Set up email notifications for admins
- [ ] Test file upload with production bucket
- [ ] Verify DVLA/MOT API quotas are sufficient
- [ ] Document admin review process
- [ ] Train support team on common issues
- [ ] Create user guide for driver application
- [ ] Set up backup for S3 files
- [ ] Configure GDPR data retention policies

---

## API Rate Limits

### DVLA API

- **Free tier:** 10 requests/second
- **Paid tier:** Custom limits
- **Cost:** Check DVLA pricing page

### MOT API

- **Free tier:** 5 requests/second
- **Rate limit:** 1000 requests/day (free)
- **Cost:** Free (subject to fair use)

### AWS S3

- **Upload:** 3,500 PUT/s per prefix
- **Download:** 5,500 GET/s per prefix
- **Cost:** Pay per GB stored and transferred

---

## Cost Estimation

**Monthly costs for 1000 driver applications:**

| Service              | Usage               | Cost              |
| -------------------- | ------------------- | ----------------- |
| DVLA API             | 1000 checks         | ~£10              |
| MOT API              | 1000 checks         | Free              |
| AWS S3 Storage       | 5GB (photos + PDFs) | ~£0.12            |
| AWS S3 Requests      | 5000 uploads        | ~£0.03            |
| AWS S3 Data Transfer | 5GB out             | ~£0.40            |
| **Total**            |                     | **~£10.55/month** |

_Prices as of December 2025. Check official pricing for current rates._

---

## Future Enhancements

- [ ] Auto-renewal reminders (MOT/insurance expiry)
- [ ] OCR for insurance certificate validation
- [ ] Real-time DVLA webhook integration
- [ ] Automatic MOT check on renewal date
- [ ] Vehicle history report generation
- [ ] Integration with vehicle valuation APIs
- [ ] Multi-vehicle support (one driver, multiple cars)
- [ ] Vehicle swap functionality
- [ ] Insurance provider integration
- [ ] Telematics data integration

---

## Support

**DVLA API Issues:**

- Support: https://developer-portal.driver-vehicle-licensing.api.gov.uk/support
- Documentation: https://developer-portal.driver-vehicle-licensing.api.gov.uk/apis

**MOT API Issues:**

- Documentation: https://documentation.history.mot.api.gov.uk
- Email: mts.enquiries@dvsa.gov.uk

**AWS S3 Issues:**

- Support: https://console.aws.amazon.com/support
- Documentation: https://docs.aws.amazon.com/s3

**Ride and Park Issues:**

- Email: info@amatip.co.uk
- GitHub: [Issue Tracker](https://github.com/war-riz/ride_and_park_backend/issues)

---

**Last Updated:** December 13, 2025  
**Author:** [war_riz](https://github.com/war-riz)  
**Feature:** Driver Verification  
**Branch:** `feature/driver-verification`
