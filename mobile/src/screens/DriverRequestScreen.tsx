import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { bookingsApi } from '@/api';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';

export function DriverRequestScreen() {
  const navigation = useNavigation<NavigationProp<any>>();

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
          'Your driver request has been sent. It will appear in your Bookings as "Pending" until a driver accepts.',
          [{ text: 'View Bookings', onPress: () => navigation.navigate('ConsumerTabs', { screen: 'Bookings' }) }],
        );
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to submit request');
      }
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || error?.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [pickupAddress, pickupPostcode, pickupCoords, startTime, endTime, notes, navigation]);

  const durationHours = Math.max(0, (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60));

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Request a Driver</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── Location ── */}
          <Text style={styles.sectionLabel}>Start Location</Text>

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
              {usingGps ? '📍 Using GPS Location' : 'Use My Current Location'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.orText}>— or enter manually —</Text>

          <TextInput
            style={styles.input}
            placeholder="Address"
            placeholderTextColor={COLORS.textTertiary}
            value={pickupAddress}
            onChangeText={(t) => { setPickupAddress(t); setUsingGps(false); }}
          />
          <TextInput
            style={styles.input}
            placeholder="Postcode (e.g. SW1A 1AA)"
            placeholderTextColor={COLORS.textTertiary}
            value={pickupPostcode}
            onChangeText={(t) => { setPickupPostcode(t.toUpperCase()); setUsingGps(false); }}
            autoCapitalize="characters"
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
              <Ionicons name="time-outline" size={20} color={COLORS.success} />
              <Text style={styles.timeLabel}>Start Time</Text>
            </View>
            <Text style={styles.timeValue}>
              {startTime.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>

          {showStartPicker && (
            <DateTimePicker
              value={startTime}
              mode="datetime"
              is24Hour={true}
              minimumDate={new Date()}
              onChange={(_, selected) => {
                setShowStartPicker(false);
                if (selected) setStartTime(selected);
              }}
            />
          )}

          {/* End Time */}
          <TouchableOpacity
            style={styles.timeField}
            onPress={() => setShowEndPicker(true)}
            activeOpacity={0.7}
          >
            <View style={styles.timeIconRow}>
              <Ionicons name="time-outline" size={20} color={COLORS.error} />
              <Text style={styles.timeLabel}>End Time</Text>
            </View>
            <Text style={styles.timeValue}>
              {endTime.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>

          {showEndPicker && (
            <DateTimePicker
              value={endTime}
              mode="datetime"
              is24Hour={true}
              minimumDate={startTime}
              onChange={(_, selected) => {
                setShowEndPicker(false);
                if (selected) setEndTime(selected);
              }}
            />
          )}

          {/* Duration Summary */}
          <View style={styles.durationSummary}>
            <Ionicons name="hourglass-outline" size={18} color={COLORS.electricTeal} />
            <Text style={styles.durationText}>
              Duration: {durationHours.toFixed(1)} hour{durationHours !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* ── Notes ── */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
            placeholder="Any special instructions or requirements..."
            placeholderTextColor={COLORS.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          {/* ── Pricing Info ── */}
          <View style={styles.pricingInfo}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.textSecondary} />
            <Text style={styles.pricingText}>
              Rate: £1.10/mile. Your request will appear in Bookings as "Pending" until a driver accepts.
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
  sectionLabel: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.sm,
  },
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
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, color: COLORS.textPrimary, fontSize: FONT_SIZES.label,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm,
  },
  timeField: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  timeIconRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4,
  },
  timeLabel: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium,
  },
  timeValue: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold,
  },
  durationSummary: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: `${COLORS.electricTeal}10`, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginTop: SPACING.xs,
  },
  durationText: {
    color: COLORS.electricTeal, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.semibold,
  },
  pricingInfo: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginTop: SPACING.lg, marginBottom: SPACING.lg,
  },
  pricingText: {
    flex: 1, color: COLORS.textSecondary, fontSize: FONT_SIZES.small, lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: COLORS.info, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold,
  },
});
