# Ride & Park Mobile App

React Native mobile application for the Ride & Park platform using Expo, TypeScript, and modern state management.

## Project Structure

```
mobile/
├── src/
│   ├── api/              # API client and endpoints (Axios)
│   ├── contexts/         # React contexts (if needed alongside Zustand)
│   ├── types/            # TypeScript types and interfaces
│   ├── screens/          # Screen components (organized by feature)
│   ├── store/            # Zustand state management
│   │   ├── authStore.ts  # Auth & role state
│   │   └── index.ts      # Booking, verification, UI stores
│   ├── navigation/       # React Navigation structure (role-aware routing)
│   ├── utils/            # Helper functions & validation
│   ├── components/       # Reusable UI components (to be created)
│   └── constants/        # Theme, colors, spacing
├── assets/               # Images, fonts, icons
├── App.tsx               # Root entry point
├── app.json              # Expo configuration
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config with path aliases
└── .env.example          # Environment variables template
```

## Setup & Installation

### Prerequisites

- Node.js v18+ (with npm or yarn)
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your phone (for live preview)
- Backend running on `http://localhost:5000` (or configure `EXPO_PUBLIC_API_URL`)

### Steps

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create `.env` file** from `.env.example`

   ```bash
   cp .env.example .env
   ```

   Update `EXPO_PUBLIC_API_URL` to match your backend URL.

3. **Start the development server**

   ```bash
   npm start
   ```

4. **Preview the app**
   - **iOS Simulator**: Press `i`
   - **Android Emulator**: Press `a`
   - **Expo Go (Phone)**: Scan QR code with Expo Go app (iOS) or phone camera (Android)

## Tech Stack

| Layer              | Technology                        |
| ------------------ | --------------------------------- |
| **Framework**      | React Native (v0.81) + Expo       |
| **Language**       | TypeScript v5.9                   |
| **Navigation**     | React Navigation v6 + Bottom Tabs |
| **State**          | Zustand (stores)                  |
| **API**            | Axios with JWT interceptors       |
| **Forms**          | React Hook Form + Zod validation  |
| **Secure Storage** | expo-secure-store (tokens)        |
| **Payments**       | Stripe React Native SDK           |
| **Notifications**  | Expo Notifications                |

## Available Scripts

| Command              | Description              |
| -------------------- | ------------------------ |
| `npm start`          | Start development server |
| `npm run ios`        | Start iOS simulator      |
| `npm run android`    | Start Android emulator   |
| `npm run web`        | Start web preview        |
| `npm run lint`       | Run ESLint               |
| `npm run type-check` | Check TypeScript types   |

## Architecture Overview

### Authentication Flow

1. **Token Storage**: JWT tokens stored securely in device storage (`expo-secure-store`)
2. **API Interceptors**: Axios automatically adds `Authorization: Bearer <token>` to all requests
3. **Token Refresh**: On 401 response, user is logged out
4. **State Persistence**: Token restored on app launch via `useAuthStore.restoreToken()`

### State Management (Zustand)

- **authStore**: User, token, authentication status
- **roleStore**: User role (consumer, provider, admin) for navigation routing
- **bookingStore**: Current booking, booking list, loading/error states
- **verificationStore**: Step-by-step verification flow tracking
- **UIStore**: Dark mode, loading, toast notifications

### Navigation Structure (Role-Aware)

- **Unauthenticated**: Auth Stack (register, login, onboarding)
- **Consumer**: Bottom tab navigation (Home, Search, Bookings, Wallet, Profile)
- **Provider**: Bottom tab navigation (Services, Requests, Earnings, Verification, Profile)
- **Admin**: Bottom tab navigation (Dashboard, Users, Verifications)

## API Integration

All API calls go through `/src/api/index.ts`:

```typescript
import { authApi, parkingApi, driverApi, taxiApi } from '@/api';

// Example: Login
const response = await authApi.login({ email, password });
const { user, token } = response.data.data;
await useAuthStore.getState().login(user, token);

// Example: Search parking
const spaces = await parkingApi.searchSpaces('SW1A1AA');
```

## Phase 1 Features (MVP)

- [x] Project setup & scaffolding
- [ ] Authentication (signup, login, email/phone OTP)
- [ ] Parking provider onboarding (verification wizard)
- [ ] Parking search & booking (consumer)
- [ ] Provider booking management
- [ ] Push notifications

## Next Steps

1. **Create screen components** for auth flow
2. **Implement authentication screens** (login, signup, OTP verification)
3. **Build parking provider verification wizard**
4. **Create consumer parking search & booking flow**
5. **Add payment integration** (Stripe)

## Styling & Theme

The app uses a **premium dark-mode aesthetic** matching the design spec:

- **Colors**: Deep Navy (#0D1B2A), Electric Teal (#00C2A8), Cloud White (#F5F8FF)
- **Typography**: Inter / DM Sans for body, Clash Display for headers
- **Spacing**: 8px base unit (4, 8, 12, 16, 24, 32, 48)
- **See**: `/src/constants/theme.ts` for full palette

## Troubleshooting

### Port already in use

```bash
# Kill process on port 19000
npx kill-port 19000
```

### Clear cache & restart

```bash
npm start --reset-cache
```

### Path alias not resolving

Ensure `tsconfig.json` paths match imports exactly:

```typescript
import { user } from '@/types'; // ✅ Correct
import { user } from './types'; // ❌ Avoid
```

### Backend not connecting

1. Check `EXPO_PUBLIC_API_URL` in `.env`
2. Ensure backend is running: `npm run start:dev` from ride_and_park_backend
3. For physical device: Use your machine's local IP (not localhost)

## Resources

- [React Navigation Docs](https://reactnavigation.org/)
- [Expo Docs](https://docs.expo.dev/)
- [Zustand Docs](https://github.com/pmndrs/zustand)
- [Axios Docs](https://axios-http.com/)
- [React Hook Form Docs](https://react-hook-form.com/)

---

**Version**: 1.0.0  
**Created**: March 2026  
**Last Updated**: March 17, 2026
