# 🗺️ App Flow Diagram

## Authentication & Navigation Flow

```
APP LAUNCH
    ↓
┌─────────────────────────────────────┐
│ RootNavigator (src/navigation/)     │
│ - Checks useAuthStore for token    │
│ - Handles boot-time token restore  │
└─────────────────────────────────────┘
    ↓
    ├─── IF NO TOKEN ──────────────────────────────→ AUTH STACK
    │                                               ├── Onboarding
    │                                               │   ├── Consumer signup
    │                                               │   ├── Provider signup
    │                                               │   └── Login
    │                                               ├── Sign Up
    │                                               ├── Email OTP
    │                                               ├── Phone OTP
    │                                               └── Login
    │
    └─── IF TOKEN EXISTS & VALID ──→ CHECK ROLE ──→ Route to Role Stack
                                        ↓
                   ┌────────────────────┼────────────────────┐
                   ↓                    ↓                    ↓
            CONSUMER STACK      PROVIDER STACK        ADMIN STACK
            (Bottom Tabs)       (Bottom Tabs)         (Bottom Tabs)

            ├─ Home             ├─ Services           ├─ Dashboard
            ├─ Search           ├─ Requests           ├─ Users
            ├─ Bookings         ├─ Earnings           ├─ Verifications
            ├─ Wallet           ├─ Verification       └─ Profile
            └─ Profile          └─ Profile
```

## State Management Layers

```
┌──────────────────────────────────────────────────────────────┐
│                    APPLICATION STATE                         │
└──────────────────────────────────────────────────────────────┘
              ↓           ↓           ↓           ↓
    ┌─────────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐
    │ authStore   │  │booking   │  │verif.    │  │UIStore │
    │             │  │Store     │  │Store     │  │        │
    │ - user      │  │          │  │          │  │- dark  │
    │ - token     │  │- current │  │- step    │  │- toast │
    │ - login()   │  │- list    │  │- data    │  │-loading│
    │ - logout()  │  │- add()   │  │- complete│ │        │
    └─────────────┘  └──────────┘  │- reset() │  └────────┘
         ↓                ↓          └──────────┘      ↓
    ┌─────────────────────────────────────────────────────┐
    │        ⚡ ZUSTAND STORES (Persistent State)         │
    └─────────────────────────────────────────────────────┘
         ↓
    Used by Components & Screens via React Hooks

    useAuthStore()           ← Authentication & role
    useBookingStore()        ← Active bookings & booking CRUD
    useVerificationStore()   ← Multi-step verification progress
    useUIStore()             ← App-wide UI state
```

## API Request Flow

```
┌─────────────────────────────────────┐
│       Component/Screen              │
│  import { parkingApi } from '@/api' │
└─────────────────────────────────────┘
         ↓
   parkingApi.searchSpaces('SW1A1AA')
         ↓
┌─────────────────────────────────────────────────┐
│  API Client Interceptor (src/api/client.ts)    │
│  - Adds Authorization: Bearer {token}          │
│  - Sets Content-Type headers                    │
└─────────────────────────────────────────────────┘
         ↓
    ┌──────────────────────┐
    │   Axios Request      │
    │ POST /api/parking/   │
    │ search?postcode=...  │
    └──────────────────────┘
         ↓
┌──────────────────────────────────────────┐
│  📡  BACKEND (NestJS)                   │
│  ride_and_park_backend/src/parking/controller
│  - Authenticates using @UseGuards(AuthGuard)
│  - Validates request using DTO
│  - Fetches data from MongoDB
│  - Returns ApiResponse<ParkingSpace[]>
└──────────────────────────────────────────┘
         ↓
    ┌──────────────────────┐
    │  Axios Response      │
    │  status: 200         │
    │  data: {             │
    │    success: true,    │
    │    data: [...]       │
    │  }                   │
    └──────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│    Response Interceptor                 │
│    - Checks for 401 (auto logout)      │
│    - Handles errors                     │
└─────────────────────────────────────────┘
         ↓
  Component receives data → Update UI
```

## Data Flow: User Registration Example

```
1. USER ENTERS DETAILS
   ↓
   OnboardingScreen.tsx (as Consumer)
   ├─ Email: user@example.com
   ├─ Password: secure123
   ├─ First Name: John
   └─ Last Name: Doe

2. SUBMIT SIGNUP
   ↓
   authApi.register({...form data...})
   ↓
   POST /api/users/register

3. BACKEND PROCESSES
   ↓
   NestJS UsersController.register()
   ├─ Hash password with bcrypt
   ├─ Create user in MongoDB
   ├─ Generate JWT token
   └─ Return { user, token }

4. APP STORES RESULT
   ↓
   useAuthStore.login(user, token)
   ├─ Save token to secure storage
   ├─ Update user in store
   ├─ Set isAuthenticated = true
   └─ Update role in useRoleStore

5. NAVIGATION UPDATES
   ↓
   RootNavigator sees isAuthenticated: true
   ├─ Exits Auth Stack
   └─ Enters Consumer Stack
      ├─ Home (3 hero cards)
      ├─ Search
      ├─ Bookings (empty)
      ├─ Wallet
      └─ Profile
```

## Verification Wizard Flow (Provider Onboarding)

```
ProviderOnboarding (6 Steps)
    ↓
[Step 1] Email Verification
├─ Email OTP sent via Gmail
├─ User enters 6-digit code
├─ Store in verificationStore.completedSteps
└─ Move to Step 2
    ↓
[Step 2] Phone Verification
├─ SMS OTP sent via Twilio
├─ User enters code
├─ Mark email verified in backend
└─ Move to Step 3
    ↓
[Step 3] Identity Verification (Stripe Identity)
├─ Capture passport or driving license
├─ Take selfie for face match
├─ Stripe processes & returns result
├─ Update verified status in DB
└─ Move to Step 4
    ↓
[Step 4] DVLA Check (Driver/Taxi Only)
├─ Enter UK driving license number
├─ Query DVLA API
├─ Verify license validity & endorsements
└─ Move to Step 5
    ↓
[Step 5] MOT Check (Taxi Only)
├─ Enter vehicle registration plate
├─ Query MOT History API
├─ Verify MOT status, expiry, defects
└─ Move to Step 6
    ↓
[Step 6] Document Upload (Taxi Only)
├─ Upload insurance certificate
├─ Upload PCO/taxi license
├─ All files → AWS S3
├─ Mark as under_review
└─ Submit for admin approval
    ↓
Admin Review (Backend)
├─ Admin dashboard approves/rejects
├─ If approved → user.isVerified = true
├─ If rejected → send reason, restart flow
└─ Notification sent to user
    ↓
User Goes Live
├─ Can now accept bookings
├─ Appears in search results
├─ Receives real-time requests
└─ Earns from completed transactions
```

## Screen Component Architecture

```
src/screens/
├── auth/
│   ├── OnboardingScreen.tsx
│   ├── SignUpScreen.tsx
│   ├── LoginScreen.tsx
│   ├── EmailOtpScreen.tsx
│   └── PhoneOtpScreen.tsx
│
├── consumer/
│   ├── ConsumerHomeScreen.tsx      ← 3 hero cards
│   ├── SearchScreen.tsx             ← Postcode search
│   ├── ParkingSearchScreen.tsx       ← Map view + list
│   ├── ParkingDetailScreen.tsx       ← Photos + booking form
│   ├── BookingConfirmScreen.tsx      ← Payment (Stripe)
│   ├── BookingsScreen.tsx            ← Active + history
│   ├── WalletScreen.tsx              ← Payment methods
│   └── ProfileScreen.tsx
│
├── provider/
│   ├── ProviderHomeScreen.tsx
│   ├── ProviderRequestsScreen.tsx    ← Accept/Decline
│   ├── ProviderEarningsScreen.tsx
│   ├── ProviderVerificationScreen.tsx ← Wizard (6 steps)
│   │   ├── EmailVerificationStep.tsx
│   │   ├── PhoneVerificationStep.tsx
│   │   ├── IdentityVerificationStep.tsx
│   │   ├── DvlaVerificationStep.tsx
│   │   ├── MotVerificationStep.tsx
│   │   └── DocumentUploadStep.tsx
│   └── ProfileScreen.tsx
│
└── admin/
    ├── AdminDashboardScreen.tsx
    ├── AdminUsersScreen.tsx
    └── AdminVerificationQueueScreen.tsx
```

## Component Usage Pattern

```typescript
// Screen Component Template
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';

// Import stores & utilities
import { useAuthStore } from '@/store/authStore';
import { useBookingStore } from '@/store';
import { parkingApi } from '@/api';
import { COLORS, SPACING } from '@/constants/theme';

export function ParkingSearchScreen() {
  const { user } = useAuthStore();
  const { bookings, addBooking, isLoading } = useBookingStore();
  const [spaces, setSpaces] = React.useState([]);

  useEffect(() => {
    const searchSpaces = async () => {
      try {
        const response = await parkingApi.searchSpaces('SW1A1AA');
        setSpaces(response.data.data);
      } catch (error) {
        console.error('Search failed:', error);
      }
    };

    searchSpaces();
  }, []);

  if (isLoading) return <ActivityIndicator />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Available Spaces</Text>
      <FlatList
        data={spaces}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.spaceName}>{item.name}</Text>
            <Text style={styles.price}>{item.hourlyRate}/hr</Text>
          </View>
        )}
        keyExtractor={(item) => item._id}
      />
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
    marginBottom: SPACING.xl,
  },
  card: {
    backgroundColor: COLORS.steelBlue,
    borderRadius: 12,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  spaceName: {
    color: COLORS.cloudWhite,
    fontSize: 18,
    fontWeight: '500',
  },
  price: {
    color: COLORS.electricTeal,
    fontSize: 16,
    fontWeight: '600',
    marginTop: SPACING.md,
  },
});
```

---

**All pieces are in place! Ready to build screens? 🚀**
