import React, { useEffect, useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTaxiStore } from '@/store/taxiStore';
import { useAuthStore } from '@/store/authStore';
import { taxiBookingsApi } from '@/api';
import { navigationRef } from '@/navigation/navigationRef';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BORDER_RADIUS, FONT_WEIGHTS, SPACING, ThemeColors } from '@/constants/theme';

const DRIVER_ROLES = ['driver', 'taxi_driver'];

/**
 * App-wide popup telling a driver the customer cancelled their assigned ride.
 * Keeps the driver's realtime connection open so the event arrives on any screen,
 * and acknowledges it so it isn't replayed on the next reconnect.
 */
export function RideCancelledModal() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuthStore();
  const { connect, cancelNotices, dismissCancelNotice } = useTaxiStore();
  const isDriver = !!user && DRIVER_ROLES.includes((user as any).role);
  const notice = cancelNotices[0];

  useEffect(() => {
    if (!isDriver) return;
    const userId = (user as any)._id || (user as any).id;
    if (userId) connect(String(userId));
  }, [isDriver, user]);

  useEffect(() => {
    if (notice) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }, [notice?.requestId]);

  if (!isDriver || !notice) return null;

  const close = () => {
    dismissCancelNotice(notice.requestId);
    taxiBookingsApi.acknowledgeCancellation(notice.requestId).catch(() => {});

    const current = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
    if (
      current?.name === 'ProviderActiveJourney' &&
      (current.params as any)?.requestId === notice.requestId
    ) {
      navigationRef.navigate('ProviderApp', { screen: 'ProviderTabs', params: { screen: 'ProviderHome' } });
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.iconCircle}>
            <Ionicons name="close-circle" size={40} color={colors.coralRed} />
          </View>
          <Text style={styles.title}>{notice.title || 'Ride Cancelled'}</Text>
          <Text style={styles.message}>{notice.message || 'The customer has cancelled this booking.'}</Text>
          <Text style={styles.reference}>Ride {notice.rideReference}</Text>
          <Text style={styles.hint}>You're available for new requests again.</Text>
          <TouchableOpacity style={styles.button} onPress={close} activeOpacity={0.85}>
            <Text style={styles.buttonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: SPACING.xl,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.xl,
      alignItems: 'center',
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: `${colors.coralRed}15`,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    title: { color: colors.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
    message: { color: colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: SPACING.sm },
    reference: { color: colors.textPrimary, fontSize: 14, fontWeight: FONT_WEIGHTS.semibold, marginTop: SPACING.md },
    hint: { color: colors.textTertiary, fontSize: 12, marginTop: SPACING.xs },
    button: {
      marginTop: SPACING.lg,
      alignSelf: 'stretch',
      backgroundColor: colors.electricTeal,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.md,
      alignItems: 'center',
    },
    buttonText: { color: '#FFF', fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  });
