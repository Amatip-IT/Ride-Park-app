import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, TextInput, Modal
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { AmazonMap } from '@/components/AmazonMap';
import { LocationAutocompleteInput } from '@/components/LocationAutocompleteInput';
import { useLocationBias } from '@/hooks/useLocationBias';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { taxiBookingsApi, ridesApi } from '@/api';
import * as Location from 'expo-location';
import { getApiErrorMessage, haversineDistanceMiles, estimateDurationMinutes } from '@/utils/helpers';
import { canCancelRide, getCancelRideMessage } from '@/utils/cancellation';
import { PlatformDateTimePicker } from '@/components/PlatformDateTimePicker';

type TimingType = 'now' | 'leave_at' | 'arrive_by';

type RouteParams = {
  TaxiBooking: { serviceId?: string; prefilledName?: string };
};

export function TaxiBookingScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NavigationProp<any>>();
  const route = useRoute<RouteProp<RouteParams, 'TaxiBooking'>>();
  const targetServiceId = route.params?.serviceId;
  const targetName = route.params?.prefilledName;
  const biasPosition = useLocationBias();

  // Pickup
  const [pickupMethod, setPickupMethod] = useState<'gps' | 'manual'>('manual');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupPostcode, setPickupPostcode] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  // Preview Map Modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [estimatedMiles, setEstimatedMiles] = useState(4.3);
  const [estimatedCost, setEstimatedCost] = useState(9.75);
  const [estimatedDuration, setEstimatedDuration] = useState(12);

  // Destination
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationPostcode, setDestinationPostcode] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);

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
  const [calculatingEstimate, setCalculatingEstimate] = useState(false);
  const [activeRequest, setActiveRequest] = useState<any>(null);
  const [loadingActiveRequest, setLoadingActiveRequest] = useState(true);
  const [activeRequestError, setActiveRequestError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const checkExistingRequest = useCallback(async () => {
    setLoadingActiveRequest(true);
    try {
      const res = await taxiBookingsApi.getMyRequests();
      if (res.data?.success && res.data.data) {
        const active = res.data.data.find((r: any) =>
          ['searching', 'accepted', 'arrived', 'in_progress', 'awaiting_payment'].includes(r.status),
        );
        setActiveRequest(active || null);
        setActiveRequestError(null);
      }
    } catch (err) {
      setActiveRequestError(getApiErrorMessage(err, 'Could not check for an active ride.'));
    } finally {
      setLoadingActiveRequest(false);
    }
  }, []);

  // Do not permit a second request until we know there is no active or unpaid ride.
  useFocusEffect(
    useCallback(() => {
      checkExistingRequest();
    }, [checkExistingRequest]),
  );

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
      } catch {
      Alert.alert('Error', 'Failed to get your location. Please enter it manually.');
    } finally {
      setFetchingLocation(false);
    }
  }, []);

  const resolvePickupCoordinates = async (): Promise<{ lat: number; lng: number } | null> => {
    if (pickupCoords) return pickupCoords;

    const query = pickupPostcode || pickupAddress;
    if (!query) return null;

    try {
      const results = await Location.geocodeAsync(query);
      if (results[0]) {
        const coords = { lat: results[0].latitude, lng: results[0].longitude };
        setPickupCoords(coords);
        return coords;
      }
    } catch {
      // fall through
    }
    return null;
  };

  const resolveDestinationCoordinates = async (): Promise<{ lat: number; lng: number } | null> => {
    if (destinationCoords) return destinationCoords;

    const query = destinationPostcode || destinationAddress;
    if (!query) return null;

    try {
      const results = await Location.geocodeAsync(query);
      if (results[0]) {
        const coords = { lat: results[0].latitude, lng: results[0].longitude };
        setDestinationCoords(coords);
        return coords;
      }
    } catch {
      // fall through
    }
    return null;
  };

  const handleCalculatePreview = async () => {
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

    setCalculatingEstimate(true);
    try {
      let miles = 4;
      let mins = 12;

      const pickup = await resolvePickupCoordinates();
      const destination = await resolveDestinationCoordinates();

      if (pickup && destination) {
        miles = haversineDistanceMiles(
          pickup.lat,
          pickup.lng,
          destination.lat,
          destination.lng,
        );
        mins = estimateDurationMinutes(miles);
      }

      miles = Math.max(0.5, Math.round(miles * 10) / 10);
      mins = Math.max(5, mins);

      const res = await ridesApi.getEstimate('taxi', miles, mins);
      if (res.data?.success && res.data.data) {
        setEstimatedMiles(res.data.data.distanceMiles ?? miles);
        setEstimatedDuration(res.data.data.durationMinutes ?? mins);
        setEstimatedCost(res.data.data.totalCost ?? 0);
      } else {
        setEstimatedMiles(miles);
        setEstimatedDuration(mins);
        setEstimatedCost(Math.round((miles * 1.1 + mins * 0.2) * 100) / 100);
      }

      setShowPreviewModal(true);
    } catch {
      Alert.alert('Error', 'Could not calculate fare estimate. Please try again.');
    } finally {
      setCalculatingEstimate(false);
    }
  };

  const confirmAndRequest = useCallback(async () => {
    setShowPreviewModal(false);
    setIsSubmitting(true);

    try {
      const pickup = await resolvePickupCoordinates();
      const destination = await resolveDestinationCoordinates();

      if (!pickup) {
        Alert.alert('Pickup location', 'We could not locate your pickup. Please use GPS or check the address.');
        return;
      }
      if (!destination) {
        Alert.alert('Destination', 'We could not locate your destination. Please check the address or postcode.');
        return;
      }

      const res = await taxiBookingsApi.createRequest({
        pickupAddress: pickupMethod === 'gps' ? pickupAddress || 'GPS Location' : pickupAddress || undefined,
        pickupPostcode: pickupPostcode || undefined,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupFromGps: pickupMethod === 'gps',
        destinationAddress: destinationAddress || destinationPostcode,
        destinationPostcode: destinationPostcode || undefined,
        destinationLat: destination.lat,
        destinationLng: destination.lng,
        timingType,
        scheduledTime: timingType !== 'now' ? scheduledTime.toISOString() : undefined,
        passengerNote: passengerNote || undefined,
        taxiType,
        targetDriverId: targetServiceId || undefined,
        estimatedDistanceMiles: estimatedMiles,
        estimatedDurationMinutes: estimatedDuration,
        estimatedCost,
      });

      if (res.data?.success) {
        const created = res.data.data;
        setActiveRequest(created);
        navigation.replace('PassengerTracking', { requestId: created._id });
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to create request');
      }
    } catch (error: unknown) {
      Alert.alert('Error', getApiErrorMessage(error, 'Something went wrong'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    pickupMethod,
    pickupAddress,
    pickupPostcode,
    pickupCoords,
    destinationAddress,
    destinationPostcode,
    destinationCoords,
    timingType,
    scheduledTime,
    passengerNote,
    taxiType,
    estimatedMiles,
    estimatedDuration,
    estimatedCost,
  ]);

  const handleCancel = useCallback(async () => {
    if (!activeRequest?._id) return;

    Alert.alert('Cancel Ride?', getCancelRideMessage(activeRequest.status), [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setIsCancelling(true);
          try {
            const res = await taxiBookingsApi.cancelRequest(activeRequest._id);
            if (res.data?.success) {
              setActiveRequest(null);
              Alert.alert('Cancelled', res.data.message || 'Your ride request has been cancelled.');
            } else {
              Alert.alert('Error', res.data?.message || 'Failed to cancel ride request.');
            }
          } catch (error: any) {
            const message = error?.response?.data?.message 
              || error?.message 
              || 'Failed to cancel. Try again.';
            Alert.alert('Error', message);
          } finally {
            setIsCancelling(false);
          }
        },
      },
    ]);
  }, [activeRequest]);

  const openSchedulePicker = () => setShowTimePicker(true);

  // Show loading state while checking for existing request
  if (loadingActiveRequest) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={colors.electricTeal} />
          <Text style={{ color: colors.textSecondary, marginTop: SPACING.md }}>Checking active requests...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (activeRequestError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: SPACING.xl }]}>
          <Ionicons name="cloud-offline-outline" size={54} color={colors.coralRed} />
          <Text style={[styles.headerTitle, { marginTop: SPACING.lg, textAlign: 'center' }]}>Unable to check active rides</Text>
          <Text style={{ color: colors.textSecondary, marginTop: SPACING.sm, textAlign: 'center' }}>{activeRequestError}</Text>
          <TouchableOpacity style={[styles.gpsBtn, { marginTop: SPACING.xl }]} onPress={checkExistingRequest}>
            <Text style={styles.gpsBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // If we have an active request, show the waiting/matched view
  if (activeRequest) {
    const isAccepted = ['accepted', 'arrived', 'in_progress'].includes(activeRequest.status);
    const isSearching = activeRequest.status === 'searching';
    const isArrived = activeRequest.status === 'arrived';
    const isAwaitingPayment = activeRequest.status === 'awaiting_payment';

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {isArrived
                ? '📍 Driver Has Arrived'
                : isAwaitingPayment
                  ? 'Payment Required'
                : isAccepted
                  ? '🎉 Driver Found!'
                  : '🔍 Finding a Driver...'}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.statusCard}>
              {isSearching && (
                <ActivityIndicator size="large" color={colors.electricTeal} style={{ marginBottom: SPACING.lg }} />
              )}
              <Text style={styles.statusTitle}>
                {isArrived
                  ? 'Your driver is at the pickup point'
                  : isAwaitingPayment
                    ? 'Your trip has ended'
                  : isAccepted
                    ? 'Your driver is on the way!'
                    : 'Notifying nearby drivers...'}
              </Text>
              <Text style={styles.statusDesc}>
                {isArrived
                  ? 'Head to the pickup location or cancel if you no longer need the ride.'
                  : isAwaitingPayment
                    ? 'Confirm your destination and complete payment before requesting another ride.'
                  : isAccepted
                    ? `Arriving in ~${activeRequest.driverEtaMinutes ?? '—'} minutes`
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
                  <Ionicons name="car" size={20} color={colors.electricTeal} />
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
                <Ionicons name="radio-button-on" size={16} color={colors.success} />
                <Text style={styles.tripText}>{activeRequest.pickupAddress || activeRequest.pickupPostcode}</Text>
              </View>
              <View style={styles.tripDivider} />
              <View style={styles.tripRow}>
                <Ionicons name="location" size={16} color={colors.error} />
                <Text style={styles.tripText}>{activeRequest.destinationAddress}</Text>
              </View>
              {activeRequest.estimatedCost && (
                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>Estimated Cost</Text>
                  <Text style={styles.costValue}>£{activeRequest.estimatedCost.toFixed(2)}</Text>
                </View>
              )}
            </View>

            {/* Track driver on map when accepted */}
            {(isAccepted || isArrived || isAwaitingPayment) && (
              <TouchableOpacity
                style={{
                  backgroundColor: colors.electricTeal,
                  paddingVertical: SPACING.lg,
                  borderRadius: BORDER_RADIUS.lg,
                  alignItems: 'center',
                  marginBottom: SPACING.md,
                  shadowColor: colors.electricTeal,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 4,
                }}
                onPress={() => navigation.navigate('PassengerTracking', { requestId: activeRequest._id })}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' as any }}>
                  {isAwaitingPayment ? 'Complete Payment' : '📍 Track Driver on Map'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Cancel button — only for statuses the API actually supports */}
            {canCancelRide(activeRequest.status) && (
              <TouchableOpacity 
                style={[styles.cancelBtn, isCancelling && { opacity: 0.6 }]} 
                onPress={handleCancel} 
                activeOpacity={0.7}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={styles.cancelBtnText}>Cancel Ride</Text>
                )}
              </TouchableOpacity>
            )}
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
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book a Taxi</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {targetName && (
            <View style={styles.preselectedDriverCard}>
              <View style={styles.preselectedDriverHeader}>
                <Ionicons name="shield-checkmark" size={16} color={colors.electricTeal} />
                <Text style={styles.preselectedDriverLabel}>DIRECT TAXI BOOKING SECURED</Text>
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
                    Your request will be routed directly to this verified operator.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Pickup Section ── */}
          <Text style={styles.sectionLabel}>Pickup Location</Text>

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
              {pickupMethod === 'gps' ? '📍 Using GPS Location' : 'Use My Current Location'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.orText}>— or enter manually —</Text>

          <LocationAutocompleteInput
            style={styles.input}
            placeholder="Pickup address"
            placeholderTextColor={colors.textTertiary}
            value={pickupAddress}
            onChangeText={(t) => {
              setPickupAddress(t);
              setPickupMethod('manual');
              setPickupCoords(null);
            }}
            onSelectPlace={(place) => {
              setPickupAddress(place.label);
              setPickupMethod('manual');
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
            onChangeText={(t) => { setPickupPostcode(t); setPickupMethod('manual'); }}
          />

          {/* ── Destination Section ── */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>Destination</Text>
          <LocationAutocompleteInput
            style={styles.input}
            placeholder="Destination address"
            placeholderTextColor={colors.textTertiary}
            value={destinationAddress}
            onChangeText={(text) => {
              setDestinationAddress(text);
              setDestinationCoords(null);
            }}
            onSelectPlace={(place) => {
              setDestinationAddress(place.label);
              if (place.point?.lat && place.point?.lng) {
                setDestinationCoords({ lat: place.point.lat, lng: place.point.lng });
              }
              if (place.postalCode) setDestinationPostcode(place.postalCode);
            }}
            searchOptions={{
              biasPosition: pickupCoords ?? biasPosition ?? undefined,
            }}
          />
          <TextInput
            style={styles.input}
            placeholder="Postcode or house number"
            placeholderTextColor={colors.textTertiary}
            value={destinationPostcode}
            onChangeText={setDestinationPostcode}
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
                  if (t !== 'now') openSchedulePicker();
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
              onPress={openSchedulePicker}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={20} color={colors.electricTeal} />
              <Text style={styles.timeDisplayText}>
                {scheduledTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                {' — '}
                {scheduledTime.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
              <Text style={styles.timeChangeText}>Change</Text>
            </TouchableOpacity>
          )}

          <PlatformDateTimePicker
            visible={showTimePicker}
            value={scheduledTime}
            minimumDate={new Date()}
            onChange={setScheduledTime}
            onClose={() => setShowTimePicker(false)}
          />

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
            placeholderTextColor={colors.textTertiary}
            value={passengerNote}
            onChangeText={setPassengerNote}
            multiline
          />

          {/* ── Pricing Info ── */}
          <View style={styles.pricingInfo}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.pricingText}>
              Fare: £1.10/mile + £0.20/min. Final cost calculated at trip end.
            </Text>
          </View>

          {/* ── Submit ── */}
          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && { opacity: 0.6 }]}
            onPress={handleCalculatePreview}
            disabled={isSubmitting || calculatingEstimate}
            activeOpacity={0.7}
          >
            {calculatingEstimate ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : isSubmitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.submitBtnText}>Calculate Route & Price</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Route & fare preview */}
      <Modal
        visible={showPreviewModal}
        animationType="slide"
        transparent={false}
      >
        <View style={styles.modalContainer}>
          {/* Map Background */}
          <AmazonMap
            pickupLat={pickupCoords?.lat ?? 51.5074}
            pickupLng={pickupCoords?.lng ?? -0.1278}
            destinationLat={destinationCoords?.lat ?? 51.515}
            destinationLng={destinationCoords?.lng ?? -0.12}
          />

          <View style={styles.matchCard}>
            <View style={styles.matchCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="car" size={16} color={colors.electricTeal} />
                <Text style={styles.matchCardTitle}>
                  {targetName ? `${taxiType || 'Taxi'} · ${targetName}` : 'Gleezip Taxi'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPreviewModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <Text style={styles.matchPrice}>£{estimatedCost.toFixed(2)}</Text>
            </View>

            <View style={styles.feeBadge}>
              <Text style={styles.feeText}>£0.77 est. holiday entitlement included</Text>
            </View>

            <View style={styles.matchRoute}>
              <View style={styles.matchRouteItem}>
                <View style={[styles.matchNode, { borderColor: '#10B981' }]} />
                <Text style={styles.matchRouteText} numberOfLines={1}>
                  {pickupAddress || pickupPostcode || 'Current Location'}
                </Text>
              </View>

              <View style={styles.matchRouteLine} />

              <View style={styles.matchRouteItem}>
                <View style={[styles.matchNode, { backgroundColor: '#EF4444', borderColor: '#EF4444' }]} />
                <Text style={styles.matchRouteText} numberOfLines={2}>
                  {estimatedDuration} mins ({estimatedMiles.toFixed(1)} mi){'\n'}
                  {destinationAddress || destinationPostcode}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.matchBtn, isSubmitting && { opacity: 0.6 }]}
              onPress={confirmAndRequest}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.matchBtnText}>{targetName ? 'Match' : 'Confirm & Request'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  // Sections
  sectionLabel: {
    color: colors.textPrimary, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.sm,
  },

  // GPS
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

  // Input
  input: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, color: colors.textPrimary, fontSize: FONT_SIZES.label,
    borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.sm,
  },

  // Timing
  timingRow: {
    flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  timingOption: {
    flex: 1, paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', backgroundColor: colors.surface,
  },
  timingOptionActive: {
    borderColor: colors.electricTeal, backgroundColor: `${colors.electricTeal}10`,
  },
  timingText: {
    color: colors.textSecondary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium,
  },
  timingTextActive: { color: colors.electricTeal, fontWeight: FONT_WEIGHTS.bold },

  // Time display
  timeDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: colors.border,
  },
  timeDisplayText: {
    flex: 1, color: colors.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium,
  },
  timeChangeText: {
    color: colors.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.semibold,
  },

  // Pricing
  pricingInfo: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.lg,
  },
  pricingText: {
    flex: 1, color: colors.textSecondary, fontSize: FONT_SIZES.small, lineHeight: 18,
  },

  // Submit
  submitBtn: {
    backgroundColor: colors.electricTeal, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold,
  },

  // ── Active Request View ──
  statusCard: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  statusTitle: {
    color: colors.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center', marginBottom: SPACING.sm,
  },
  statusDesc: {
    color: colors.textSecondary, fontSize: 14, textAlign: 'center',
  },

  driverCard: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  driverNumber: {
    color: colors.textSecondary, fontSize: FONT_SIZES.small, marginBottom: SPACING.sm,
  },
  vehicleRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  vehicleText: {
    color: colors.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.medium,
  },
  plateBadge: {
    alignSelf: 'flex-start', backgroundColor: '#FEF3C7',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: '#FDE68A',
  },
  plateText: {
    color: colors.textPrimary, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold, letterSpacing: 1,
  },

  tripSummary: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  tripRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
  },
  tripDivider: {
    width: 2, height: 20, backgroundColor: colors.border,
    marginLeft: 7, marginVertical: 4,
  },
  tripText: {
    color: colors.textPrimary, fontSize: FONT_SIZES.label, flex: 1,
  },
  costRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: SPACING.md, paddingTop: SPACING.md,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
  costLabel: { color: colors.textSecondary, fontSize: FONT_SIZES.label },
  costValue: { color: colors.electricTeal, fontSize: 18, fontWeight: FONT_WEIGHTS.bold },

  cancelBtn: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.error,
  },
  cancelBtnText: { color: colors.error, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },

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

  // Fare preview card (light Gleezip chrome over map)
  modalContainer: { flex: 1, backgroundColor: '#E8EEF5' },
  matchCard: {
    position: 'absolute', bottom: 20, left: 16, right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 12,
  },
  matchCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchCardTitle: { color: '#6B7280', fontSize: 15, fontWeight: 'bold' as any },
  closeBtn: { padding: 4 },
  matchPrice: { color: '#111827', fontSize: 44, fontWeight: 'bold' as any, letterSpacing: -1 },
  feeBadge: { backgroundColor: '#F3F4F6', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginTop: 12, marginBottom: 20 },
  feeText: { color: '#6B7280', fontSize: 12, fontWeight: 'bold' as any },
  matchRoute: { marginBottom: 24, paddingLeft: 4 },
  matchRouteItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  matchNode: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'transparent', borderWidth: 2, borderColor: '#111827', marginTop: 6 },
  matchRouteText: { color: '#111827', fontSize: 14, fontWeight: '500' as any, lineHeight: 20, flex: 1 },
  matchRouteLine: { width: 2, height: 24, backgroundColor: '#D1D5DB', marginLeft: 3, marginVertical: 4 },

  matchBtn: { backgroundColor: colors.electricTeal || '#00C2A8', paddingVertical: 18, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  matchBtnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' as any },

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
