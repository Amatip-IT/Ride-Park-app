import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { useLocationBias } from '@/hooks/useLocationBias';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp, useRoute, RouteProp } from '@react-navigation/native';
import { bookingsApi } from '@/api';
import { calculateChauffeurQuotedPrice } from '@/constants/pricing';
import { formatCurrency } from '@/utils/helpers';
import * as Location from 'expo-location';
import { PlatformDateTimePicker } from '@/components/PlatformDateTimePicker';

type RouteParams = {
  DriverRequest: { serviceId?: string; prefilledName?: string };
};

export function DriverRequestScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NavigationProp<any>>();
  const route = useRoute<RouteProp<RouteParams, 'DriverRequest'>>();
  const targetServiceId = route.params?.serviceId;
  const targetName = route.params?.prefilledName;
  const biasPosition = useLocationBias();

  // Location
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupPostcode, setPickupPostcode] = useState('');
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [usingGps, setUsingGps] = useState(false);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Duration
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000)); // +2 hours default
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Notes
  const [notes, setNotes] = useState('');

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUseMyLocation = useCallback(async () => {
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Allow location access to use GPS.');
        setFetchingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // Reverse geocode to get address
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const address = geo
        ? [geo.streetNumber, geo.street, geo.city, geo.region, geo.postalCode].filter(Boolean).join(', ')
        : '📍 Current Location';

      setPickupCoords({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
      setPickupAddress(address);
      if (geo?.postalCode) setPickupPostcode(geo.postalCode);
      setUsingGps(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to get your location. Please enter it manually.');
    } finally {
      setFetchingLocation(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!pickupAddress && !pickupPostcode) {
      Alert.alert('Missing Location', 'Please enter your pickup address or use GPS.');
      return;
    }

    if (endTime <= startTime) {
      Alert.alert('Invalid Duration', 'End time must be after start time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await bookingsApi.createRequest({
        serviceType: 'driver',
        serviceId: targetServiceId || undefined, // Include if targeted
        pickupAddress: pickupAddress || undefined,
        pickupPostcode: pickupPostcode || undefined,
        pickupLat: pickupCoords?.lat,
        pickupLng: pickupCoords?.lng,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        notes: notes || undefined,
      });

      if (res.data?.success) {
        Alert.alert(
          '✅ Request Submitted!',
          targetServiceId
            ? `Your request to ${targetName || 'the driver'} has been sent. You can cancel anytime from My Bookings while it is pending or accepted.`
            : 'Your broadcast request has been sent to nearby drivers. You can cancel anytime from My Bookings while it is pending or accepted.',
          [
            { text: 'My Bookings', onPress: () => navigation.navigate('ConsumerTabs', { screen: 'Bookings' }) },
            { text: 'OK' },
          ],
        );
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to submit request');
      }
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || error?.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [pickupAddress, pickupPostcode, pickupCoords, startTime, endTime, notes, navigation, targetServiceId]);

  const durationHours = Math.max(0, (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60));
  const chauffeurQuote = calculateChauffeurQuotedPrice(startTime, endTime);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Request a Driver</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {targetName && (
            <View style={styles.preselectedDriverCard}>
              <View style={styles.preselectedDriverHeader}>
                <Ionicons name="shield-checkmark" size={16} color={colors.electricTeal} />
                <Text style={styles.preselectedDriverLabel}>DIRECT DRIVER BOOKING SECURED</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: SPACING.sm }}>
                <View style={styles.driverAvatarMini}>
                  <Text style={styles.driverAvatarMiniText}>
                    {targetName.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverNameText}>{targetName}</Text>
                  <Text style={styles.driverNumSubtext}>
                    Your private hire request will be routed directly to this verified operator.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Location ── */}
          <Text style={styles.sectionLabel}>Start Location</Text>

          <TouchableOpacity
            style={[styles.gpsBtn, fetchingLocation && { opacity: 0.6 }]}
            onPress={handleUseMyLocation}
            disabled={fetchingLocation}
            activeOpacity={0.7}
          >
            {fetchingLocation ? (
              <ActivityIndicator size="small" color={colors.info} />
            ) : (
              <Ionicons name="navigate" size={20} color={colors.info} />
            )}
            <Text style={styles.gpsBtnText}>
              {usingGps ? '📍 Using GPS Location' : 'Use My Current Location'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.orText}>— or enter manually —</Text>

          <LocationAutocompleteInput
            style={styles.input}
            placeholder="Address"
            placeholderTextColor={colors.textTertiary}
            value={pickupAddress}
            onChangeText={(text) => {
              setPickupAddress(text);
              setUsingGps(false);
              setPickupCoords(null);
            }}
            onSelectPlace={(place) => {
              setPickupAddress(place.label);
              setUsingGps(false);
              if (place.point?.lat && place.point?.lng) {
                setPickupCoords({ lat: place.point.lat, lng: place.point.lng });
              }
              if (place.postalCode) setPickupPostcode(place.postalCode);
            }}
            searchOptions={{
              biasPosition: pickupCoords ?? biasPosition ?? undefined,
            }}
          />
          <TextInput
            style={styles.input}
            placeholder="Postcode or house number"
            placeholderTextColor={colors.textTertiary}
            value={pickupPostcode}
            onChangeText={(t) => { setPickupPostcode(t); setUsingGps(false); }}
          />

          {/* ── Duration ── */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>Duration</Text>

          {/* Start Time */}
          <TouchableOpacity
            style={styles.timeField}
            onPress={() => setShowStartPicker(true)}
            activeOpacity={0.7}
          >
            <View style={styles.timeIconRow}>
              <Ionicons name="time-outline" size={20} color={colors.success} />
              <Text style={styles.timeLabel}>Start Time</Text>
            </View>
            <Text style={styles.timeValue}>
              {startTime.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>

          <PlatformDateTimePicker
            visible={showStartPicker}
            value={startTime}
            minimumDate={new Date()}
            onChange={setStartTime}
            onClose={() => setShowStartPicker(false)}
          />

          {/* End Time */}
          <TouchableOpacity
            style={styles.timeField}
            onPress={() => setShowEndPicker(true)}
            activeOpacity={0.7}
          >
            <View style={styles.timeIconRow}>
              <Ionicons name="time-outline" size={20} color={colors.error} />
              <Text style={styles.timeLabel}>End Time</Text>
            </View>
            <Text style={styles.timeValue}>
              {endTime.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>

          <PlatformDateTimePicker
            visible={showEndPicker}
            value={endTime}
            minimumDate={startTime}
            onChange={setEndTime}
            onClose={() => setShowEndPicker(false)}
          />

          {/* Duration Summary */}
          <View style={styles.durationSummary}>
            <Ionicons name="hourglass-outline" size={18} color={colors.electricTeal} />
            <View style={{ flex: 1 }}>
              <Text style={styles.durationText}>
                Duration: {durationHours.toFixed(1)} hour{durationHours !== 1 ? 's' : ''}
                {' '}({chauffeurQuote.billableHours} billable hr{chauffeurQuote.billableHours !== 1 ? 's' : ''})
              </Text>
              <Text style={styles.quoteText}>
                Estimated total: {formatCurrency(chauffeurQuote.quotedPrice)} (paid after the service)
              </Text>
            </View>
          </View>

          {/* ── Notes ── */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
            placeholder="Any special instructions or requirements..."
            placeholderTextColor={colors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          {/* ── Pricing Info ── */}
          <View style={styles.pricingInfo}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.pricingText}>
              Quote uses £1.10/mile × estimated distance for your booked hours. You confirm payment after the service is finished.
            </Text>
          </View>

          {/* ── Submit ── */}
          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.submitBtnText}>Submit Driver Request</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: {
    color: colors.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },
  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },
  sectionLabel: {
    color: colors.textPrimary, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.sm,
  },
  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, borderWidth: 1, borderColor: colors.info,
  },
  gpsBtnText: {
    color: colors.info, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.semibold,
  },
  orText: {
    color: colors.textTertiary, fontSize: FONT_SIZES.small,
    textAlign: 'center', marginVertical: SPACING.sm,
  },
  input: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, color: colors.textPrimary, fontSize: FONT_SIZES.label,
    borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.sm,
  },
  timeField: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: SPACING.sm,
  },
  timeIconRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4,
  },
  timeLabel: {
    color: colors.textSecondary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium,
  },
  timeValue: {
    color: colors.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold,
  },
  durationSummary: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: `${colors.electricTeal}10`, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginTop: SPACING.xs,
  },
  durationText: {
    color: colors.electricTeal, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.semibold,
  },
  quoteText: {
    color: colors.textPrimary, fontSize: FONT_SIZES.small, marginTop: 4,
  },
  pricingInfo: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.lg,
  },
  pricingText: {
    flex: 1, color: colors.textSecondary, fontSize: FONT_SIZES.small, lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: colors.info, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold,
  },

  // Preselected Driver Card
  preselectedDriverCard: {
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  preselectedDriverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: SPACING.sm,
  },
  preselectedDriverLabel: {
    color: colors.electricTeal,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  driverAvatarMini: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.electricTeal}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverAvatarMiniText: {
    color: colors.electricTeal,
    fontSize: 14,
    fontWeight: 'bold',
  },
  driverNameText: {
    color: colors.textPrimary,
    fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.bold,
  },
  driverNumSubtext: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },

  // Autocomplete suggestions
  suggestionsContainer: {
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: -SPACING.sm + 2,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: FONT_SIZES.small,
    lineHeight: 18,
  },
});
