import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { ridesApi } from '@/api';
import { formatCurrency, getApiErrorMessage } from '@/utils/helpers';

type Period = 'day' | 'week' | 'month' | undefined;

type RideStats = {
  totalRides: number;
  paidRides: number;
  awaitingPayment: number;
  totalMiles: number;
  totalMinutes: number;
  grossEarnings: number;
  pendingEarnings: number;
};

const emptyStats: RideStats = {
  totalRides: 0,
  paidRides: 0,
  awaitingPayment: 0,
  totalMiles: 0,
  totalMinutes: 0,
  grossEarnings: 0,
  pendingEarnings: 0,
};

function formatDuration(minutes: number) {
  if (!minutes) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function rideStatusMeta(ride: any) {
  if (ride.paymentStatus === 'charged' || ride.status === 'completed') {
    if (ride.paymentStatus === 'charged') {
      return { label: 'Paid', color: COLORS.success };
    }
    return { label: 'Completed', color: COLORS.info };
  }
  if (ride.status === 'awaiting_payment' || ride.paymentStatus === 'processing') {
    return { label: 'Awaiting payment', color: COLORS.amber };
  }
  if (ride.paymentStatus === 'payment_failed') {
    return { label: 'Payment failed', color: COLORS.coralRed };
  }
  return { label: ride.status || 'Unknown', color: COLORS.textSecondary };
}

export function ProviderPastRidesScreen() {
  const navigation = useNavigation<any>();
  const [period, setPeriod] = useState<Period>(undefined);
  const [rides, setRides] = useState<any[]>([]);
  const [stats, setStats] = useState<RideStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (selected?: Period, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await ridesApi.getDriverHistory(selected);
      if (res.data?.success) {
        setRides(res.data.data?.rides || []);
        setStats(res.data.data?.stats || emptyStats);
      } else {
        setError(res.data?.message || 'Failed to load ride history');
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load past rides'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchHistory(period);
    }, [period]),
  );

  const openReceipt = (ride: any) => {
    if (ride.paymentStatus !== 'charged') return;
    navigation.navigate('TripReceipt', { rideId: ride._id });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Past Rides</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.periodRow}>
        {([
          { key: undefined, label: 'All' },
          { key: 'day' as const, label: 'Day' },
          { key: 'week' as const, label: 'Week' },
          { key: 'month' as const, label: 'Month' },
        ]).map((p) => {
          const active = period === p.key;
          return (
            <TouchableOpacity
              key={p.label}
              style={[styles.periodPill, active && styles.periodPillActive]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[styles.periodText, active && styles.periodTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={COLORS.electricTeal} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchHistory(period, true)}
              tintColor={COLORS.electricTeal}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalRides}</Text>
              <Text style={styles.statLabel}>Trips</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatCurrency(stats.grossEarnings)}</Text>
              <Text style={styles.statLabel}>Paid earnings</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalMiles}</Text>
              <Text style={styles.statLabel}>Miles</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatDuration(stats.totalMinutes)}</Text>
              <Text style={styles.statLabel}>On road</Text>
            </View>
          </View>

          {(stats.awaitingPayment > 0 || stats.pendingEarnings > 0) && (
            <View style={styles.pendingBanner}>
              <Ionicons name="time-outline" size={18} color={COLORS.amber} />
              <Text style={styles.pendingText}>
                {stats.awaitingPayment} trip{stats.awaitingPayment === 1 ? '' : 's'} awaiting payment
                {stats.pendingEarnings > 0 ? ` · ${formatCurrency(stats.pendingEarnings)} pending` : ''}
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Trip history</Text>

          {error ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={40} color={COLORS.coralRed} />
              <Text style={styles.emptyTitle}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => fetchHistory(period)}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : rides.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="car-outline" size={48} color={COLORS.softSlate} />
              <Text style={styles.emptyTitle}>No past rides yet</Text>
              <Text style={styles.emptySub}>
                Completed trips will show here with distance, time, and earnings.
              </Text>
            </View>
          ) : (
            rides.map((ride) => {
              const passenger = ride.passenger;
              const name = passenger?.firstName
                ? `${passenger.firstName} ${passenger.lastName || ''}`.trim()
                : 'Passenger';
              const status = rideStatusMeta(ride);
              const when = ride.completedAt || ride.createdAt;
              const canOpenReceipt = ride.paymentStatus === 'charged';

              return (
                <TouchableOpacity
                  key={ride._id}
                  style={styles.rideCard}
                  activeOpacity={canOpenReceipt ? 0.7 : 1}
                  onPress={() => openReceipt(ride)}
                >
                  <View style={styles.rideTop}>
                    <View style={styles.rideIcon}>
                      <Ionicons
                        name={ride.serviceType === 'taxi' ? 'car-sport' : 'person'}
                        size={20}
                        color={COLORS.electricTeal}
                      />
                    </View>
                    <View style={styles.rideInfo}>
                      <Text style={styles.rideTitle} numberOfLines={1}>{name}</Text>
                      <Text style={styles.rideMeta}>
                        {(ride.serviceType === 'taxi' ? 'Taxi' : 'Chauffeur')}
                        {when
                          ? ` · ${new Date(when).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.rideAmount}>
                        {formatCurrency(ride.totalCost || 0)}
                      </Text>
                      <View style={[styles.statusPill, { backgroundColor: `${status.color}20` }]}>
                        <Text style={[styles.statusText, { color: status.color }]}>
                          {status.label}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.routeBlock}>
                    <Text style={styles.routeLine} numberOfLines={1}>
                      <Text style={styles.routeLabel}>From </Text>
                      {ride.pickup?.address || 'Pickup'}
                    </Text>
                    <Text style={styles.routeLine} numberOfLines={1}>
                      <Text style={styles.routeLabel}>To </Text>
                      {ride.dropoff?.address || 'Drop-off'}
                    </Text>
                  </View>

                  <View style={styles.rideFooter}>
                    <Text style={styles.footerStat}>
                      {(ride.distanceMiles || 0).toFixed(1)} mi
                    </Text>
                    <Text style={styles.footerDot}>·</Text>
                    <Text style={styles.footerStat}>
                      {formatDuration(ride.durationMinutes || 0)}
                    </Text>
                    {canOpenReceipt && (
                      <>
                        <Text style={styles.footerDot}>·</Text>
                        <Text style={styles.receiptLink}>Receipt</Text>
                        <Ionicons name="chevron-forward" size={14} color={COLORS.electricTeal} />
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  periodRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  periodPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full ?? 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  periodPillActive: {
    backgroundColor: `${COLORS.electricTeal}20`,
    borderColor: COLORS.electricTeal,
  },
  periodText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium },
  periodTextActive: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.bold },
  scrollContent: { padding: SPACING.lg, paddingBottom: 40 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  statValue: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    marginTop: 4,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: `${COLORS.amber}15`,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  pendingText: { flex: 1, color: COLORS.amber, fontSize: FONT_SIZES.small },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
    paddingHorizontal: SPACING.lg,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  emptySub: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.electricTeal,
    borderRadius: BORDER_RADIUS.md,
  },
  retryText: { color: '#FFF', fontWeight: FONT_WEIGHTS.bold },
  rideCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  rideTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rideIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${COLORS.electricTeal}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rideInfo: { flex: 1 },
  rideTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  rideMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  rideAmount: {
    color: COLORS.electricTeal,
    fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.bold,
  },
  statusPill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusText: { fontSize: 11, fontWeight: FONT_WEIGHTS.semibold, textTransform: 'capitalize' },
  routeBlock: { marginTop: SPACING.md, gap: 4 },
  routeLine: { color: COLORS.textPrimary, fontSize: FONT_SIZES.small },
  routeLabel: { color: COLORS.textSecondary },
  rideFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: 6,
  },
  footerStat: { color: COLORS.textSecondary, fontSize: 12 },
  footerDot: { color: COLORS.textTertiary },
  receiptLink: {
    color: COLORS.electricTeal,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
