import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '@/store/authStore';
import { UserRole } from '@/types';

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
import { ProviderHomeScreen } from '@/screens/ProviderHomeScreen';
import { ProviderRequestsScreen } from '@/screens/ProviderRequestsScreen';
import { ProviderEarningsScreen } from '@/screens/ProviderEarningsScreen';
import { ProviderVerificationScreen } from '@/screens/ProviderVerificationScreen';
import { AdminDashboardScreen } from '@/screens/AdminDashboardScreen';
import { AdminUsersScreen } from '@/screens/AdminUsersScreen';
import { AdminVerificationQueueScreen } from '@/screens/AdminVerificationQueueScreen';
import { ChatListScreen } from '@/screens/ChatListScreen';
import { ChatScreen } from '@/screens/ChatScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Consumer Tab Navigator (Home, Search, Bookings, Wallet, Profile)
const ConsumerTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00C2A8',
      tabBarInactiveTintColor: '#8899BB',
      tabBarStyle: {
        backgroundColor: '#0D1B2A',
        borderTopColor: '#1A3C6E',
      },
    }}
  >
    <Tab.Screen
      name="ConsumerHome"
      component={ConsumerHomeScreen}
      options={{
        title: 'Home',
        tabBarLabel: 'Home',
      }}
    />
    <Tab.Screen
      name="Search"
      component={SearchScreen}
      options={{
        title: 'Search',
        tabBarLabel: 'Search',
      }}
    />
    <Tab.Screen
      name="Bookings"
      component={BookingsScreen}
      options={{
        title: 'My Bookings',
        tabBarLabel: 'Bookings',
      }}
    />
    <Tab.Screen
      name="Wallet"
      component={WalletScreen}
      options={{
        title: 'Wallet',
        tabBarLabel: 'Wallet',
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        title: 'Profile',
        tabBarLabel: 'Profile',
      }}
    />
  </Tab.Navigator>
);

// Consumer Navigator — wraps tabs + detail screens in a stack
const ConsumerNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ConsumerTabs" component={ConsumerTabs} />
    <Stack.Screen name="ParkingDetail" component={ParkingDetailScreen} />
    <Stack.Screen name="ChatList" component={ChatListScreen} />
    <Stack.Screen name="Chat" component={ChatScreen} />
  </Stack.Navigator>
);

// Provider Navigation Tabs
const ProviderTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00C2A8',
      tabBarInactiveTintColor: '#8899BB',
      tabBarStyle: {
        backgroundColor: '#0D1B2A',
        borderTopColor: '#1A3C6E',
      },
    }}
  >
    <Tab.Screen
      name="ProviderHome"
      component={ProviderHomeScreen}
      options={{
        title: 'My Spaces/Services',
        tabBarLabel: 'Services',
      }}
    />
    <Tab.Screen
      name="ProviderRequests"
      component={ProviderRequestsScreen}
      options={{
        title: 'Requests',
        tabBarLabel: 'Requests',
      }}
    />
    <Tab.Screen
      name="ProviderEarnings"
      component={ProviderEarningsScreen}
      options={{
        title: 'Earnings',
        tabBarLabel: 'Earnings',
      }}
    />
    <Tab.Screen
      name="ProviderProfile"
      component={ProfileScreen}
      options={{
        title: 'Profile',
        tabBarLabel: 'Profile',
      }}
    />
  </Tab.Navigator>
);

// Provider Stack - wraps tabs and detail screens
const ProviderNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ProviderTabs" component={ProviderTabs} />
    <Stack.Screen name="ProviderVerification" component={ProviderVerificationScreen} />
    <Stack.Screen name="ChatList" component={ChatListScreen} />
    <Stack.Screen name="Chat" component={ChatScreen} />
  </Stack.Navigator>
);

// Admin Navigation
const AdminNavigator = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00C2A8',
      tabBarInactiveTintColor: '#8899BB',
      tabBarStyle: {
        backgroundColor: '#0D1B2A',
        borderTopColor: '#1A3C6E',
      },
    }}
  >
    <Tab.Screen
      name="AdminDashboard"
      component={AdminDashboardScreen}
      options={{
        title: 'Dashboard',
        tabBarLabel: 'Dashboard',
      }}
    />
    <Tab.Screen
      name="AdminUsers"
      component={AdminUsersScreen}
      options={{
        title: 'Users',
        tabBarLabel: 'Users',
      }}
    />
    <Tab.Screen
      name="AdminVerificationQueue"
      component={AdminVerificationQueueScreen}
      options={{
        title: 'Verifications',
        tabBarLabel: 'Verifications',
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
};
