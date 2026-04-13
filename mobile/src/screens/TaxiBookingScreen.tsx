import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { taxiBookingsApi } from '@/api';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';

type TimingType = 'now' | 'leave_at' | 'arrive_by';

export function TaxiBookingScreen() {
  const navigation = useNavigation<NavigationProp<any>>();

  // Pickup
  const [pickupMethod, setPickupMethod] = useState<'gps' | 'manual'>('manual');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupPostcode, setPickupPostcode] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  // Destination
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationPostcode, setDestinationPostcode] = useState('');

  // Timing
  const [timingType, setTimingType] = useState<TimingType>('now');
  const [scheduledTime, setScheduledTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Note
  const [passengerNote, setPassengerNote] = useState('');

  // Taxi Type
  const [taxiType, setTaxiType] = useState<'Normal car' | 'Mini Bus' | 'Bus'>('Normal car');

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeRequest, setActiveRequest] = useState<any>(null);

  const handleUseMyLocation = useCallback(async () => {
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Allow location access to use GPS pickup.');
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
      setPickupMethod('gps');
      setPickupAddress(address);
      if (geo?.postalCode) setPickupPostcode(geo.postalCode);
    } catch (error) {
      Alert.alert('Error', 'Failed to get your location. Please enter it manually.');
    } finally {
      setFetchingLocation(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    // Validation
    if (pickupMethod === 'manual' && !pickupAddress && !pickupPostcode) {
      Alert.alert('Missing Pickup', 'Please enter your pickup address or postcode, or use GPS.');
      return;
    }

    if (!destinationAddress && !destinationPostcode) {
      Alert.alert('Missing Destination', 'Please enter your destination address or postcode.');
      return;
    }

    if (timingType !== 'now' && !scheduledTime) {
      Alert.alert('Missing Time', 'Please select your travel time.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await taxiBookingsApi.createRequest({
        pickupAddress: pickupMethod === 'gps' ? 'GPS Location' : pickupAddress || undefined,
        pickupPostcode: pickupPostcode || undefined,
        pickupLat: pickupCoords?.lat,
        pickupLng: pickupCoords?.lng,
        pickupFromGps: pickupMethod === 'gps',
        destinationAddress: destinationAddress || destinationPostcode,
        destinationPostcode: destinationPostcode || undefined,
        timingType,
        scheduledTime: timingType !== 'now' ? scheduledTime.toISOString() : undefined,
        passengerNote: passengerNote || undefined,
        taxiType,
      });

      if (res.data?.success) {
        setActiveRequest(res.data.data);
        Alert.alert(
          '🚖 Ride Request Sent!',
          'All nearby drivers have been notified. You will be matched with a driver shortly.',
        );
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to create request');
      }
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || error?.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [pickupMethod, pickupAddress, pickupPostcode, pickupCoords, destinationAddress, destinationPostcode, timingType, scheduledTime, passengerNote]);

  const handleCancel = useCallback(async () => {
    if (!activeRequest?._id) return;

    Alert.alert('Cancel Ride?', 'Are you sure you want to cancel this ride request?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await taxiBookingsApi.cancelRequest(activeRequest._id);
            setActiveRequest(null);
            Alert.alert('Cancelled', 'Your ride request has been cancelled.');
          } catch (error) {
            Alert.alert('Error', 'Failed to cancel. Try again.');
          }
        },
      },
    ]);
  }, [activeRequest]);

  const handleTimeChange = (event: any, selected?: Date) => {
    setShowTimePicker(false);
    if (selected) {
      setScheduledTime(selected);
    }
  };

  // If we have an active request, show the waiting/matched view
  if (activeRequest) {
    const isAccepted = activeRequest.status === 'accepted';

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {isAccepted ? '🎉 Driver Found!' : '🔍 Finding a Driver...'}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Status Card */}
            <View style={styles.statusCard}>
              {!isAccepted && (
                <ActivityIndicator size="large" color={COLORS.electricTeal} style={{ marginBottom: SPACING.lg }} />
              )}
              <Text style={styles.statusTitle}>
                {isAccepted ? 'Your driver is on the way!' : 'Notifying nearby drivers...'}
              </Text>
              <Text style={styles.statusDesc}>
                {isAccepted
                  ? `Arriving in ~${activeRequest.driverEtaMinutes} minutes`
                  : 'Please wait while we match you with a driver.'}
              </Text>
            </View>

            {/* Driver details if accepted */}
            {isAccepted && activeRequest.driverVehicle && (
              <View style={styles.driverCard}>
                <Text style={styles.sectionLabel}>Your Driver</Text>
                {activeRequest.driverNumber && (
                  <Text style={styles.driverNumber}>Driver #{activeRequest.driverNumber}</Text>
                )}
                <View style={styles.vehicleRow}>
                  <Ionicons name="car" size={20} color={COLORS.electricTeal} />
                  <Text style={styles.vehicleText}>
                    {activeRequest.driverVehicle.color} {activeRequest.driverVehicle.make} {activeRequest.driverVehicle.model}
                  </Text>
                </View>
                {activeRequest.driverVehicle.plateNumber && (
                  <View style={styles.plateBadge}>
                    <Text style={styles.plateText}>{activeRequest.driverVehicle.plateNumber}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Trip details */}
            <View style={styles.tripSummary}>
              <Text style={styles.sectionLabel}>Trip Details</Text>
              <View style={styles.tripRow}>
                <Ionicons name="radio-button-on" size={16} color={COLORS.success} />
                <Text style={styles.tripText}>{activeRequest.pickupAddress || activeRequest.pickupPostcode}</Text>
              </View>
              <View style={styles.tripDivider} />
              <View style={styles.tripRow}>
                <Ionicons name="location" size={16} color={COLORS.error} />
                <Text style={styles.tripText}>{activeRequest.destinationAddress}</Text>
              </View>
              {activeRequest.estimatedCost && (
                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>Estimated Cost</Text>
                  <Text style={styles.costValue}>£{activeRequest.estimatedCost.toFixed(2)}</Text>
                </View>
              )}
            </View>

            {/* Cancel button */}
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel Ride</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // Booking form
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book a Taxi</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── Pickup Section ── */}
          <Text style={styles.sectionLabel}>Pickup Location</Text>

          <TouchableOpacity
            style={[styles.gpsBtn, fetchingLocation && { opacity: 0.6 }]}
            onPress={handleUseMyLocation}
            disabled={fetchingLocation}
            activeOpacity={0.7}
          >
            {fetchingLocation ? (
              <ActivityIndicator size="small" color={COLORS.info} />
            ) : (
              <Ionicons name="navigate" size={20} color={COLORS.info} />
            )}
            <Text style={styles.gpsBtnText}>
              {pickupMethod === 'gps' ? '📍 Using GPS Location' : 'Use My Current Location'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.orText}>— or enter manually —</Text>

          <TextInput
            style={styles.input}
            placeholder="Pickup address"
            placeholderTextColor={COLORS.textTertiary}
            value={pickupAddress}
            onChangeText={(t) => { setPickupAddress(t); setPickupMethod('manual'); }}
          />
          <TextInput
            style={styles.input}
            placeholder="Pickup postcode (e.g. SW1A 1AA)"
            placeholderTextColor={COLORS.textTertiary}
            value={pickupPostcode}
            onChangeText={(t) => { setPickupPostcode(t.toUpperCase()); setPickupMethod('manual'); }}
            autoCapitalize="characters"
          />

          {/* ── Destination Section ── */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>Destination</Text>
          <TextInput
            style={styles.input}
            placeholder="Destination address"
            placeholderTextColor={COLORS.textTertiary}
            value={destinationAddress}
            onChangeText={setDestinationAddress}
          />
          <TextInput
            style={styles.input}
            placeholder="Destination postcode (e.g. E1 6AN)"
            placeholderTextColor={COLORS.textTertiary}
            value={destinationPostcode}
            onChangeText={(t) => setDestinationPostcode(t.toUpperCase())}
            autoCapitalize="characters"
          />

          {/* ── Timing Section ── */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>When?</Text>
          <View style={styles.timingRow}>
            {(['now', 'leave_at', 'arrive_by'] as TimingType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.timingOption, timingType === t && styles.timingOptionActive]}
                onPress={() => {
                  setTimingType(t);
                  if (t !== 'now') setShowTimePicker(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.timingText, timingType === t && styles.timingTextActive]}>
                  {t === 'now' ? '🕐 Now' : t === 'leave_at' ? '🚶 Leave At' : '📍 Arrive By'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {timingType !== 'now' && (
            <TouchableOpacity
              style={styles.timeDisplay}
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={20} color={COLORS.electricTeal} />
              <Text style={styles.timeDisplayText}>
                {scheduledTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                {' — '}
                {scheduledTime.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
              <Text style={styles.timeChangeText}>Change</Text>
            </TouchableOpacity>
          )}

          {showTimePicker && (
            <DateTimePicker
              value={scheduledTime}
              mode="datetime"
              is24Hour={true}
              minimumDate={new Date()}
              onChange={handleTimeChange}
            />
          )}

          {/* ── Taxi Type ── */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>Taxi Type</Text>
          <View style={styles.timingRow}>
            {([
              { value: 'Normal car', label: '🚗 Normal Car', seats: '4 seats' },
              { value: 'Mini Bus', label: '🚐 Mini Bus', seats: '6 seats' },
              { value: 'Bus', label: '🚌 Bus', seats: '8 seats' },
            ] as const).map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.timingOption, taxiType === opt.value && styles.timingOptionActive]}
                onPress={() => setTaxiType(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.timingText, taxiType === opt.value && styles.timingTextActive]}>
                  {opt.label}
                </Text>
                <Text style={[styles.timingText, { fontSize: 11, marginTop: 2 }, taxiType === opt.value && styles.timingTextActive]}>
                  {opt.seats}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Note ── */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>Note (optional)</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
            placeholder="Any special instructions for the driver..."
            placeholderTextColor={COLORS.textTertiary}
            value={passengerNote}
            onChangeText={setPassengerNote}
            multiline
          />

          {/* ── Pricing Info ── */}
          <View style={styles.pricingInfo}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.textSecondary} />
            <Text style={styles.pricingText}>
              Fare: £1.10/mile + £0.20/min. Final cost calculated at trip end.
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
                <Text style={styles.submitBtnText}>Request Taxi</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },

  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },

  // Sections
  sectionLabel: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.sm,
  },

  // GPS
  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.info,
  },
  gpsBtnText: {
    color: COLORS.info, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.semibold,
  },
  orText: {
    color: COLORS.textTertiary, fontSize: FONT_SIZES.small,
    textAlign: 'center', marginVertical: SPACING.sm,
  },

  // Input
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, color: COLORS.textPrimary, fontSize: FONT_SIZES.label,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm,
  },

  // Timing
  timingRow: {
    flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  timingOption: {
    flex: 1, paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', backgroundColor: COLORS.surface,
  },
  timingOptionActive: {
    borderColor: COLORS.electricTeal, backgroundColor: `${COLORS.electricTeal}10`,
  },
  timingText: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium,
  },
  timingTextActive: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.bold },

  // Time display
  timeDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  timeDisplayText: {
    flex: 1, color: COLORS.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium,
  },
  timeChangeText: {
    color: COLORS.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.semibold,
  },

  // Pricing
  pricingInfo: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.lg,
  },
  pricingText: {
    flex: 1, color: COLORS.textSecondary, fontSize: FONT_SIZES.small, lineHeight: 18,
  },

  // Submit
  submitBtn: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold,
  },

  // ── Active Request View ──
  statusCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  statusTitle: {
    color: COLORS.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center', marginBottom: SPACING.sm,
  },
  statusDesc: {
    color: COLORS.textSecondary, fontSize: 14, textAlign: 'center',
  },

  driverCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  driverNumber: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginBottom: SPACING.sm,
  },
  vehicleRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  vehicleText: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.medium,
  },
  plateBadge: {
    alignSelf: 'flex-start', backgroundColor: '#FEF3C7',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: '#FDE68A',
  },
  plateText: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold, letterSpacing: 1,
  },

  tripSummary: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tripRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
  },
  tripDivider: {
    width: 2, height: 20, backgroundColor: COLORS.border,
    marginLeft: 7, marginVertical: 4,
  },
  tripText: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.label, flex: 1,
  },
  costRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: SPACING.md, paddingTop: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  costLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.label },
  costValue: { color: COLORS.electricTeal, fontSize: 18, fontWeight: FONT_WEIGHTS.bold },

  cancelBtn: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.error,
  },
  cancelBtnText: { color: COLORS.error, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },
});
