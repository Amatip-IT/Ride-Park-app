import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, Platform, ActivityIndicator, FlatList, Alert,
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import * as Location from 'expo-location';
import { searchLocationByText, PlaceSuggestion } from '@/api/amazonLocation';
import { searchApi, taxiBookingsApi } from '@/api';
import { useLocationBias } from '@/hooks/useLocationBias';
import { getApiErrorMessage, haversineDistanceMiles, estimateDurationMinutes } from '@/utils/helpers';
import { secureStorage } from '@/utils/secureStorage';

const RECENT_SEARCHES_KEY = 'gleezip_recent_destinations';
const MAX_RECENT = 8;

interface RecentDestination {
  label: string;
  lat?: number;
  lng?: number;
  postalCode?: string;
  timestamp: number;
}

export function QuickRideScreen() {
  const navigation = useNavigation<NavigationProp<any>>();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const biasPosition = useLocationBias();

  // User's current location
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userAddress, setUserAddress] = useState<string>('');
  const [locatingUser, setLocatingUser] = useState(true);

  // Destination input
  const [destination, setDestination] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recent searches
  const [recentSearches, setRecentSearches] = useState<RecentDestination[]>([]);

  // Nearby drivers
  const [nearbyDrivers, setNearbyDrivers] = useState<any[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);

  // Get user's GPS on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocatingUser(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setUserLocation(coords);

        const [geo] = await Location.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lng,
        });
        if (geo) {
          const addr = [geo.streetNumber, geo.street, geo.city].filter(Boolean).join(', ');
          setUserAddress(addr || 'Your location');
        } else {
          setUserAddress('Your location');
        }
      } catch {
        setUserAddress('Your location');
      } finally {
        setLocatingUser(false);
      }
    })();
  }, []);

  // Load recent searches
  useEffect(() => {
    (async () => {
      try {
        const stored = await secureStorage.getItem(RECENT_SEARCHES_KEY);
        if (stored) setRecentSearches(JSON.parse(stored));
      } catch {}
    })();
  }, []);

  // Fetch nearby taxis when user location is known
  useEffect(() => {
    if (!userLocation) return;
    setLoadingDrivers(true);
    searchApi
      .searchTaxisNearby(userLocation.lat, userLocation.lng, 1, 10)
      .then((res) => {
        if (res.data?.success) {
          const online = (res.data.data || []).filter((d: any) => d.availability === 'online');
          setNearbyDrivers(online);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDrivers(false));
  }, [userLocation]);

  // Debounced destination search
  const handleDestinationChange = useCallback(
    (text: string) => {
      setDestination(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (text.trim().length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        const results = await searchLocationByText(text, {
          biasPosition: userLocation ?? biasPosition ?? undefined,
          maxResults: 6,
        });
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      }, 250);
    },
    [userLocation, biasPosition],
  );

  // Save to recent
  const saveRecent = useCallback(async (dest: RecentDestination) => {
    const updated = [
      dest,
      ...recentSearches.filter((r) => r.label !== dest.label),
    ].slice(0, MAX_RECENT);
    setRecentSearches(updated);
    try {
      await secureStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {}
  }, [recentSearches]);

  // Select destination and request ride instantly
  const handleSelectDestination = useCallback(
    async (place: PlaceSuggestion | RecentDestination) => {
      if (!userLocation) {
        Alert.alert('Location needed', 'We need your GPS location for pickup. Please enable location services.');
        return;
      }

      const destLat = (place as RecentDestination).lat ?? (place as PlaceSuggestion).point?.lat;
      const destLng = (place as RecentDestination).lng ?? (place as PlaceSuggestion).point?.lng;
      const destLabel = place.label;
      const destPostal = (place as PlaceSuggestion).postalCode ?? (place as RecentDestination).postalCode;

      setDestination(destLabel);
      setShowSuggestions(false);
      setSuggestions([]);

      // Save to recent
      await saveRecent({
        label: destLabel,
        lat: destLat,
        lng: destLng,
        postalCode: destPostal,
        timestamp: Date.now(),
      });

      // Calculate estimate
      const distMiles = destLat && destLng
        ? haversineDistanceMiles(userLocation.lat, userLocation.lng, destLat, destLng)
        : 5;
      const durMins = estimateDurationMinutes(distMiles);
      const cost = Math.round((distMiles * 1.1 + durMins * 0.2) * 100) / 100;

      // Submit ride request
      setSubmitting(true);
      try {
        const res = await taxiBookingsApi.createRequest({
          pickupAddress: userAddress || 'GPS Location',
          pickupLat: userLocation.lat,
          pickupLng: userLocation.lng,
          pickupFromGps: true,
          destinationAddress: destLabel,
          destinationPostcode: destPostal || undefined,
          destinationLat: destLat || undefined,
          destinationLng: destLng || undefined,
          timingType: 'now',
          taxiType: 'Normal car',
          estimatedDistanceMiles: Math.round(distMiles * 10) / 10,
          estimatedDurationMinutes: Math.round(durMins),
          estimatedCost: cost,
        });

        if (res.data?.success) {
          Alert.alert(
            '🚖 Ride Requested!',
            res.data.message || `Searching for a driver. Estimated: ${Math.round(durMins)} min, £${cost.toFixed(2)}`,
            [
              { text: 'Track', onPress: () => navigation.navigate('ConsumerTabs', { screen: 'Bookings' }) },
              { text: 'OK' },
            ],
          );
          setDestination('');
        } else {
          const msg = res.data?.message || 'Could not request ride';
          if (msg.toLowerCase().includes('payment')) {
            Alert.alert('Card required', msg, [
              { text: 'Add card', onPress: () => navigation.navigate('ConsumerTabs', { screen: 'Wallet' }) },
              { text: 'Cancel', style: 'cancel' },
            ]);
          } else {
            Alert.alert('Could not book', msg);
          }
        }
      } catch (err) {
        Alert.alert('Error', getApiErrorMessage(err, 'Failed to request ride'));
      } finally {
        setSubmitting(false);
      }
    },
    [userLocation, userAddress, biasPosition, navigation, saveRecent],
  );

  const driverCount = nearbyDrivers.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Get a Ride</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Pickup indicator */}
        <View style={styles.pickupRow}>
          <View style={styles.dotGreen} />
          <View style={styles.pickupInfo}>
            <Text style={styles.pickupLabel}>PICKUP</Text>
            <Text style={styles.pickupAddress} numberOfLines={1}>
              {locatingUser ? 'Getting your location...' : userAddress || 'Enable location'}
            </Text>
          </View>
          {locatingUser && <ActivityIndicator size="small" color={colors.electricTeal} />}
        </View>

        {/* Destination input — "Where to?" */}
        <View style={styles.destinationRow}>
          <View style={styles.dotOrange} />
          <TextInput
            style={styles.destinationInput}
            placeholder="Where to?"
            placeholderTextColor={colors.textTertiary}
            value={destination}
            onChangeText={handleDestinationChange}
            returnKeyType="search"
            autoFocus
          />
          {destination.length > 0 && (
            <TouchableOpacity onPress={() => { setDestination(''); setSuggestions([]); setShowSuggestions(false); }}>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Nearby drivers badge */}
        {!showSuggestions && userLocation && (
          <View style={styles.driversBadge}>
            <Ionicons name="car" size={16} color={colors.electricTeal} />
            <Text style={styles.driversBadgeText}>
              {loadingDrivers
                ? 'Finding drivers near you...'
                : driverCount > 0
                  ? `${driverCount} taxi${driverCount > 1 ? 's' : ''} available near you`
                  : 'No taxis online nearby right now'}
            </Text>
          </View>
        )}

        {/* Suggestions OR Recents */}
        {showSuggestions ? (
          <FlatList
            data={suggestions}
            keyExtractor={(_, i) => `sug-${i}`}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionRow}
                onPress={() => handleSelectDestination(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="location" size={20} color={colors.electricTeal} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, marginLeft: SPACING.md }}>
                  <Text style={styles.suggestionLabel} numberOfLines={1}>{item.label}</Text>
                  {(item.municipality || item.country) && (
                    <Text style={styles.suggestionSub} numberOfLines={1}>
                      {[item.municipality, item.country].filter(Boolean).join(', ')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        ) : (
          <FlatList
            data={recentSearches}
            keyExtractor={(item, i) => `recent-${i}`}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ListHeaderComponent={
              recentSearches.length > 0 ? (
                <Text style={styles.sectionLabel}>Recent</Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="navigate-outline" size={48} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>Where are you going?</Text>
                <Text style={styles.emptySub}>
                  Type your destination above. We'll find nearby taxis and get you moving fast.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionRow}
                onPress={() => handleSelectDestination(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
                <View style={{ flex: 1, marginLeft: SPACING.md }}>
                  <Text style={styles.suggestionLabel} numberOfLines={1}>{item.label}</Text>
                  {item.postalCode && (
                    <Text style={styles.suggestionSub}>{item.postalCode}</Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {/* Submitting overlay */}
        {submitting && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color={colors.electricTeal} />
            <Text style={styles.overlayText}>Requesting your ride...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingTop: Platform.OS === 'android' ? SPACING.lg : SPACING.sm,
      paddingBottom: SPACING.md,
    },
    headerTitle: {
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
    },
    pickupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dotGreen: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.electricTeal,
    },
    pickupInfo: { flex: 1, marginLeft: SPACING.md },
    pickupLabel: {
      fontSize: 10,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textTertiary,
      letterSpacing: 0.5,
    },
    pickupAddress: {
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      marginTop: 2,
    },
    destinationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    dotOrange: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.amber,
    },
    destinationInput: {
      flex: 1,
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      marginLeft: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    driversBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      backgroundColor: `${colors.electricTeal}10`,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    driversBadgeText: {
      fontSize: FONT_SIZES.small,
      color: colors.textSecondary,
    },
    list: { flex: 1 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.sm,
    },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    suggestionLabel: {
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      fontWeight: FONT_WEIGHTS.medium,
    },
    suggestionSub: {
      fontSize: FONT_SIZES.small,
      color: colors.textTertiary,
      marginTop: 2,
    },
    emptyState: {
      alignItems: 'center',
      paddingTop: 80,
      paddingHorizontal: SPACING.xl,
    },
    emptyTitle: {
      fontSize: FONT_SIZES.section,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginTop: SPACING.lg,
    },
    emptySub: {
      fontSize: FONT_SIZES.label,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.sm,
      lineHeight: 20,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.background === '#FFFFFF' ? 'rgba(255,255,255,0.9)' : 'rgba(13,27,42,0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 999,
    },
    overlayText: {
      marginTop: SPACING.md,
      fontSize: FONT_SIZES.body,
      color: colors.textPrimary,
      fontWeight: FONT_WEIGHTS.medium,
    },
  });
