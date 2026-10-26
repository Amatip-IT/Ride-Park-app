import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LiveMap } from '@/components/LiveMap';
import { useLiveRoute } from '@/hooks/useLiveRoute';
import { useThemeColors } from '@/hooks/useThemeColors';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { distanceMeters, formatDistance, LatLng } from '@/utils/routing';

type ParamList = {
  ParkingNavigation: {
    spaceId?: string;
    name?: string;
    address?: string;
    lat: number;
    lng: number;
  };
};

/** Within this distance of the spot we treat the driver as arrived. */
const ARRIVED_METERS = 40;
const SHEET_HEIGHT = 230;

type Fix = LatLng & { heading?: number };

function openExternalNavigation(target: LatLng, label: string) {
  const { lat, lng } = target;
  const web = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  const native = Platform.select({
    android: `google.navigation:q=${lat},${lng}&mode=d`,
    ios: `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`,
  });

  const fallback = () =>
    Linking.openURL(
      Platform.OS === 'ios'
        ? `maps://?daddr=${lat},${lng}&dirflg=d&q=${encodeURIComponent(label)}`
        : web,
    ).catch(() => Linking.openURL(web));

  if (!native) {
    Linking.openURL(web);
    return;
  }
  Linking.openURL(native).catch(fallback);
}

export function ParkingNavigationScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<ParamList, 'ParkingNavigation'>>();

  const target = useMemo<LatLng>(() => ({ lat: params.lat, lng: params.lng }), [params.lat, params.lng]);
  const label = params.name || 'Parking space';

  const [fix, setFix] = useState<Fix | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const arrivedAlertShownRef = useRef(false);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) setPermissionDenied(true);
        return;
      }

      const first = await Location.getLastKnownPositionAsync();
      if (first && !cancelled) {
        setFix({ lat: first.coords.latitude, lng: first.coords.longitude });
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 3,
        },
        (loc) => {
          if (cancelled) return;
          const { latitude, longitude, heading, speed } = loc.coords;
          // GPS heading is noise when standing still
          const moving = speed != null && speed > 1;
          setFix({
            lat: latitude,
            lng: longitude,
            heading: moving && heading != null && heading >= 0 ? heading : undefined,
          });
        },
      );
      if (cancelled) subscription.remove();
    })().catch(() => {
      if (!cancelled) setPermissionDenied(true);
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  const origin = useMemo<LatLng | null>(
    () => (fix ? { lat: fix.lat, lng: fix.lng } : null),
    [fix?.lat, fix?.lng],
  );

  const { coordinates, remainingMeters, etaMinutes } = useLiveRoute(
    origin,
    target,
    `parking:${params.spaceId || ''}`,
    true,
  );

  const straightLineMeters = origin ? distanceMeters(origin, target) : null;
  const arrived = straightLineMeters != null && straightLineMeters <= ARRIVED_METERS;

  useEffect(() => {
    if (arrived && !arrivedAlertShownRef.current) {
      arrivedAlertShownRef.current = true;
      Alert.alert('You have arrived', `You are at ${label}.`);
    }
  }, [arrived, label]);

  const distanceLabel =
    remainingMeters != null
      ? formatDistance(remainingMeters)
      : straightLineMeters != null
        ? formatDistance(straightLineMeters)
        : '—';

  return (
    <View style={styles.container}>
      <LiveMap
        locationLat={target.lat}
        locationLng={target.lng}
        driverLat={fix?.lat}
        driverLng={fix?.lng}
        driverRotation={fix?.heading}
        routeCoordinates={coordinates}
        followDriver
        focusToken={focusToken}
        overlayPadding={{ top: insets.top + 56, bottom: SHEET_HEIGHT }}
      />

      <View style={[styles.header, { top: insets.top + SPACING.sm }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {label}
        </Text>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setFocusToken((n) => n + 1)}
          accessibilityLabel="Re-centre map"
        >
          <Ionicons name="locate" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }]}>
        {permissionDenied ? (
          <Text style={styles.warning}>
            Location access is off. Turn it on in Settings to track your way to the parking space.
          </Text>
        ) : !fix ? (
          <View style={styles.locatingRow}>
            <ActivityIndicator color={colors.electricTeal} />
            <Text style={styles.subtle}>Finding your location…</Text>
          </View>
        ) : arrived ? (
          <View style={styles.arrivedRow}>
            <Ionicons name="checkmark-circle" size={26} color={colors.success} />
            <Text style={styles.arrivedText}>You have arrived</Text>
          </View>
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{etaMinutes != null ? `${etaMinutes} min` : '—'}</Text>
              <Text style={styles.statLabel}>Arrival</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{distanceLabel}</Text>
              <Text style={styles.statLabel}>Remaining</Text>
            </View>
          </View>
        )}

        {params.address ? (
          <View style={styles.addressRow}>
            <Ionicons name="location" size={16} color={colors.electricTeal} />
            <Text style={styles.addressText} numberOfLines={2}>
              {params.address}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => openExternalNavigation(target, label)}
          activeOpacity={0.85}
        >
          <Ionicons name="volume-high" size={18} color="#FFF" />
          <Text style={styles.primaryButtonText}>Voice directions in your maps app</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#E8EEF5' },
    header: {
      position: 'absolute',
      left: SPACING.md,
      right: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 6,
    },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#111827',
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      minHeight: SHEET_HEIGHT,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: SPACING.lg,
      gap: SPACING.md,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 12,
    },
    statsRow: { flexDirection: 'row', alignItems: 'center' },
    stat: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 22, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary },
    statLabel: { fontSize: FONT_SIZES.small, color: colors.textSecondary, marginTop: 2 },
    statDivider: { width: 1, height: 36, backgroundColor: colors.border },
    locatingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, justifyContent: 'center' },
    subtle: { color: colors.textSecondary, fontSize: FONT_SIZES.body },
    warning: { color: colors.coralRed, fontSize: FONT_SIZES.body, textAlign: 'center' },
    arrivedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
    arrivedText: { fontSize: 20, fontWeight: FONT_WEIGHTS.bold, color: colors.success },
    addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs },
    addressText: { flex: 1, color: colors.textSecondary, fontSize: FONT_SIZES.body },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.electricTeal,
    },
    primaryButtonText: { color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },
  });
