import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { bookingsApi, providerApi, taxiBookingsApi } from '@/api';

export function ProviderHomeScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<NavigationProp<any>>();
  const [stats, setStats] = useState({ pending: 0, accepted: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [activeJourneyId, setActiveJourneyId] = useState<string | null>(null);

  // Driver status (online/offline)
  const isDriverOrTaxi = user?.role === 'driver' || user?.role === 'taxi_driver';
  const [driverStatus, setDriverStatus] = useState<'online' | 'offline' | 'busy'>('offline');
  const [driverNumber, setDriverNumber] = useState<string | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await bookingsApi.getProviderRequests();
      if (res.data?.success) {
        const requests = res.data.data || [];
        setStats({
          pending: requests.filter((r: any) => r.status === 'pending').length,
          accepted: requests.filter((r: any) => r.status === 'accepted').length,
          total: requests.length,
        });
      }

      // Fetch driver number for driver/taxi roles
      if (isDriverOrTaxi) {
        try {
          const numRes = await providerApi.getMyDriverNumber();
          if (numRes.data?.success) {
            setDriverNumber(numRes.data.data?.driverNumber || null);
          }
        } catch (e) {
          // Driver number not assigned yet
        }

        // Fetch driver's active journey
        try {
          const activeRes = await taxiBookingsApi.getDriverActive();
          if (activeRes.data?.success && activeRes.data.data?.length > 0) {
            setActiveJourneyId(activeRes.data.data[0]._id);
          } else {
            setActiveJourneyId(null);
          }
        } catch (e) {
          console.log('Failed to fetch active journeys', e);
        }
      }
    } catch (err) {
      console.log('Failed to fetch stats:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  const handleToggleStatus = async () => {
    if (driverStatus === 'busy') {
      Alert.alert('On a Trip', 'You cannot change your status while on an active trip.');
      return;
    }

    const newStatus = driverStatus === 'online' ? 'offline' : 'online';
    setTogglingStatus(true);

    try {
      const res = await providerApi.toggleStatus(newStatus);
      if (res.data?.success) {
        setDriverStatus(newStatus);
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to update status');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update status');
    } finally {
      setTogglingStatus(false);
    }
  };

  const roleLabel = user?.role === 'parking_provider'
    ? 'Park Owner'
    : user?.role === 'driver'
      ? 'Driver'
      : user?.role === 'taxi_driver'
        ? 'Taxi Driver'
        : 'Provider';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome, {user?.firstName || 'Provider'}</Text>
            <Text style={styles.roleTag}>{roleLabel} Dashboard</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.navigate('ChatList')}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ProviderProfile')} style={styles.profileBtn}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{user?.firstName?.charAt(0) || 'P'}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchStats(true)} tintColor={COLORS.electricTeal} />
          }
        >
          {/* Driver Status Toggle (for driver/taxi only) */}
          {isDriverOrTaxi && (
            <View style={styles.statusCard}>
              <View style={styles.statusInfo}>
                <View style={[styles.statusDotLarge, driverStatus === 'online' && styles.statusDotOnline]} />
                <View>
                  <Text style={styles.statusTitle}>
                    {driverStatus === 'online' ? 'You are Online' : driverStatus === 'busy' ? 'On a Trip' : 'You are Offline'}
                  </Text>
                  {driverNumber && (
                    <Text style={styles.driverNumberText}>Your number: #{driverNumber}</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  driverStatus === 'online' && styles.toggleBtnOnline,
                  driverStatus === 'busy' && styles.toggleBtnBusy,
                ]}
                onPress={handleToggleStatus}
                disabled={togglingStatus || driverStatus === 'busy'}
                activeOpacity={0.7}
              >
                {togglingStatus ? (
                  <ActivityIndicator size="small" color={driverStatus === 'online' ? COLORS.error : COLORS.success} />
                ) : (
                  <Text style={[
                    styles.toggleBtnText,
                    driverStatus === 'online' && { color: COLORS.error },
                    driverStatus === 'busy' && { color: COLORS.textTertiary },
                  ]}>
                    {driverStatus === 'online' ? 'Go Offline' : driverStatus === 'busy' ? 'On Trip' : 'Go Online'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Active Journey Banner */}
          {activeJourneyId && (
            <TouchableOpacity
              style={[styles.alertCard, { backgroundColor: '#E0F2FE', borderColor: COLORS.electricTeal, marginBottom: SPACING.xl }]}
              onPress={() => navigation.navigate('ProviderActiveJourney', { requestId: activeJourneyId, serviceType: user?.role === 'taxi_driver' ? 'taxi' : 'driver' })}
              activeOpacity={0.7}
            >
              <View style={styles.alertIcon}>
                <Ionicons name="car-sport" size={32} color={COLORS.electricTeal} />
              </View>
              <View style={styles.alertContent}>
                <Text style={[styles.alertTitle, { color: COLORS.electricTeal, fontSize: 18 }]}>
                  Active Journey
                </Text>
                <Text style={styles.alertSubtext}>Tap to open map and continue</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={COLORS.electricTeal} />
            </TouchableOpacity>
          )}

          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: COLORS.amber }]}>{stats.pending}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: COLORS.success }]}>{stats.accepted}</Text>
              <Text style={styles.statLabel}>Accepted</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: COLORS.electricTeal }]}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>

          {/* Pending alert */}
          {stats.pending > 0 && (
            <TouchableOpacity
              style={styles.alertCard}
              onPress={() => navigation.navigate('ProviderRequests')}
              activeOpacity={0.7}
            >
              <View style={styles.alertIcon}>
                <Ionicons name="notifications" size={22} color={COLORS.amber} />
              </View>
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>
                  {stats.pending} pending request{stats.pending > 1 ? 's' : ''}
                </Text>
                <Text style={styles.alertSubtext}>Tap to review and respond</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
            </TouchableOpacity>
          )}

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('ProviderRequests')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${COLORS.info}12` }]}>
              <Ionicons name="mail-open" size={24} color={COLORS.info} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>View Requests</Text>
              <Text style={styles.actionSubtext}>Review and respond to booking requests</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
          </TouchableOpacity>

          {/* Ride Requests (driver/taxi only) */}
          {isDriverOrTaxi && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('DriverRideRequests')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${COLORS.amber}12` }]}>
                <Ionicons name="car" size={24} color={COLORS.amber} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Ride Requests</Text>
                <Text style={styles.actionSubtext}>See passenger ride requests near you</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('ProviderEarnings')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${COLORS.success}12` }]}>
              <Ionicons name="wallet" size={24} color={COLORS.success} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Earnings</Text>
              <Text style={styles.actionSubtext}>View your earnings and payment history</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('ProviderVerification')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${COLORS.amber}12` }]}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.amber} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>
                {user?.role === 'parking_provider' ? 'Create a Park' : 'Verification'}
              </Text>
              <Text style={styles.actionSubtext}>
                {user?.role === 'parking_provider' ? 'Submit your parking space for approval' : 'Manage your documents and verification'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'ios' ? 10 : 40,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  greeting: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },
  roleTag: { color: COLORS.electricTeal, fontSize: FONT_SIZES.label, marginTop: 4 },
  headerBtn: { padding: SPACING.sm, marginRight: SPACING.sm },
  profileBtn: { padding: SPACING.xs },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.electricTeal,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  scrollContent: { padding: SPACING.lg, paddingTop: SPACING.xl },

  // Status toggle card (driver/taxi)
  statusCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  statusInfo: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
  },
  statusDotLarge: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.textTertiary,
  },
  statusDotOnline: {
    backgroundColor: COLORS.success,
  },
  statusTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold,
  },
  driverNumberText: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2,
  },
  toggleBtn: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1.5,
    borderColor: COLORS.success, backgroundColor: `${COLORS.success}10`,
  },
  toggleBtnOnline: {
    borderColor: COLORS.error, backgroundColor: `${COLORS.error}10`,
  },
  toggleBtnBusy: {
    borderColor: COLORS.textTertiary, backgroundColor: COLORS.surfaceAlt, opacity: 0.6,
  },
  toggleBtnText: {
    color: COLORS.success, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold,
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  statCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  statNumber: { fontSize: 28, fontWeight: FONT_WEIGHTS.bold, marginBottom: 4 },
  statLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },

  // Alert
  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF8E8',
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginBottom: SPACING.xl, borderWidth: 1, borderColor: '#FDE68A',
  },
  alertIcon: { marginRight: SPACING.md },
  alertContent: { flex: 1 },
  alertTitle: { color: COLORS.amber, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold },
  alertSubtext: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2 },

  // Section
  sectionTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.md,
  },

  // Action cards
  actionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  actionIcon: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  actionContent: { flex: 1 },
  actionTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold },
  actionSubtext: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
});
