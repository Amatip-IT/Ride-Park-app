import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';

type ServiceType = 'parking' | 'driver' | 'taxi';

export function ConsumerHomeScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<NavigationProp<any>>();

  const navigateToSearch = (serviceType: ServiceType) => {
    navigation.navigate('Search', { serviceType });
  };

  const navigateToBookings = () => {
    navigation.navigate('Bookings');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.firstName || 'Explorer'} 👋</Text>
          <Text style={styles.subtext}>What would you like to do today?</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity 
            style={{ marginRight: SPACING.md, padding: SPACING.xs }} 
            onPress={() => navigation.navigate('ChatList')}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={COLORS.cloudWhite} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('Profile')}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{user?.firstName?.charAt(0) || 'U'}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Card 1: Find a Parking Space */}
        <TouchableOpacity style={styles.heroCard} onPress={() => navigateToSearch('parking')} activeOpacity={0.8}>
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(0, 194, 168, 0.1)' }]}>
            <Ionicons name="car-sport" size={32} color={COLORS.electricTeal} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Find a Parking Space</Text>
            <Text style={styles.cardDesc}>Locate and reserve a secure parking spot near you or at your destination.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.softSlate} />
        </TouchableOpacity>

        {/* Hero Card 2: Book a Driver */}
        <TouchableOpacity style={styles.heroCard} onPress={() => navigateToSearch('driver')} activeOpacity={0.8}>
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
            <Ionicons name="person" size={32} color={COLORS.info} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Book a Driver</Text>
            <Text style={styles.cardDesc}>Hire a professional driver to take you wherever you need to go.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.softSlate} />
        </TouchableOpacity>

        {/* Hero Card 3: Hire a Taxi */}
        <TouchableOpacity style={styles.heroCard} onPress={() => navigateToSearch('taxi')} activeOpacity={0.8}>
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(243, 156, 18, 0.1)' }]}>
            <Ionicons name="navigate" size={32} color={COLORS.amber} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Hire a Taxi</Text>
            <Text style={styles.cardDesc}>Get a taxi ride to your destination quickly and affordably.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.softSlate} />
        </TouchableOpacity>

        {/* Quick access to bookings */}
        <TouchableOpacity style={styles.bookingsCard} onPress={navigateToBookings} activeOpacity={0.8}>
          <Ionicons name="calendar-outline" size={22} color={COLORS.electricTeal} />
          <Text style={styles.bookingsText}>View My Bookings</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.softSlate} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.deepNavy,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.steelBlue,
    borderBottomLeftRadius: BORDER_RADIUS.xl,
    borderBottomRightRadius: BORDER_RADIUS.xl,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    zIndex: 10,
  },
  greeting: {
    color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
  },
  subtext: {
    color: COLORS.softSlate,
    fontSize: FONT_SIZES.label,
    marginTop: 4,
  },
  profileBtn: {
    padding: SPACING.xs,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.electricTeal,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: COLORS.deepNavy,
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.steelBlue,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  cardContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  cardTitle: {
    color: COLORS.cloudWhite,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  cardDesc: {
    color: COLORS.softSlate,
    fontSize: 14,
    lineHeight: 20,
  },
  bookingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 194, 168, 0.08)',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 168, 0.2)',
  },
  bookingsText: {
    flex: 1,
    color: COLORS.electricTeal,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginLeft: SPACING.sm,
  },
});
