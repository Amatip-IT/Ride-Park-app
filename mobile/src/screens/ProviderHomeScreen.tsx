import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { bookingsApi, providerApi, taxiBookingsApi } from '@/api';
import { getApiErrorMessage, getCurrentCoords } from '@/utils/helpers';
import { useProviderRideAlerts } from '@/hooks/useProviderRideAlerts';
import { useDriverLocationSync } from '@/hooks/useDriverLocationSync';
import { ProfileAvatar } from '@/components/ProfileAvatar';

export function ProviderHomeScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  // Verification gate state
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isOnline = driverStatus === 'online';
  const { availableCount: liveRideCount } = useProviderRideAlerts(
    isDriverOrTaxi && isOnline && verificationStatus === 'approved',
  );
  useDriverLocationSync(isDriverOrTaxi && isOnline && verificationStatus === 'approved');

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setFetchError(null);
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
          // non-fatal
        }
      }
    } catch (err) {
      setFetchError(getApiErrorMessage(err, 'Could not refresh your dashboard.'));
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();

      // Check verification status for drivers/taxi drivers
      if (isDriverOrTaxi) {
        const checkVerification = async () => {
          setVerificationLoading(true);
          try {
            const res = await providerApi.getVerificationStatus();
            if (res.data?.success) {
              const data = res.data.data;
              setVerificationStatus(data?.status || 'not_applied');
              const avail = data?.availability;
              if (avail === 'online' || avail === 'offline' || avail === 'busy') {
                setDriverStatus(avail);
              }
              if (data?.driverNumber) {
                setDriverNumber(String(data.driverNumber));
              }
            } else {
              setVerificationStatus('not_applied');
            }
          } catch (err) {
            setVerificationStatus('not_applied');
          } finally {
            setVerificationLoading(false);
          }
        };
        checkVerification();
      } else {
        setVerificationLoading(false);
      }
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
      let coords: { lat: number; lng: number } | null = null;
      if (newStatus === 'online') {
        coords = await getCurrentCoords();
        if (!coords) {
          Alert.alert(
            'Location Required',
            'Turn on location access so passengers can find you nearby and accept rides.',
          );
          return;
        }
      }

      const res = await providerApi.toggleStatus(newStatus, coords ?? undefined);
      if (res.data?.success) {
        const avail = res.data.data?.availability;
        setDriverStatus(
          avail === 'online' || avail === 'offline' || avail === 'busy' ? avail : newStatus,
        );
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to update status');
      }
    } catch (err: unknown) {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to update status'));
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

  // ── Verification Gate ──
  // Show loading while checking
  if (isDriverOrTaxi && verificationLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.electricTeal} />
          <Text style={{ color: colors.textSecondary, marginTop: SPACING.md }}>Checking verification...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show verification gate if not approved
  if (isDriverOrTaxi && verificationStatus !== 'approved') {
    const getGateMessage = () => {
      switch (verificationStatus) {
        case 'pending_admin_review':
        case 'pending_auto_check':
          return {
            icon: 'time-outline' as const,
            title: 'Verification Under Review',
            description: 'Your documents have been submitted and are currently being reviewed. You will be notified once your account is approved.',
            iconColor: colors.amber,
            showButton: false,
          };
        case 'rejected':
          return {
            icon: 'close-circle-outline' as const,
            title: 'Verification Rejected',
            description: 'Your documents were rejected. Please review the feedback and resubmit your documents.',
            iconColor: colors.error,
            showButton: true,
          };
        default:
          return {
            icon: 'shield-checkmark-outline' as const,
            title: 'Complete Your Verification',
            description: 'You need to submit your documents for verification before you can access your dashboard and start accepting rides.',
            iconColor: colors.electricTeal,
            showButton: true,
          };
      }
    };

    const gate = getGateMessage();

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Welcome, {user?.firstName || 'Provider'}</Text>
              <Text style={styles.roleTag}>{roleLabel} Dashboard</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('ProviderProfile')} style={styles.profileBtn}>
              <View style={styles.avatarCircle}>
                <ProfileAvatar
                  uri={user?.profileImageUrl}
                  size={40}
                  initials={user?.firstName?.charAt(0) || 'P'}
                />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.verificationGate}>
            <View style={[styles.gateIconCircle, { backgroundColor: `${gate.iconColor}15` }]}>
              <Ionicons name={gate.icon} size={64} color={gate.iconColor} />
            </View>
            <Text style={styles.gateTitle}>{gate.title}</Text>
            <Text style={styles.gateDescription}>{gate.description}</Text>

            {gate.showButton && (
              <TouchableOpacity
                style={styles.gateButton}
                onPress={() => navigation.navigate('DriverVerification')}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.gateButtonText}>Go to Verification</Text>
              </TouchableOpacity>
            )}

            {verificationStatus === 'pending_admin_review' || verificationStatus === 'pending_auto_check' ? (
              <View style={styles.gatePendingBadge}>
                <ActivityIndicator size="small" color={colors.amber} style={{ marginRight: 8 }} />
                <Text style={styles.gatePendingText}>Waiting for admin approval...</Text>
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

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
              <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ProviderProfile')} style={styles.profileBtn}>
              <View style={styles.avatarCircle}>
                <ProfileAvatar
                  uri={user?.profileImageUrl}
                  size={40}
                  initials={user?.firstName?.charAt(0) || 'P'}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchStats(true)} tintColor={colors.electricTeal} />
          }
        >
          {fetchError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={colors.coralRed} />
              <Text style={styles.errorBannerText}>{fetchError}</Text>
              <TouchableOpacity onPress={() => fetchStats(true)}>
                <Text style={styles.retryLink}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {isDriverOrTaxi && user?.role === 'driver' && (
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={20} color={colors.info} />
              <Text style={styles.infoBannerText}>
                Chauffeur hires are scheduled bookings under View Requests. Live map tracking is used for taxi trips only.
              </Text>
            </View>
          )}

          {isDriverOrTaxi && user?.role === 'taxi_driver' && (
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={20} color={colors.electricTeal} />
              <Text style={styles.infoBannerText}>
                Go online to receive live ride requests. Passengers track you on the map during active trips.
              </Text>
            </View>
          )}

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
                  <ActivityIndicator size="small" color={driverStatus === 'online' ? colors.error : colors.success} />
                ) : (
                  <Text style={[
                    styles.toggleBtnText,
                    driverStatus === 'online' && { color: colors.error },
                    driverStatus === 'busy' && { color: colors.textTertiary },
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
              style={[styles.alertCard, { backgroundColor: '#E0F2FE', borderColor: colors.electricTeal, marginBottom: SPACING.xl }]}
              onPress={() => navigation.navigate('ProviderActiveJourney', { requestId: activeJourneyId, serviceType: user?.role === 'taxi_driver' ? 'taxi' : 'driver' })}
              activeOpacity={0.7}
            >
              <View style={styles.alertIcon}>
                <Ionicons name="car-sport" size={32} color={colors.electricTeal} />
              </View>
              <View style={styles.alertContent}>
                <Text style={[styles.alertTitle, { color: colors.electricTeal, fontSize: 18 }]}>
                  Active Journey
                </Text>
                <Text style={styles.alertSubtext}>Tap to open map and continue</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.electricTeal} />
            </TouchableOpacity>
          )}

          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: colors.amber }]}>{stats.pending}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: colors.success }]}>{stats.accepted}</Text>
              <Text style={styles.statLabel}>Accepted</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: colors.electricTeal }]}>{stats.total}</Text>
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
                <Ionicons name="notifications" size={22} color={colors.amber} />
              </View>
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>
                  {stats.pending} pending request{stats.pending > 1 ? 's' : ''}
                </Text>
                <Text style={styles.alertSubtext}>Tap to review and respond</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('ProviderRequests')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.info}12` }]}>
              <Ionicons name="mail-open" size={24} color={colors.info} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>View Requests</Text>
              <Text style={styles.actionSubtext}>Review and respond to booking requests</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          {/* Manage Spaces (parking provider only) */}
          {!isDriverOrTaxi && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('ProviderSpaceManagement')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${colors.electricTeal}12` }]}>
                <Ionicons name="business" size={24} color={colors.electricTeal} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Manage My Spaces</Text>
                <Text style={styles.actionSubtext}>Edit pricing, capacity, and availability</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}

          {/* Ride Requests (driver/taxi only) */}
          {isDriverOrTaxi && user?.role === 'taxi_driver' && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                if (!isOnline) {
                  Alert.alert(
                    'Go online first',
                    'Turn on online status to see and accept live ride requests.',
                  );
                  return;
                }
                navigation.navigate('DriverRideRequests');
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${colors.amber}12` }]}>
                <Ionicons name="car" size={24} color={colors.amber} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Live Ride Requests</Text>
                <Text style={styles.actionSubtext}>
                  {isOnline
                    ? liveRideCount > 0
                      ? `${liveRideCount} request${liveRideCount > 1 ? 's' : ''} waiting`
                      : 'Listening for passengers nearby'
                    : 'Go online to receive trips'}
                </Text>
              </View>
              {isOnline && liveRideCount > 0 ? (
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>{liveRideCount}</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              )}
            </TouchableOpacity>
          )}

          {(user?.role === 'driver' || user?.role === 'taxi_driver') && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('ProviderPastRides')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${colors.info}12` }]}>
                <Ionicons name="time" size={24} color={colors.info} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Past Rides</Text>
                <Text style={styles.actionSubtext}>Trip history, miles, and ride analytics</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('ProviderEarnings')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.success}12` }]}>
              <Ionicons name="wallet" size={24} color={colors.success} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Earnings</Text>
              <Text style={styles.actionSubtext}>View your earnings and payment history</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          {user?.role === 'parking_provider' && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('ProviderVerification')}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${colors.amber}12` }]}>
                <Ionicons name="shield-checkmark" size={24} color={colors.amber} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Create a Park</Text>
                <Text style={styles.actionSubtext}>Submit your parking space for approval</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'ios' ? 10 : 40,
    paddingBottom: SPACING.lg,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  greeting: {
    color: colors.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },
  roleTag: { color: colors.electricTeal, fontSize: FONT_SIZES.label, marginTop: 4 },
  headerBtn: { padding: SPACING.sm, marginRight: SPACING.sm },
  profileBtn: { padding: SPACING.xs },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.electricTeal,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  scrollContent: { padding: SPACING.lg, paddingTop: SPACING.xl },

  // Status toggle card (driver/taxi)
  statusCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  statusInfo: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
  },
  statusDotLarge: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: colors.textTertiary,
  },
  statusDotOnline: {
    backgroundColor: colors.success,
  },
  statusTitle: {
    color: colors.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold,
  },
  driverNumberText: {
    color: colors.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2,
  },
  toggleBtn: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1.5,
    borderColor: colors.success, backgroundColor: `${colors.success}10`,
  },
  toggleBtnOnline: {
    borderColor: colors.error, backgroundColor: `${colors.error}10`,
  },
  toggleBtnBusy: {
    borderColor: colors.textTertiary, backgroundColor: colors.surfaceAlt, opacity: 0.6,
  },
  toggleBtnText: {
    color: colors.success, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold,
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  statNumber: { fontSize: 28, fontWeight: FONT_WEIGHTS.bold, marginBottom: 4 },
  statLabel: { color: colors.textSecondary, fontSize: FONT_SIZES.small },

  // Alert
  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF8E8',
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginBottom: SPACING.xl, borderWidth: 1, borderColor: '#FDE68A',
  },
  alertIcon: { marginRight: SPACING.md },
  alertContent: { flex: 1 },
  alertTitle: { color: colors.amber, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold },
  alertSubtext: { color: colors.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2 },

  // Section
  sectionTitle: {
    color: colors.textPrimary, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.md,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderRadius: BORDER_RADIUS.md,
  },
  errorBannerText: { flex: 1, color: colors.coralRed, fontSize: 13, lineHeight: 18 },
  retryLink: { color: colors.electricTeal, fontWeight: FONT_WEIGHTS.bold, fontSize: 13 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: BORDER_RADIUS.md,
  },
  infoBannerText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  liveBadge: {
    backgroundColor: colors.coralRed,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  liveBadgeText: { color: '#FFF', fontSize: 12, fontWeight: FONT_WEIGHTS.bold },

  // Action cards
  actionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: colors.border,
  },
  actionIcon: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  actionContent: { flex: 1 },
  actionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold },
  actionSubtext: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },

  // Verification Gate
  verificationGate: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  gateIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  gateTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  gateDescription: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
    maxWidth: '90%',
  },
  gateButton: {
    flexDirection: 'row',
    backgroundColor: colors.electricTeal,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.electricTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: SPACING.lg,
  },
  gateButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
  },
  gatePendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.amber}10`,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: `${colors.amber}30`,
  },
  gatePendingText: {
    color: colors.amber,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
