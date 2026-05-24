import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '@/store/authStore';
import { UserRole } from '@/types';

// Screen imports
import { AuthScreen } from '@/screens/AuthScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { SplashScreen } from '@/screens/SplashScreen';
import { AnimatedSplashScreen } from '@/screens/AnimatedSplashScreen';
import { Ionicons } from '@expo/vector-icons';
import { EditProfileScreen } from '@/screens/EditProfileScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { DriverVerificationScreen } from '@/screens/DriverVerificationScreen';
import { LegalDocumentScreen } from '@/screens/LegalDocumentScreen';
import { DocumentUploadScreen } from '@/screens/DocumentUploadScreen';
import { ForgotPasswordScreen } from '@/screens/ForgotPasswordScreen';
import { ConsumerHomeScreen } from '@/screens/ConsumerHomeScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { BookingsScreen } from '@/screens/BookingsScreen';
import { WalletScreen } from '@/screens/WalletScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { ServiceChoiceScreen } from '@/screens/ServiceChoiceScreen';
import { TaxiBookingScreen } from '@/screens/TaxiBookingScreen';
import { DriverRequestScreen } from '@/screens/DriverRequestScreen';
import { PassengerTrackingScreen } from '@/screens/PassengerTrackingScreen';
import { ParkingDetailScreen } from '@/screens/ParkingDetailScreen';
import { ChatListScreen } from '@/screens/ChatListScreen';
import { ChatScreen } from '@/screens/ChatScreen';
import { MapPreviewScreen } from '@/screens/MapPreviewScreen';
import { ProviderHomeScreen } from '@/screens/ProviderHomeScreen';
import { ProviderRequestsScreen } from '@/screens/ProviderRequestsScreen';
import { ProviderEarningsScreen } from '@/screens/ProviderEarningsScreen';
import { ProviderVerificationScreen } from '@/screens/ProviderVerificationScreen';
import { ProviderSpaceManagementScreen } from '@/screens/ProviderSpaceManagementScreen';
import { DriverRideRequestsScreen } from '@/screens/DriverRideRequestsScreen';
import { ProviderActiveJourneyScreen } from '@/screens/ProviderActiveJourneyScreen';
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
const AdminStack = createNativeStackNavigator();
const ProviderStack = createNativeStackNavigator();

// Consumer Navigation (Home, Search, Bookings, Wallet, Profile)
const ConsumerNavigator = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00C2A8',
      tabBarInactiveTintColor: '#8899BB',
      tabBarStyle: {
        backgroundColor: '#FFFFFF',
        borderTopColor: '#F0F2F5',
        borderTopWidth: 1,
        height: Platform.OS === 'ios' ? 85 : 70,
        paddingBottom: Platform.OS === 'ios' ? 25 : 12,
        paddingTop: 8,
      },
    }}
  >
    <Tab.Screen
      name="ConsumerHome"
      component={ConsumerHomeScreen}
      options={{
        title: 'Home',
        tabBarLabel: 'Home',
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Search"
      component={SearchScreen}
      options={{
        title: 'Search',
        tabBarLabel: 'Search',
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={focused ? "search" : "search-outline"} size={22} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Bookings"
      component={BookingsScreen}
      options={{
        title: 'My Bookings',
        tabBarLabel: 'Bookings',
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={focused ? "calendar" : "calendar-outline"} size={22} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Wallet"
      component={WalletScreen}
      options={{
        title: 'Wallet',
        tabBarLabel: 'Wallet',
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        title: 'Profile',
        tabBarLabel: 'Profile',
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
        ),
      }}
    />
  </Tab.Navigator>
);

// Provider Tabs (inner tab navigation)
const ProviderTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00C2A8',
      tabBarInactiveTintColor: '#8899BB',
      tabBarStyle: {
        backgroundColor: '#FFFFFF',
        borderTopColor: '#F0F2F5',
        borderTopWidth: 1,
        height: Platform.OS === 'ios' ? 85 : 70,
        paddingBottom: Platform.OS === 'ios' ? 25 : 12,
        paddingTop: 8,
      },
    }}
  >
    <Tab.Screen
      name="ProviderHome"
      component={ProviderHomeScreen}
      options={{
        title: 'Home',
        tabBarLabel: 'Home',
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="ProviderRequests"
      component={ProviderRequestsScreen}
      options={{
        title: 'Requests',
        tabBarLabel: 'Requests',
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={focused ? "notifications" : "notifications-outline"} size={22} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="ProviderEarnings"
      component={ProviderEarningsScreen}
      options={{
        title: 'Earnings',
        tabBarLabel: 'Earnings',
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={focused ? "cash" : "cash-outline"} size={22} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="ProviderProfile"
      component={ProfileScreen}
      options={{
        title: 'Profile',
        tabBarLabel: 'Profile',
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
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
    <ProviderStack.Screen name="DriverRideRequests" component={DriverRideRequestsScreen} />
    <ProviderStack.Screen name="ProviderActiveJourney" component={ProviderActiveJourneyScreen} />
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
  const { isAuthenticated, restoreToken, user } = useAuthStore();
  const userRole = user?.role || 'user';
  const [isLoading, setIsLoading] = React.useState(true);
  const [showSplash, setShowSplash] = React.useState(true);

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

  if (isLoading || showSplash) {
    return <AnimatedSplashScreen onAnimationComplete={() => setShowSplash(false)} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          // Auth Stack
          <Stack.Group
            screenOptions={{
              contentStyle: { backgroundColor: '#0D1B2A' },
            }}
          >
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Auth" component={AuthScreen} />
          </Stack.Group>
        ) : (
          // App Stack - Role-based
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
        <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="DriverVerification" component={DriverVerificationScreen} />
        <Stack.Screen name="ProviderVerification" component={ProviderVerificationScreen} />
        <Stack.Screen name="DocumentUpload" component={DocumentUploadScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        
        {/* Passenger / Global Screens */}
        <Stack.Screen name="ServiceChoice" component={ServiceChoiceScreen} />
        <Stack.Screen name="TaxiBooking" component={TaxiBookingScreen} />
        <Stack.Screen name="DriverRequest" component={DriverRequestScreen} />
        <Stack.Screen name="PassengerTracking" component={PassengerTrackingScreen} />
        <Stack.Screen name="ParkingDetail" component={ParkingDetailScreen} />
        <Stack.Screen name="ChatList" component={ChatListScreen} />
        <Stack.Screen name="ChatScreen" component={ChatScreen} />
        <Stack.Screen name="MapPreview" component={MapPreviewScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export type RootStackParamList = {
  Auth: { isLogin?: boolean; role?: 'user' | 'driver' | 'taxi_driver' | 'parking_provider' } | undefined;
  Onboarding: undefined;
  ConsumerApp: undefined;
  ProviderApp: undefined;
  AdminApp: undefined;
  LegalDocument: { documentType: 'terms' | 'privacy' | 'help' };
  EditProfile: undefined;
  Notifications: undefined;
  DriverVerification: undefined;
  ProviderVerification: undefined;
  DocumentUpload: { docId: string; docTitle: string; docStatus: string };
  ForgotPassword: { isLogin: boolean } | undefined;
  ServiceChoice: { mode: 'driver' | 'taxi' };
  TaxiBooking: { serviceId: string; prefilledName?: string };
  DriverRequest: { serviceId: string; prefilledName?: string };
  PassengerTracking: { bookingId: string };
  ParkingDetail: { spaceId: string; space?: any };
  ChatList: undefined;
  ChatScreen: { otherUserId: string; otherUserName: string; bookingId?: string };
  MapPreview: undefined;
};
