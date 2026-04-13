import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform,
  ScrollView, RefreshControl,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { taxiBookingsApi } from '@/api';

export function AdminDashboardScreen() {
  const navigation = useNavigation<NavigationProp<any>>();
  const { logout } = useAuthStore();
  const [activeRides, setActiveRides] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActiveRides = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await taxiBookingsApi.getAdminActive();
      if (res.data?.success) {
        setActiveRides(res.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch rides:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchActiveRides();
      const interval = setInterval(() => fetchActiveRides(), 15000);
      return () => clearInterval(interval);
    }, [])
  );

  const handleLogout = async () => {
    await logout();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={22} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchActiveRides(true)} tintColor={COLORS.electricTeal} />
        }
      >
        {/* Live ride requests notify */}
        {activeRides.length > 0 && (
          <View style={styles.liveCard}>
            <View style={styles.liveHeader}>
              <View style={styles.liveDot} />
              <Text style={styles.liveTitle}>
                {activeRides.length} Active Ride Request{activeRides.length > 1 ? 's' : ''}
              </Text>
            </View>
            {activeRides.slice(0, 5).map((ride: any) => {
              const passenger = ride.passenger || {};
              const statusColor =
                ride.status === 'searching' ? COLORS.amber :
                ride.status === 'accepted' ? COLORS.info :
                COLORS.success;
              const statusLabel =
                ride.status === 'searching' ? 'Searching' :
                ride.status === 'accepted' ? 'Accepted' :
                'In Progress';

              return (
                <View key={ride._id} style={styles.rideRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ridePassenger}>
                      {passenger.firstName} {passenger.lastName}
                    </Text>
                    <Text style={styles.rideRoute} numberOfLines={1}>
                      {ride.pickupPostcode || ride.pickupAddress || 'GPS'} → {ride.destinationAddress || ride.destinationPostcode}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: `${statusColor}15` }]}>
                    <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                </View>
              );
            })}
            {activeRides.length > 5 && (
              <Text style={styles.moreText}>+{activeRides.length - 5} more</Text>
            )}
          </View>
        )}

        {/* Verification Queue */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('AdminVerificationQueue')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: `${COLORS.electricTeal}12` }]}>
            <Ionicons name="document-text-outline" size={28} color={COLORS.electricTeal} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Verification Queue</Text>
            <Text style={styles.cardDesc}>Review and approve new parking operators and drivers.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={COLORS.textTertiary} />
        </TouchableOpacity>

        {/* Identity Documents */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('AdminIdentityQueue')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: `${COLORS.amber}12` }]}>
            <Ionicons name="id-card-outline" size={28} color={COLORS.amber} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Identity Documents</Text>
            <Text style={styles.cardDesc}>Review uploaded ID documents and proof of address.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={COLORS.textTertiary} />
        </TouchableOpacity>

        {/* Users */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('AdminUsers')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: `${COLORS.info}12` }]}>
            <Ionicons name="people-outline" size={28} color={COLORS.info} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Users</Text>
            <Text style={styles.cardDesc}>View and manage all registered users.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={COLORS.textTertiary} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },
  logoutButton: {
    padding: SPACING.sm, borderRadius: BORDER_RADIUS.sm,
    backgroundColor: `${COLORS.error}10`,
  },

  scrollContent: { padding: SPACING.lg },

  // Live rides card
  liveCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.amber, borderLeftWidth: 4,
  },
  liveHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  liveDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.success,
  },
  liveTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold,
  },
  rideRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  ridePassenger: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium,
  },
  rideRoute: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.sm,
  },
  statusPillText: {
    fontSize: 11, fontWeight: FONT_WEIGHTS.bold,
  },
  moreText: {
    color: COLORS.textTertiary, fontSize: FONT_SIZES.small, textAlign: 'center',
    marginTop: SPACING.sm,
  },

  // Action cards
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  iconContainer: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  cardContent: { flex: 1, marginRight: SPACING.sm },
  cardTitle: {
    color: COLORS.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold, marginBottom: 4,
  },
  cardDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
});
