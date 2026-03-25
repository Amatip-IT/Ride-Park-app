# Schemas Documentation

This directory contains all MongoDB schemas for the Ride and Park backend, organized into a normalized structure for optimal performance and maintainability.

## Schema Architecture Overview

The schema architecture follows a **normalized database design** with:

- **Main User Schema**: Core user information with embedded small documents
- **Separate Verification Collections**: Large verification data in dedicated collections
- **Virtual Population**: Relationships managed via Mongoose virtuals
- **Indexing Strategy**: Optimized indexes for common queries

---

## Table of Contents

1. [User Schema](#user-schema)
2. [Verification Status Schema](#verification-status-schema)
3. [OTP Storage Schema](#otp-storage-schema)
4. [Identity Verification Schema](#identity-verification-schema)
5. [Driver Verification Schema](#driver-verification-schema)
6. [Parking Verification Schema](#parking-verification-schema)
7. [Best Practices](#best-practices)

---

## User Schema

**File:** `user.schema.ts`

**Collection:** `users`

### Fields

```typescript
{
  firstName: string;           // Required
  lastName: string;            // Required
  username: string;            // Required, unique
  email: string;               // Required, unique, validated email format
  phoneNumber: string;         // Required, international format
  password: string;            // Required, auto-hashed with bcrypt (select: false)
  role: 'user' | 'admin';      // Default: 'user'
  lastLoggedInAt?: Date;       // Updated on every login

  // Embedded Documents
  isVerified: {
    email: boolean;            // Default: false
    phone: boolean;            // Default: false
    identity: boolean;         // Default: false
  };

  otpStorage: {                // select: false (not returned in queries)
    emailOtp?: {
      code: string;
      expiresAt: Date;
    };
    phoneOtp?: {
      code: string;
      expiresAt: Date;
    };
  };

  // Virtual Fields (not stored in DB)
  identityVerifications: IdentityVerification[];   // Populated on demand
  driverVerifications: TaxiVerification[];         // Populated on demand (approved taxi drivers)
  parkingVerifications: ParkingVerification[];     // Populated on demand

  // Automatic Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Features

1. **Password Security**
   - Automatically hashed using bcrypt (10 salt rounds)
   - Excluded from query results by default
   - Pre-save hook ensures hashing only on password modification

2. **Email Validation**
   - Regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - Automatically converted to lowercase
   - Trimmed whitespace

3. **Phone Number Validation**
   - International format required
   - Regex: `/^\+?[1-9]\d{1,14}$/`
   - Example: `+1234567890`

4. **Virtual Relationships**
   - Relationships to verification collections
   - Lazy-loaded when needed
   - Reduces User document size

### Example Usage

```typescript
// Create a new user
const user = new User({
  firstName: 'John',
  lastName: 'Smith',
  username: 'johnsmith',
  email: 'john@example.com',
  phoneNumber: '+1234567890',
  password: 'SecurePassword123!',
  role: 'user',
});
await user.save(); // Password automatically hashed

// Query user (password excluded by default)
const foundUser = await User.findById(userId);
console.log(foundUser.password); // undefined

// Query with password (when needed for authentication)
const userWithPassword = await User.findById(userId).select('+password');
console.log(userWithPassword.password); // hashed password

// Populate verifications
const userWithVerifications = await User.findById(userId)
  .populate('identityVerifications')
  .populate('driverVerifications')
  .populate('parkingVerifications');
```

---

## Verification Status Schema

**File:** `verified-status.schema.ts`

**Usage:** Embedded in User Schema

### Fields

```typescript
{
  email: boolean; // Default: false
  phone: boolean; // Default: false
  identity: boolean; // Default: false
}
```

### Purpose

Tracks which verification steps a user has completed. This is embedded in the User document for fast access without additional queries.

### Example Usage

```typescript
// Check if user verified email
if (user.isVerified.email) {
  console.log('Email is verified');
}

// Update verification status
user.isVerified.email = true;
user.isVerified.phone = true;
await user.save();

// Check all verifications
const isFullyVerified =
  user.isVerified.email && user.isVerified.phone && user.isVerified.identity;
```

---

## OTP Storage Schema

**File:** `otp.schema.ts`

**Usage:** Embedded in User Schema (select: false)

### Fields

```typescript
{
  emailOtp?: {
    code: string;      // 6-digit OTP code
    expiresAt: Date;   // Expiration timestamp
  };
  phoneOtp?: {
    code: string;      // 6-digit OTP code
    expiresAt: Date;   // Expiration timestamp
  };
}
```

### Purpose

Temporarily stores OTP codes for email and phone verification. This data is:

- **Not returned in queries** (`select: false`)
- **Automatically expires** after 10 minutes
- **Deleted after verification** to save space

### Security Features

1. **Time-based expiration**: OTPs expire after 10 minutes
2. **Hidden by default**: Not exposed in API responses
3. **Single-use**: Deleted immediately after successful verification
4. **Rate limiting**: (To be implemented in controller)

### Example Usage

```typescript
// Store OTP (when sending email verification)
user.otpStorage = {
  emailOtp: {
    code: '123456',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  },
};
await user.save();

// Retrieve OTP (requires explicit selection)
const userWithOtp = await User.findById(userId).select('+otpStorage');
const storedOtp = userWithOtp.otpStorage?.emailOtp?.code;

// Verify OTP
if (
  storedOtp === submittedOtp &&
  new Date() < user.otpStorage.emailOtp.expiresAt
) {
  // Valid OTP
  user.isVerified.email = true;
  user.otpStorage.emailOtp = undefined; // Clear OTP
  await user.save();
}
```

---

## Identity Verification Schema

**File:** `identity-verification.schema.ts`

**Collection:** `identityverifications`

### Fields

```typescript
{
  user: ObjectId;                              // Ref: 'User', required
  stripeVerificationId?: string;               // Stripe session ID
  idType?: 'driving_license' | 'passport';     // Type of ID used
  verifiedName?: string;                       // Name from ID
  verifiedDOB?: string;                        // Date of birth from ID
  licenseNumber?: string;                      // Only if idType === 'driving_license'
  verifiedAt?: Date;                           // Verification timestamp
  verifiedBy?: ObjectId;                       // Ref: 'User' (admin who verified)

  // Automatic Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes

```typescript
// Single field index for fast user lookups
{
  user: 1;
}
```

### Purpose

Stores detailed identity verification data from Stripe Identity. This is separated from the User document because:

- Contains large data (ID scans, selfies stored in Stripe)
- Not frequently accessed
- Can have multiple records (re-verification history)

### Example Usage

```typescript
// Create identity verification record
const identityVerification = new IdentityVerification({
  user: userId,
  stripeVerificationId: 'vi_1234567890',
  idType: 'driving_license',
  verifiedName: 'John Smith',
  verifiedDOB: '1990-05-15',
  licenseNumber: 'SMITH905156JD9XX',
  verifiedAt: new Date(),
});
await identityVerification.save();

// Update user verification status
user.isVerified.identity = true;
await user.save();

// Query user's identity verification
const identity = await IdentityVerification.findOne({ user: userId });

// Populate when querying user
const userWithIdentity = await User.findById(userId).populate(
  'identityVerifications',
);
```

---

## Taxi Verification Schema

**File:** `taxi.schema.ts`

**Collection:** `taxis`

### Fields

```typescript
{
  user: ObjectId;                              // Ref: 'User', required
  status: string;                              // Default: 'not_applied'
  isVerified: boolean;                         // Default: false (set true on admin approval)
  isActive: boolean;                           // Default: false (driver must opt-in)

  vehicleInfo?: {
    registrationNumber?: string;
    make?: string;
    model?: string;
    color?: string;
    year?: number;
    fuelType?: string;
  };

  dvlaCheck?: any;                             // Raw DVLA response + status

  motCheck?: MotCheckData;                     // MOT history + analysis (risk level, expiry, mileage trend)

  documents?: {
    vehiclePhotos?: string[];                  // URLs to uploaded photos
    insuranceCertificate?: string;             // URL to insurance PDF
  };

  rejectionReason?: string;                    // Admin rejection reason
  approvedBy?: ObjectId;                       // Ref: 'User' (admin)

  // Automatic Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Status Values

```typescript
'not_applied'; // User hasn't applied
'pending_auto_check'; // Automated DVLA + MOT checks running
'pending_admin_review'; // Waiting for admin approval
'approved'; // Admin approved (isVerified: true)
'rejected'; // Admin rejected (old applications pruned before resubmission)
```

### Indexes

```typescript
{
  user: 1;
} // Fast user lookups
{
  isActive: 1;
} // Query active drivers
{
  status: 1;
} // Admin dashboard queries
```

### Purpose

Stores taxi/driver verification details including vehicle info, DVLA + MOT results (with derived risk analysis), uploaded documents (photos + insurance), admin approval status, and driver active toggle.

### Example Usage

```typescript
// Create driver application
const driverVerification = new DriverVerification({
  user: userId,
  status: 'pending_auto_check',
  vehicleInfo: {
    registrationNumber: 'AB12CDE',
    make: 'Toyota',
    model: 'Corolla',
    color: 'Blue',
    year: 2020,
    fuelType: 'Petrol',
  },
  documents: {
    vehiclePhotos: [
      'https://s3.amazonaws.com/photos/front.jpg',
      'https://s3.amazonaws.com/photos/side.jpg',
    ],
    insuranceCertificate: 'https://s3.amazonaws.com/docs/insurance.pdf',
  },
});
await driverVerification.save();

// Update after DVLA check
driverVerification.dvlaCheck = {
  passed: true,
  checkedAt: new Date(),
  data: {
    /* DVLA API response */
  },
};
driverVerification.status = 'pending_admin_review';
await driverVerification.save();

// Admin approval
driverVerification.isVerified = true;
driverVerification.status = 'approved';
driverVerification.approvedBy = adminId;
await driverVerification.save();

// User activates driver mode
driverVerification.isActive = true;
await driverVerification.save();

// Query active drivers
const activeDrivers = await DriverVerification.find({
  isActive: true,
}).populate('user');
```

---

## Parking Verification Schema

**File:** `parking-verification.schema.ts`

**Collection:** `parkingverifications`

### Fields

```typescript
{
  user: ObjectId;                              // Ref: 'User', required
  status: string;                              // Default: 'not_applied'
  isVerified: boolean;                         // Default: false
  isActive: boolean;                           // Default: false

  address?: string;                            // Full address
  postcode?: string;                           // UK postcode

  location?: {
    coordinates?: {
      lat: number;
      lng: number;
    };
    what3words?: string;                       // What3Words address
  };

  postcodeCheck?: {
    passed: boolean;
    checkedAt: Date;
    data: any;                                 // Postcodes.io response
  };

  what3wordsCheck?: {
    passed: boolean;
    checkedAt: Date;
    data: any;                                 // What3Words API response
  };

  documents?: {
    spacePhotos?: string[];                    // URLs to parking photos
    ownershipProof?: string;                   // URL to ownership document
  };

  rejectionReason?: string;                    // Admin rejection reason
  approvedBy?: ObjectId;                       // Ref: 'User' (admin)

  // Automatic Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Status Values

```typescript
'not_applied'; // User hasn't applied
'pending_auto_check'; // Automated postcode + what3words checks running
'pending_admin_review'; // Waiting for admin approval
'approved'; // Admin approved
'rejected'; // Admin rejected
```

### Indexes

```typescript
{
  user: 1;
} // Fast user lookups
{
  isActive: 1;
} // Query active parking spaces
{
  status: 1;
} // Admin dashboard queries
```

### Purpose

Stores parking space verification details including:

- Location information
- Postcode and What3Words validation
- Uploaded documents (photos, ownership proof)
- Admin approval status
- Active/inactive toggle state

### Example Usage

```typescript
// Create parking application
const parkingVerification = new ParkingVerification({
  user: userId,
  status: 'pending_auto_check',
  address: '10 Downing Street, London',
  postcode: 'SW1A 1AA',
  location: {
    coordinates: {
      lat: 51.5034,
      lng: -0.1276,
    },
    what3words: 'filled.count.soap',
  },
  documents: {
    spacePhotos: [
      'https://s3.amazonaws.com/photos/space1.jpg',
      'https://s3.amazonaws.com/photos/space2.jpg',
    ],
    ownershipProof: 'https://s3.amazonaws.com/docs/utility-bill.pdf',
  },
});
await parkingVerification.save();

// Update after postcode check
parkingVerification.postcodeCheck = {
  passed: true,
  checkedAt: new Date(),
  data: {
    /* Postcodes.io response */
  },
};
parkingVerification.status = 'pending_admin_review';
await parkingVerification.save();

// Admin approval
parkingVerification.isVerified = true;
parkingVerification.status = 'approved';
parkingVerification.approvedBy = adminId;
await parkingVerification.save();

// User activates parking mode
parkingVerification.isActive = true;
await parkingVerification.save();

// Query active parking spaces
const activeSpaces = await ParkingVerification.find({
  isActive: true,
}).populate('user');
```

---

## Common Queries

### Find Users Ready to Be Drivers

```typescript
const eligibleUsers = await User.find({
  'isVerified.identity': true,
  'isVerified.email': true,
  'isVerified.phone': true,
}).populate({
  path: 'identityVerifications',
  match: { idType: 'driving_license' },
});
```

### Find Active Drivers

```typescript
const activeDrivers = await DriverVerification.find({
  isActive: true,
  isVerified: true,
}).populate('user', 'firstName lastName phoneNumber');
```

### Find Pending Admin Reviews

```typescript
const pendingReviews = await DriverVerification.find({
  status: 'pending_admin_review',
}).populate('user', 'firstName lastName email');
```

### Check if User Can Toggle Driver Mode

```typescript
const canToggle = await DriverVerification.exists({
  user: userId,
  isVerified: true,
});
```

---

## References

- [Mongoose Documentation](https://mongoosejs.com/)
- [MongoDB Best Practices](https://docs.mongodb.com/manual/administration/production-notes/)
- [Mongoose Virtuals](https://mongoosejs.com/docs/populate.html#populate-virtuals)
- [Mongoose Indexes](https://mongoosejs.com/docs/guide.html#indexes)

---

**Last Updated:** December 5, 2025  
**Author:** [war-riz](https://github.com/war-riz)
**Project:** Ride and Park Backend
