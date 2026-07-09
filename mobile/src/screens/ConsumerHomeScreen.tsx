import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuthStore } from '@/store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';

type ServiceType = 'parking' | 'driver' | 'taxi';

export function ConsumerHomeScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<NavigationProp<any>>();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const SERVICE_CARDS: { type: ServiceType; title: string; desc: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { type: 'parking', title: 'Find Parking', desc: 'Locate and reserve a secure parking spot near you.', icon: 'car-sport', color: colors.electricTeal },
    { type: 'driver', title: 'Book a Driver', desc: 'Hire a professional driver. £1.10/mile.', icon: 'person', color: colors.info },
    { type: 'taxi', title: 'Hire a Taxi', desc: 'Get a taxi ride. £1.10/mile + £0.20/min.', icon: 'navigate', color: colors.amber },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.firstName || 'Explorer'} 👋</Text>
          <Text style={styles.subtext}>What would you like to do today?</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('ChatList')}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('Profile')}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user?.firstName?.charAt(0) || 'U'}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Quick Ride — Uber-style "Where to?" card */}
        <TouchableOpacity
          style={styles.quickRideCard}
          onPress={() => navigation.navigate('QuickRide')}
          activeOpacity={0.8}
        >
          <View style={styles.quickRideIcon}>
            <Ionicons name="navigate" size={20} color="#FFF" />
          </View>
          <Text style={styles.quickRidePlaceholder}>Where to?</Text>
          <Ionicons name="time-outline" size={22} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* Service Cards */}
        {SERVICE_CARDS.map(card => (
          <TouchableOpacity
            key={card.type}
            style={styles.serviceCard}
            onPress={() => {
              if (card.type === 'parking') {
                navigation.navigate('Search', { serviceType: 'parking' });
              } else if (card.type === 'driver') {
                navigation.navigate('ServiceChoice', { mode: 'driver' });
              } else {
                navigation.navigate('ServiceChoice', { mode: 'taxi' });
              }
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${card.color}15` }]}>
              <Ionicons name={card.icon} size={28} color={card.color} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDesc}>{card.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        {/* Bookings quick link */}
        <TouchableOpacity
          style={styles.bookingsCard}
          onPress={() => navigation.navigate('Bookings')}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.electricTeal} />
          <Text style={styles.bookingsText}>View My Bookings</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* Map Preview */}
        <TouchableOpacity
          style={[styles.bookingsCard, { marginTop: SPACING.sm, borderColor: '#7C3AED', backgroundColor: `${colors.surface}` }]}
          onPress={() => navigation.navigate('MapPreview' as any)}
          activeOpacity={0.7}
        >
          <Ionicons name="map-outline" size={20} color="#7C3AED" />
          <Text style={[styles.bookingsText, { color: '#7C3AED' }]}>Live Map Preview</Text>
          <Ionicons name="chevron-forward" size={18} color="#7C3AED" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingBottom: SPACING.lg,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    greeting: {
      color: colors.textPrimary,
      fontSize: FONT_SIZES.section,
      fontWeight: FONT_WEIGHTS.bold,
    },
    subtext: {
      color: colors.textSecondary,
      fontSize: FONT_SIZES.label,
      marginTop: 4,
    },
    headerBtn: {
      padding: SPACING.sm,
      marginRight: SPACING.sm,
    },
    profileBtn: {
      padding: SPACING.xs,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.electricTeal,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: '700',
    },
    scrollContent: {
      padding: SPACING.lg,
      paddingTop: SPACING.xl,
    },

    // Quick Ride
    quickRideCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.xl,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    quickRideIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.deepNavy,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.md,
    },
    quickRidePlaceholder: {
      flex: 1,
      fontSize: FONT_SIZES.body,
      color: colors.textTertiary,
      fontWeight: FONT_WEIGHTS.medium,
    },

    // Service cards
    serviceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.md,
    },
    cardContent: {
      flex: 1,
      marginRight: SPACING.sm,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: FONT_WEIGHTS.semibold,
      marginBottom: 4,
    },
    cardDesc: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },

    // Bookings
    bookingsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bookingsText: {
      flex: 1,
      color: colors.electricTeal,
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
      marginLeft: SPACING.sm,
    },
  });
