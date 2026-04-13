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
import { ConsumerHomeScreen } from '@/screens/ConsumerHomeScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { BookingsScreen } from '@/screens/BookingsScreen';
import { WalletScreen } from '@/screens/WalletScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { ParkingDetailScreen } from '@/screens/ParkingDetailScreen';
import { TaxiBookingScreen } from '@/screens/TaxiBookingScreen';
import { ProviderHomeScreen } from '@/screens/ProviderHomeScreen';
import { ProviderRequestsScreen } from '@/screens/ProviderRequestsScreen';
import { ProviderEarningsScreen } from '@/screens/ProviderEarningsScreen';
import { ProviderVerificationScreen } from '@/screens/ProviderVerificationScreen';
import { DriverRideRequestsScreen } from '@/screens/DriverRideRequestsScreen';
import { AdminDashboardScreen } from '@/screens/AdminDashboardScreen';
import { AdminUsersScreen } from '@/screens/AdminUsersScreen';
import { AdminVerificationQueueScreen } from '@/screens/AdminVerificationQueueScreen';
import { AdminIdentityQueueScreen } from '@/screens/AdminIdentityQueueScreen';
import { ChatListScreen } from '@/screens/ChatListScreen';
import { ChatScreen } from '@/screens/ChatScreen';
import { DriverVerificationScreen } from '@/screens/DriverVerificationScreen';
import { DocumentUploadScreen } from '@/screens/DocumentUploadScreen';
import { ServiceChoiceScreen } from '@/screens/ServiceChoiceScreen';
import { DriverRequestScreen } from '@/screens/DriverRequestScreen';
import { ProviderActiveJourneyScreen } from '@/screens/ProviderActiveJourneyScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// White theme tab bar style
const TAB_BAR_STYLE = {
  backgroundColor: '#FFFFFF',
  borderTopColor: '#E5E7EB',
  borderTopWidth: 1,
  elevation: 0,
  shadowOpacity: 0,
};

// Consumer Tab Navigator (Home, Search, Bookings, Wallet, Profile)
const ConsumerTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00B4A0',
      tabBarInactiveTintColor: '#94A3B8',
      tabBarStyle: TAB_BAR_STYLE,
    }}
  >
    <Tab.Screen
      name="ConsumerHome"
      component={ConsumerHomeScreen}
      options={{ 
        title: 'Home', 
        tabBarLabel: 'Home',
        tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="Search"
      component={SearchScreen}
      options={{ 
        title: 'Search', 
        tabBarLabel: 'Search',
        tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="Bookings"
      component={BookingsScreen}
      options={{ 
        title: 'My Bookings', 
        tabBarLabel: 'Bookings',
        tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="Wallet"
      component={WalletScreen}
      options={{ 
        title: 'Wallet', 
        tabBarLabel: 'Wallet',
        tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{ 
        title: 'Profile', 
        tabBarLabel: 'Profile',
        tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />
      }}
    />
  </Tab.Navigator>
);

// Consumer Navigator — wraps tabs + detail screens in a stack
const ConsumerNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ConsumerTabs" component={ConsumerTabs} />
    <Stack.Screen name="ParkingDetail" component={ParkingDetailScreen} />
    <Stack.Screen name="TaxiBooking" component={TaxiBookingScreen} />
    <Stack.Screen name="ServiceChoice" component={ServiceChoiceScreen} />
    <Stack.Screen name="DriverRequest" component={DriverRequestScreen} />
    <Stack.Screen name="ChatList" component={ChatListScreen} />
    <Stack.Screen name="Chat" component={ChatScreen} />
  </Stack.Navigator>
);

// Provider Navigation Tabs
const ProviderTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00B4A0',
      tabBarInactiveTintColor: '#94A3B8',
      tabBarStyle: TAB_BAR_STYLE,
    }}
  >
    <Tab.Screen
      name="ProviderHome"
      component={ProviderHomeScreen}
      options={{ 
        title: 'Dashboard', 
        tabBarLabel: 'Dashboard',
        tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="ProviderRequests"
      component={ProviderRequestsScreen}
      options={{ 
        title: 'Requests', 
        tabBarLabel: 'Requests',
        tabBarIcon: ({ color, size }) => <Ionicons name="mail-open-outline" size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="ProviderEarnings"
      component={ProviderEarningsScreen}
      options={{ 
        title: 'Earnings', 
        tabBarLabel: 'Earnings',
        tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="ProviderProfile"
      component={ProfileScreen}
      options={{ 
        title: 'Profile', 
        tabBarLabel: 'Profile',
        tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />
      }}
    />
  </Tab.Navigator>
);

// Provider Stack - wraps tabs and detail screens
const ProviderNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ProviderTabs" component={ProviderTabs} />
    <Stack.Screen name="ProviderVerification" component={ProviderVerificationScreen} />
    <Stack.Screen name="DriverVerification" component={DriverVerificationScreen} />
    <Stack.Screen name="DocumentUpload" component={DocumentUploadScreen} />
    <Stack.Screen name="DriverRideRequests" component={DriverRideRequestsScreen} />
    <Stack.Screen name="ProviderActiveJourney" component={ProviderActiveJourneyScreen} />
    <Stack.Screen name="ChatList" component={ChatListScreen} />
    <Stack.Screen name="Chat" component={ChatScreen} />
  </Stack.Navigator>
);

// Admin Navigation
const AdminNavigator = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00B4A0',
      tabBarInactiveTintColor: '#94A3B8',
      tabBarStyle: TAB_BAR_STYLE,
    }}
  >
    <Tab.Screen
      name="AdminDashboard"
      component={AdminDashboardScreen}
      options={{ 
        title: 'Dashboard', 
        tabBarLabel: 'Dashboard',
        tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="AdminUsers"
      component={AdminUsersScreen}
      options={{ 
        title: 'Users', 
        tabBarLabel: 'Users',
        tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="AdminVerificationQueue"
      component={AdminVerificationQueueScreen}
      options={{ 
        title: 'Verifications', 
        tabBarLabel: 'Verifications',
        tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="AdminIdentityQueue"
      component={AdminIdentityQueueScreen}
      options={{ 
        title: 'Documents', 
        tabBarLabel: 'Documents',
        tabBarIcon: ({ color, size }) => <Ionicons name="id-card-outline" size={size} color={color} />
      }}
    />
  </Tab.Navigator>
);

// Root Navigator with authentication flow
export const RootNavigator = () => {
  const { isAuthenticated, restoreToken, user } = useAuthStore();
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

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          // Auth Stack
          <Stack.Group
            screenOptions={{
              contentStyle: { backgroundColor: '#FFFFFF' },
            }}
          >
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Auth" component={AuthScreen} />
          </Stack.Group>
        ) : (
          // App Stack - Role-based
          <Stack.Group
            screenOptions={{
              contentStyle: { backgroundColor: '#FFFFFF' },
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
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export type RootStackParamList = {
  Auth: { isLogin?: boolean; role?: string } | undefined;
  Onboarding: undefined;
  ConsumerApp: undefined;
  ProviderApp: undefined;
  AdminApp: undefined;
  ParkingDetail: { spaceId: string; space?: any };
  TaxiBooking: undefined;
  DriverRideRequests: undefined;
};
