import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { taxiBookingsApi } from '@/api';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BORDER_RADIUS, FONT_WEIGHTS, SPACING, ThemeColors } from '@/constants/theme';
import { getApiErrorMessage } from '@/utils/helpers';
import { formatElapsed, formatPence } from '@/utils/fare';

type Stop = {
  initiatedBy: 'customer' | 'driver';
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number;
  ratePencePerMinute?: number;
  chargePence?: number;
};

type Props = {
  requestId: string;
  /** The ride linked to the request (populated), holding stops and pricing snapshot. */
  ride: any;
  role: 'customer' | 'driver';
  onChanged: () => void;
};

/**
 * Stop / waiting control for an active ride. Elapsed time is always computed from
 * the server's start timestamp, so it stays right after the app sleeps or reconnects.
 */
export function RideStopControl({ requestId, ride, role, onChanged }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const stops: Stop[] = Array.isArray(ride?.stops) ? ride.stops : [];
  const openStop = stops.find((s) => !s.endedAt);
  const customerRate: number | undefined = ride?.pricingSnapshot?.customerStopRatePencePerMinute;

  useEffect(() => {
    if (!openStop) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [openStop?.startedAt]);

  const elapsed = openStop ? (now - new Date(openStop.startedAt).getTime()) / 1000 : 0;
  // Display only — the server prices each stop from its own timestamps when it ends
  const runningCharge = openStop ? Math.round((elapsed * (openStop.ratePencePerMinute || 0)) / 60) : 0;
  const settledCustomerCharge = stops
    .filter((s) => s.endedAt && s.initiatedBy === 'customer')
    .reduce((sum, s) => sum + (s.chargePence || 0), 0);
  const totalWaiting =
    settledCustomerCharge + (openStop?.initiatedBy === 'customer' ? runningCharge : 0);

  const run = async (action: 'start' | 'end') => {
    if (busy) return;
    setBusy(true);
    try {
      const res =
        action === 'start'
          ? await taxiBookingsApi.startStop(requestId)
          : await taxiBookingsApi.endStop(requestId);
      if (!res.data?.success) {
        Alert.alert('Stop', res.data?.message || 'Could not update the stop.');
      }
      onChanged();
    } catch (err) {
      Alert.alert('Stop', getApiErrorMessage(err, 'Could not update the stop.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmStart = () => {
    const message =
      role === 'customer'
        ? `Waiting time is charged at ${formatPence(customerRate ?? 50)} per minute until the stop ends.`
        : 'Driver stops are recorded but not charged to the passenger.';
    Alert.alert('Start a stop?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start stop', onPress: () => run('start') },
    ]);
  };

  return (
    <View style={styles.container}>
      {openStop ? (
        <View style={styles.activeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeTitle}>
              {openStop.initiatedBy === 'customer' ? 'Passenger stop' : 'Driver stop'} · {formatElapsed(elapsed)}
            </Text>
            <Text style={styles.activeSub}>
              {openStop.initiatedBy === 'customer'
                ? `Waiting charge so far ${formatPence(runningCharge)}`
                : 'Not charged to the passenger'}
            </Text>
          </View>
          <TouchableOpacity style={styles.endBtn} onPress={() => run('end')} disabled={busy}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>End stop</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.startBtn} onPress={confirmStart} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.amber} />
          ) : (
            <>
              <Ionicons name="pause-circle-outline" size={18} color={colors.amber} />
              <Text style={styles.startText}>Request a stop</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {totalWaiting > 0 && (
        <Text style={styles.total}>Waiting charges this trip: {formatPence(totalWaiting)}</Text>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { marginBottom: SPACING.md },
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: `${colors.amber}60`,
      backgroundColor: `${colors.amber}10`,
    },
    startText: { color: colors.amber, fontSize: 14, fontWeight: FONT_WEIGHTS.semibold },
    activeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      padding: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: `${colors.amber}15`,
      borderWidth: 1,
      borderColor: `${colors.amber}50`,
    },
    activeTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: FONT_WEIGHTS.bold },
    activeSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    endBtn: {
      backgroundColor: colors.amber,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      minWidth: 90,
      alignItems: 'center',
    },
    btnText: { color: '#FFF', fontWeight: FONT_WEIGHTS.bold },
    total: { color: colors.textSecondary, fontSize: 12, marginTop: SPACING.xs, textAlign: 'center' },
  });
