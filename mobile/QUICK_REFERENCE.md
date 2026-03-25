# 📖 Quick Reference Guide

## Directory Structure at a Glance

```
ride_and_park_backend/
├── src/                          ← Backend NestJS API
│   ├── users/                    ← User auth endpoints
│   ├── verification/             ← Email, phone, identity, taxi verification
│   ├── schemas/                  ← MongoDB models
│   └── guards/                   ← Role-based access control
│
└── mobile/                       ← React Native app (YOU ARE HERE)
    ├── src/
    │   ├── api/                  ← Axios client + endpoint definitions
    │   ├── store/                ← Zustand state management
    │   ├── types/                ← TypeScript interfaces
    │   ├── navigation/           ← React Navigation setup
    │   ├── screens/              ← Screen components (to build)
    │   ├── components/           ← Reusable UI components (to build)
    │   ├── utils/                ← Helper functions
    │   └── constants/            ← Theme, colors, spacing
    ├── App.tsx                   ← Entry point
    └── package.json              ← Dependencies
```

## Import Paths (Using Aliases)

```typescript
// ✅ DO THIS
import { User, AuthResponse } from '@/types';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { COLORS, SPACING } from '@/constants/theme';

// ❌ DON'T DO THIS
import { User } from '../../../../src/types';
import { authApi } from '../../../../src/api';
```

## Authentication Flow (High Level)

```
User Opens App
    ↓
Restore Token from Device Storage (/src/store/authStore.ts)
    ↓
If Token Exists → Load User → Show Role-Specific Dashboard
If No Token → Show Auth Stack (Login/Signup)
    ↓
User Logs In
    ↓
Call authApi.login() → Get token + user
    ↓
Store token securely + update authStore
    ↓
Axios automatically adds token to all future requests
    ↓
If token expires (401) → Auto logout → Back to Auth
```

## Adding a New Endpoint

### Step 1: Backend

Add endpoint in `ride_and_park_backend/src/users/users.controller.ts`

### Step 2: Add Type

Update `mobile/src/types/index.ts`:

```typescript
export interface NewResponse {
  // fields...
}
```

### Step 3: Add API Method

Update `mobile/src/api/index.ts`:

```typescript
export const myApi = {
  myMethod: (data: any) =>
    api.post<ApiResponse<NewResponse>>('/endpoint', data),
};
```

### Step 4: Use in Screen

```typescript
import { myApi } from '@/api';

const response = await myApi.myMethod(data);
```

## Component Template

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { COLORS, SPACING } from '@/constants/theme';

export function MyScreen() {
  const { user } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello {user?.firstName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.deepNavy,
    padding: SPACING.lg,
  },
  title: {
    color: COLORS.cloudWhite,
    fontSize: 24,
    fontWeight: '600',
  },
});
```

## State Management Patterns

### Access Store

```typescript
const { user, token, logout } = useAuthStore();
```

### Update Store

```typescript
const store = useAuthStore();
store.setUser(newUser);
store.setToken(newToken);
```

### Async Operations

```typescript
const { setIsLoading, setError } = useBookingStore();

const handleBooking = async () => {
  setIsLoading(true);
  try {
    const result = await parkingApi.createBooking(...);
    // Handle success
  } catch (err) {
    setError(err.message);
  } finally {
    setIsLoading(false);
  }
};
```

## Screens to Build (Phase 1)

```
Authentication Stack
├── OnboardingScreen         ← Hero cards: Consumer / Provider / Login
├── SignUpScreen             ← Email, password, name
├── EmailOtpScreen           ← 6-digit OTP entry
├── PhoneOtpScreen           ← SMS verification
├── LoginScreen              ← Email + password

Consumer Stack (Bottom Tabs)
├── ConsumerHomeScreen       ← 3 hero cards: Parking / Taxi / Driver
├── SearchScreen             ← Postcode search, map view
├── BookingsScreen           ← Active + past bookings
├── WalletScreen             ← Payment methods, transaction history
└── ProfileScreen            ← User info, settings

Provider Stack (Bottom Tabs)
├── ProviderHomeScreen       ← List services, go online/offline
├── ProviderRequestsScreen   ← Incoming booking requests (accept/decline)
├── ProviderEarningsScreen   ← Revenue dashboard
├── ProviderVerificationScreen ← 6-step wizard (see VERIFICATION_WIZARD.md)
└── ProfileScreen            ← Edit profile, settings
```

## Testing Locally

### Start Backend

```bash
cd ride_and_park_backend
npm run start:dev
```

### Start Mobile App

```bash
cd mobile
npm start
# Press 'i' for iOS or 'a' for Android
# Or scan QR with Expo Go app
```

### Test Login

```
Email: test@example.com
Password: password123
```

## Common Errors & Solutions

| Error                         | Cause                      | Fix                                   |
| ----------------------------- | -------------------------- | ------------------------------------- |
| `Cannot GET /api/users/login` | Backend not running        | Start backend: `npm run start:dev`    |
| `Port 5000 already in use`    | Another process using port | Change PORT in backend `.env`         |
| `Cannot find module '@/api'`  | Path alias not resolved    | Check `tsconfig.json` paths           |
| `Token undefined in header`   | Token not in SecureStore   | Login again to refresh token          |
| `CORS error`                  | Backend CORS config wrong  | Check backend `main.ts` CORS settings |

## Color Palette Quick Copy

```typescript
const COLORS = {
  deepNavy: '#0D1B2A', // Primary background
  electricTeal: '#00C2A8', // Primary action (buttons, links)
  cloudWhite: '#F5F8FF', // Card backgrounds, secondary surfaces
  steelBlue: '#1A3C6E', // Section headers, elevated surfaces
  softSlate: '#8899BB', // Secondary text, placeholders
  amber: '#F39C12', // Warnings, pending states
  coralRed: '#E74C3C', // Errors, cancellation
};
```

## Spacing Reference

```typescript
const SPACING = {
  xs: 4, // Minimal spacing
  sm: 8, // Small gaps
  md: 12, // Medium gaps
  lg: 16, // Standard padding (screens, cards)
  xl: 24, // Large sections
  '2xl': 32, // Extra large sections
  '3xl': 48, // Hero sections
};
```

## Debug Tips

### Check Current User

```typescript
const { user, token } = useAuthStore.getState();
console.log('Current User:', user);
console.log('Token:', token?.substring(0, 20) + '...');
```

### Check All Store State

```typescript
console.log(useAuthStore.getState());
console.log(useBookingStore.getState());
console.log(useVerificationStore.getState());
```

### Test API Endpoints

Use REST Client in VS Code with `.rest` files in backend:

- `backend/.rests/user.rest`
- `backend/.rests/email-verification.rest`
- `backend/.rests/phone-verification.rest`

---

**Questions?** Check:

1. `SETUP.md` - Installation & running
2. `ARCHITECTURE.md` - System design
3. Backend `README.md` - API specification
