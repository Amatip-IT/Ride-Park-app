import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { taxiBookingsApi } from '@/api';
import { useAdminDashboardBack } from '@/components/admin/AdminScreenLayout';

function rideStatusMeta(status: string, colors: ThemeColors) {
  if (status === 'searching') {
    return { label: 'Searching', color: colors.amber };
  }
  if (status === 'accepted') {
    return { label: 'Accepted', color: colors.info };
  }
  return { label: 'In Progress', color: colors.success };
}

export function AdminActiveRidesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const goToDashboard = useAdminDashboardBack();
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRides = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (rides.length === 0) setLoading(true);
    try {
      const res = await taxiBookingsApi.getAdminActive();
      if (res.data?.success) {
        setRides(res.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch active rides:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRides();
      const interval = setInterval(() => fetchRides(), 15000);
      return () => clearInterval(interval);
    }, []),
  );

  const renderItem = ({ item }: { item: any }) => {
    const passenger = item.passenger || {};
    const { label, color } = rideStatusMeta(item.status, colors);
    const name =
      `${passenger.firstName || ''} ${passenger.lastName || ''}`.trim() || 'Passenger';
    const route = `${item.pickupPostcode || item.pickupAddress || 'GPS'} → ${
      item.destinationAddress || item.destinationPostcode || '—'
    }`;

    return (
      <View style={styles.rideCard}>
        <View style={styles.rideMain}>
          <Text style={styles.ridePassenger}>{name}</Text>
          <Text style={styles.rideRoute} numberOfLines={2}>
            {route}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: `${color}15` }]}>
          <Text style={[styles.statusPillText, { color }]}>{label}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={goToDashboard}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Active Ride Requests</Text>
          <Text style={styles.headerSub}>
            {rides.length} live · updates every 15s
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.electricTeal} />
          <Text style={styles.loadingText}>Loading active rides…</Text>
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={
            rides.length === 0 ? styles.emptyContainer : styles.listContent
          }
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchRides(true)}
              tintColor={colors.electricTeal}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons
                name="car-outline"
                size={56}
                color={colors.textTertiary}
              />
              <Text style={styles.emptyTitle}>No active rides</Text>
              <Text style={styles.emptySub}>
                Live taxi and driver requests will appear here.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingTop: Platform.OS === 'android' ? SPACING.sm : 0,
      paddingBottom: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
    headerText: { flex: 1, minWidth: 0 },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: FONT_SIZES.section,
      fontWeight: FONT_WEIGHTS.bold,
    },
    headerSub: {
      color: colors.textSecondary,
      fontSize: FONT_SIZES.small,
      marginTop: 2,
    },
    listContent: {
      padding: SPACING.lg,
      paddingBottom: SPACING['3xl'],
    },
    emptyContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: SPACING.xl,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xl,
    },
    loadingText: {
      color: colors.textSecondary,
      marginTop: SPACING.md,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: FONT_WEIGHTS.bold,
      marginTop: SPACING.md,
    },
    emptySub: {
      color: colors.textSecondary,
      fontSize: FONT_SIZES.small,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
    rideCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      borderWidth: 1,
      borderColor: colors.border,
      gap: SPACING.sm,
    },
    rideMain: { flex: 1, minWidth: 0 },
    ridePassenger: {
      color: colors.textPrimary,
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    rideRoute: {
      color: colors.textSecondary,
      fontSize: FONT_SIZES.small,
      marginTop: 4,
      lineHeight: 18,
    },
    statusPill: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.sm,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.bold,
    },
  });
