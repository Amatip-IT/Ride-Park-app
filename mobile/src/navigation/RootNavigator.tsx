import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '@/store/authStore';
import { UserRole } from '@/types';
import { Ionicons } from '@expo/vector-icons';

// Screen imports
import { AuthScreen } from '@/screens/AuthScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { SplashScreen } from '@/screens/SplashScreen';
import { ForgotPasswordScreen } from '@/screens/ForgotPasswordScreen';
import { LegalDocumentScreen } from '@/screens/LegalDocumentScreen';
import { ConsumerHomeScreen } from '@/screens/ConsumerHomeScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { BookingsScreen } from '@/screens/BookingsScreen';
import { WalletScreen } from '@/screens/WalletScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { EditProfileScreen } from '@/screens/EditProfileScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { ServiceChoiceScreen } from '@/screens/ServiceChoiceScreen';
import { DriverRequestScreen } from '@/screens/DriverRequestScreen';
import { TaxiBookingScreen } from '@/screens/TaxiBookingScreen';
import { ParkingDetailScreen } from '@/screens/ParkingDetailScreen';
import { PassengerTrackingScreen } from '@/screens/PassengerTrackingScreen';
import { MapPreviewScreen } from '@/screens/MapPreviewScreen';
import { ChatListScreen } from '@/screens/ChatListScreen';
import { ChatScreen } from '@/screens/ChatScreen';
import { ProviderHomeScreen } from '@/screens/ProviderHomeScreen';
import { ProviderRequestsScreen } from '@/screens/ProviderRequestsScreen';
import { ProviderEarningsScreen } from '@/screens/ProviderEarningsScreen';
import { ProviderSpaceManagementScreen } from '@/screens/ProviderSpaceManagementScreen';
import { DriverVerificationScreen } from '@/screens/DriverVerificationScreen';
import { DriverRideRequestsScreen } from '@/screens/DriverRideRequestsScreen';
import { ProviderActiveJourneyScreen } from '@/screens/ProviderActiveJourneyScreen';
import { DocumentUploadScreen } from '@/screens/DocumentUploadScreen';
import { AdminDashboardScreen } from '@/screens/AdminDashboardScreen';
import { AdminUsersScreen } from '@/screens/AdminUsersScreen';
import { AdminVerificationQueueScreen } from '@/screens/AdminVerificationQueueScreen';
import { AdminDriverQueueScreen } from '@/screens/AdminDriverQueueScreen';
import { AdminIdentityQueueScreen } from '@/screens/AdminIdentityQueueScreen';

// Lazy-loaded admin sub-screens (may or may not exist yet)
let AdminProviderDetailScreen: any = null;
let AdminPayoutsQueueScreen: any = null;
let AdminPlatformSettingsScreen: any = null;

try { AdminProviderDetailScreen = require('@/screens/AdminProviderDetailScreen').AdminProviderDetailScreen; } catch {}
try { AdminPayoutsQueueScreen = require('@/screens/AdminPayoutsQueueScreen').AdminPayoutsQueueScreen; } catch {}
try { AdminPlatformSettingsScreen = require('@/screens/AdminPlatformSettingsScreen').AdminPlatformSettingsScreen; } catch {}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();
const AdminStack = createNativeStackNavigator();
const ProviderStack = createNativeStackNavigator();
const ConsumerStack = createNativeStackNavigator();

// Consumer Tabs (Home, Search, Bookings, Wallet, Profile)
const ConsumerTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00C2A8',
      tabBarInactiveTintColor: '#999999',
      tabBarStyle: {
        backgroundColor: '#FFFFFF',
        borderTopColor: '#EEEEEE',
      },
    }}
  >
    <Tab.Screen
      name="ConsumerHome"
      component={ConsumerHomeScreen}
      options={{
        title: 'Home',
        tabBarLabel: 'Home',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="home" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Search"
      component={SearchScreen}
      options={{
        title: 'Search',
        tabBarLabel: 'Search',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="search" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Bookings"
      component={BookingsScreen}
      options={{
        title: 'My Bookings',
        tabBarLabel: 'Bookings',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="calendar" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Wallet"
      component={WalletScreen}
      options={{
        title: 'Wallet',
        tabBarLabel: 'Wallet',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="wallet" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        title: 'Profile',
        tabBarLabel: 'Profile',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="person" size={size} color={color} />
        ),
      }}
    />
  </Tab.Navigator>
);

// Consumer Navigation — Stack wrapping tabs so sub-screens can push on top
const ConsumerNavigator = () => (
  <ConsumerStack.Navigator screenOptions={{ headerShown: false }}>
    <ConsumerStack.Screen name="ConsumerTabs" component={ConsumerTabs} />
    {/* Service flows */}
    <ConsumerStack.Screen name="ServiceChoice" component={ServiceChoiceScreen} />
    <ConsumerStack.Screen name="DriverRequest" component={DriverRequestScreen} />
    <ConsumerStack.Screen name="TaxiBooking" component={TaxiBookingScreen} />
    {/* Search result details */}
    <ConsumerStack.Screen name="ParkingDetail" component={ParkingDetailScreen} />
    {/* Tracking */}
    <ConsumerStack.Screen name="PassengerTracking" component={PassengerTrackingScreen} />
    <ConsumerStack.Screen name="MapPreview" component={MapPreviewScreen} />
  </ConsumerStack.Navigator>
);

// Provider Tabs (inner tab navigation)
const ProviderTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00C2A8',
      tabBarInactiveTintColor: '#999999',
      tabBarStyle: {
        backgroundColor: '#FFFFFF',
        borderTopColor: '#EEEEEE',
      },
    }}
  >
    <Tab.Screen
      name="ProviderHome"
      component={ProviderHomeScreen}
      options={{
        title: 'Home',
        tabBarLabel: 'Home',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="home" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="ProviderRequests"
      component={ProviderRequestsScreen}
      options={{
        title: 'Requests',
        tabBarLabel: 'Requests',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="document-text" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="ProviderEarnings"
      component={ProviderEarningsScreen}
      options={{
        title: 'Earnings',
        tabBarLabel: 'Earnings',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="cash" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="ProviderProfile"
      component={ProfileScreen}
      options={{
        title: 'Profile',
        tabBarLabel: 'Profile',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="person" size={size} color={color} />
        ),
      }}
    />
  </Tab.Navigator>
);

// Provider Navigation — Stack wrapping tabs so sub-screens can push on top
const ProviderNavigator = () => (
  <ProviderStack.Navigator screenOptions={{ headerShown: false }}>
    <ProviderStack.Screen name="ProviderTabs" component={ProviderTabs} />
    <ProviderStack.Screen name="ProviderSpaceManagement" component={ProviderSpaceManagementScreen} />
    {/* Driver/Taxi specific screens */}
    <ProviderStack.Screen name="DriverRideRequests" component={DriverRideRequestsScreen} />
    <ProviderStack.Screen name="ProviderActiveJourney" component={ProviderActiveJourneyScreen} />
    <ProviderStack.Screen name="DriverVerification" component={DriverVerificationScreen} />
    <ProviderStack.Screen name="DocumentUpload" component={DocumentUploadScreen} />
  </ProviderStack.Navigator>
);

// Placeholder for screens that may not exist yet
const PlaceholderScreen = () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D1B2A' }}>
      <Text style={{ color: '#8899BB', fontSize: 16 }}>Coming Soon</Text>
    </View>
  );
};

// Admin Navigation — Stack-based so sub-screens can push on top
const AdminNavigator = () => (
  <AdminStack.Navigator screenOptions={{ headerShown: false }}>
    <AdminStack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
    <AdminStack.Screen name="AdminVerificationQueue" component={AdminVerificationQueueScreen} />
    <AdminStack.Screen name="AdminDriverQueue" component={AdminDriverQueueScreen} />
    <AdminStack.Screen name="AdminIdentityQueue" component={AdminIdentityQueueScreen} />
    <AdminStack.Screen name="AdminUsers" component={AdminUsersScreen} />
    <AdminStack.Screen
      name="AdminProviderDetail"
      component={AdminProviderDetailScreen || PlaceholderScreen}
    />
    <AdminStack.Screen
      name="AdminPayoutsQueue"
      component={AdminPayoutsQueueScreen || PlaceholderScreen}
    />
    <AdminStack.Screen
      name="AdminPlatformSettings"
      component={AdminPlatformSettingsScreen || PlaceholderScreen}
    />
  </AdminStack.Navigator>
);

// Root Navigator with authentication flow
export const RootNavigator = () => {
  const { isAuthenticated, isOnboarded, restoreToken, user } = useAuthStore();
  const userRole = user?.role || 'user';
  const [isLoading, setIsLoading] = React.useState(true);

  useEffect(() => {
    bootstrapAsync();
  }, []);

  const bootstrapAsync = async () => {
    try {
      await restoreToken();
    } catch (e) {
      console.log('Failed to restore token:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Show Splash while restoring session
  if (isLoading) {
    return <SplashScreen />;
  }

  console.log('🔍 DEBUG - RootNavigator State:', { isOnboarded, isAuthenticated, userRole });

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* Onboarding Flow - Always show first */}
        <Stack.Group
          screenOptions={{
            contentStyle: { backgroundColor: '#0D1B2A' },
          }}
        >
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        </Stack.Group>

        {/* Authentication Flow - Show if not authenticated (after onboarding) */}
        {!isAuthenticated && isOnboarded && (
          <Stack.Group
            screenOptions={{
              contentStyle: { backgroundColor: '#0D1B2A' },
            }}
          >
            <Stack.Screen name="Auth" component={AuthScreen} />
          </Stack.Group>
        )}

        {/* Auth Modal Screens - Overlay on top of Auth flow */}
        {!isAuthenticated && isOnboarded && (
          <Stack.Group
            screenOptions={{
              presentation: 'modal',
              headerShown: false,
              contentStyle: { backgroundColor: '#0D1B2A' },
            }}
          >
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} />
          </Stack.Group>
        )}

        {/* Application Flow - Show if authenticated */}
        {isAuthenticated && (
          <Stack.Group
            screenOptions={{
              contentStyle: { backgroundColor: '#0D1B2A' },
            }}
          >
            {userRole === 'admin' ? (
              <Stack.Screen name="AdminApp" component={AdminNavigator} />
            ) : userRole === 'user' ? (
              <Stack.Screen name="ConsumerApp" component={ConsumerNavigator} />
            ) : (
              <Stack.Screen name="ProviderApp" component={ProviderNavigator} />
            )}
          </Stack.Group>
        )}

        {/* Shared Modal Screens - Accessible from any authenticated context */}
        {isAuthenticated && (
          <Stack.Group
            screenOptions={{
              presentation: 'modal',
              headerShown: false,
              contentStyle: { backgroundColor: '#0D1B2A' },
            }}
          >
            <Stack.Screen name="ChatList" component={ChatListScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export type RootStackParamList = {
  // Auth Flow
  Onboarding: undefined;
  Auth: { isLogin?: boolean; role?: 'user' | 'parking_provider' | 'driver' | 'taxi_driver' } | undefined;
  ForgotPassword: undefined;
  LegalDocument: undefined;
  // App Navigators
  ConsumerApp: undefined;
  ProviderApp: undefined;
  AdminApp: undefined;
  // Consumer Stack (nested)
  ConsumerTabs: undefined;
  ServiceChoice: { mode: 'driver' | 'taxi' };
  DriverRequest: undefined;
  TaxiBooking: undefined;
  ParkingDetail: { parkingId: string };
  PassengerTracking: { bookingId: string };
  MapPreview: { latitude?: number; longitude?: number } | undefined;
  // Provider Stack (nested)
  ProviderTabs: undefined;
  ProviderSpaceManagement: undefined;
  DriverRideRequests: undefined;
  ProviderActiveJourney: { journeyId: string };
  DriverVerification: undefined;
  DocumentUpload: undefined;
  // Admin Stack (nested)
  AdminDashboard: undefined;
  AdminVerificationQueue: undefined;
  AdminDriverQueue: undefined;
  AdminIdentityQueue: undefined;
  AdminUsers: undefined;
  AdminProviderDetail: { providerId: string };
  AdminPayoutsQueue: undefined;
  AdminPlatformSettings: undefined;
  // Shared Modals (accessible from any stack)
  ChatList: undefined;
  Chat: { conversationId: string };
  EditProfile: undefined;
  Notifications: undefined;
};
