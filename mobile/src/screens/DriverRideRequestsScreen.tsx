import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, TextInput,
  RefreshControl,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { taxiBookingsApi } from '@/api';

export function DriverRideRequestsScreen() {
  const navigation = useNavigation<NavigationProp<any>>();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Accept form state
  const [showAcceptForm, setShowAcceptForm] = useState<string | null>(null);
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [etaMinutes, setEtaMinutes] = useState('');

  const fetchRequests = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await taxiBookingsApi.getAvailable();
      if (res.data?.success) {
        setRequests(res.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch ride requests:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
      // Poll every 10 seconds for new requests
      const interval = setInterval(() => fetchRequests(), 10000);
      return () => clearInterval(interval);
    }, [])
  );

  const handleAccept = async (requestId: string) => {
    if (!etaMinutes || isNaN(Number(etaMinutes))) {
      Alert.alert('ETA Required', 'Please enter your estimated arrival time in minutes.');
      return;
    }

    setAcceptingId(requestId);

    try {
      const res = await taxiBookingsApi.acceptRequest(requestId, {
        vehicleMake: vehicleMake || undefined,
        vehicleModel: vehicleModel || undefined,
        vehicleColor: vehicleColor || undefined,
        plateNumber: plateNumber || undefined,
        etaMinutes: Number(etaMinutes),
      });

      if (res.data?.success) {
        Alert.alert('✅ Ride Accepted!', 'The passenger has been notified. Head to the pickup location.');
        setShowAcceptForm(null);
        // Navigate straight to the active journey tracker!
        navigation.navigate('ProviderActiveJourney', {
          requestId: requestId,
          serviceType: 'taxi' // or 'driver', but let's assume it maps properly
        });
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to accept ride');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to accept';
      Alert.alert('Error', msg);
    } finally {
      setAcceptingId(null);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const getTimingLabel = (req: any) => {
    if (req.timingType === 'now') return '🕐 Now';
    if (req.timingType === 'leave_at') return `🚶 Leave at ${formatTime(req.scheduledTime)}`;
    return `📍 Arrive by ${formatTime(req.scheduledTime)}`;
  };

  const renderRequest = (req: any) => {
    const passenger = req.passenger || {};
    const isExpanded = showAcceptForm === req._id;

    return (
      <View key={req._id} style={styles.requestCard}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.passengerName}>
              {passenger.firstName} {passenger.lastName}
            </Text>
            <Text style={styles.timingBadge}>{getTimingLabel(req)}</Text>
          </View>
          {req.estimatedCost && (
            <Text style={styles.estimatedCost}>~£{req.estimatedCost.toFixed(2)}</Text>
          )}
        </View>

        {/* Route */}
        <View style={styles.routeSection}>
          <View style={styles.routeRow}>
            <Ionicons name="radio-button-on" size={14} color={COLORS.success} />
            <Text style={styles.routeText} numberOfLines={1}>
              {req.pickupAddress || req.pickupPostcode || 'GPS Location'}
            </Text>
          </View>
          <View style={styles.routeDivider} />
          <View style={styles.routeRow}>
            <Ionicons name="location" size={14} color={COLORS.error} />
            <Text style={styles.routeText} numberOfLines={1}>
              {req.destinationAddress || req.destinationPostcode}
            </Text>
          </View>
        </View>

        {/* Passenger note */}
        {req.passengerNote && (
          <View style={styles.noteRow}>
            <Ionicons name="chatbubble-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.noteText}>{req.passengerNote}</Text>
          </View>
        )}

        {/* Distance & time */}
        <View style={styles.metaRow}>
          {req.estimatedDistanceMiles && (
            <View style={styles.metaBadge}>
              <Text style={styles.metaText}>
                {req.estimatedDistanceMiles.toFixed(1)} miles
              </Text>
            </View>
          )}
          {req.estimatedDurationMinutes && (
            <View style={styles.metaBadge}>
              <Text style={styles.metaText}>
                ~{Math.round(req.estimatedDurationMinutes)} min
              </Text>
            </View>
          )}
          <Text style={styles.timeAgo}>
            {new Date(req.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        {/* Accept button / form */}
        {!isExpanded ? (
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={() => setShowAcceptForm(req._id)}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={styles.acceptBtnText}>Accept Ride</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.acceptForm}>
            <Text style={styles.formTitle}>Your Vehicle Details</Text>

            <View style={styles.formRow}>
              <TextInput
                style={[styles.formInput, { flex: 1 }]}
                placeholder="Make (e.g. Toyota)"
                placeholderTextColor={COLORS.textTertiary}
                value={vehicleMake}
                onChangeText={setVehicleMake}
              />
              <TextInput
                style={[styles.formInput, { flex: 1 }]}
                placeholder="Model (e.g. Prius)"
                placeholderTextColor={COLORS.textTertiary}
                value={vehicleModel}
                onChangeText={setVehicleModel}
              />
            </View>

            <View style={styles.formRow}>
              <TextInput
                style={[styles.formInput, { flex: 1 }]}
                placeholder="Color (e.g. Silver)"
                placeholderTextColor={COLORS.textTertiary}
                value={vehicleColor}
                onChangeText={setVehicleColor}
              />
              <TextInput
                style={[styles.formInput, { flex: 1 }]}
                placeholder="Plate Number"
                placeholderTextColor={COLORS.textTertiary}
                value={plateNumber}
                onChangeText={(t) => setPlateNumber(t.toUpperCase())}
                autoCapitalize="characters"
              />
            </View>

            <TextInput
              style={styles.formInput}
              placeholder="ETA in minutes (e.g. 5) *"
              placeholderTextColor={COLORS.textTertiary}
              value={etaMinutes}
              onChangeText={setEtaMinutes}
              keyboardType="numeric"
            />

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.formCancelBtn}
                onPress={() => setShowAcceptForm(null)}
              >
                <Text style={styles.formCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formSubmitBtn, acceptingId === req._id && { opacity: 0.6 }]}
                onPress={() => handleAccept(req._id)}
                disabled={acceptingId === req._id}
              >
                {acceptingId === req._id ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.formSubmitText}>Confirm & Accept</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ride Requests</Text>
          <View style={{ width: 32 }} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={COLORS.electricTeal} />
            <Text style={styles.loadingText}>Loading ride requests...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => fetchRequests(true)} tintColor={COLORS.electricTeal} />
            }
          >
            {requests.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="car-outline" size={64} color={COLORS.textTertiary} />
                <Text style={styles.emptyTitle}>No Ride Requests</Text>
                <Text style={styles.emptyDesc}>
                  No passengers are looking for a ride right now. Stay online and check back.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.countBadge}>
                  <View style={styles.countDot} />
                  <Text style={styles.countText}>{requests.length} active request{requests.length > 1 ? 's' : ''}</Text>
                </View>
                {requests.map(renderRequest)}
              </>
            )}
          </ScrollView>
        )}
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

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: SPACING.md },

  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },

  // Count badge
  countBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  countDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.success,
  },
  countText: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium,
  },

  // Request card
  requestCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  passengerName: {
    color: COLORS.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold,
  },
  timingBadge: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 4,
  },
  estimatedCost: {
    color: COLORS.electricTeal, fontSize: 18, fontWeight: FONT_WEIGHTS.bold,
  },

  // Route
  routeSection: {
    backgroundColor: COLORS.surfaceAlt, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  routeDivider: {
    width: 2, height: 16, backgroundColor: COLORS.border, marginLeft: 6, marginVertical: 2,
  },
  routeText: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.label, flex: 1,
  },

  // Note
  noteRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  noteText: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, fontStyle: 'italic', flex: 1,
  },

  // Meta
  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  metaBadge: {
    backgroundColor: COLORS.surfaceAlt, paddingHorizontal: SPACING.sm, paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  metaText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: FONT_WEIGHTS.medium },
  timeAgo: { color: COLORS.textTertiary, fontSize: 11, marginLeft: 'auto' },

  // Accept button
  acceptBtn: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', gap: SPACING.sm,
  },
  acceptBtnText: { color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },

  // Accept form
  acceptForm: {
    backgroundColor: COLORS.surfaceAlt, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  formTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.sm,
  },
  formRow: { flexDirection: 'row', gap: SPACING.sm },
  formInput: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: COLORS.textPrimary, fontSize: FONT_SIZES.label,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm,
  },
  formActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  formCancelBtn: {
    flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  formCancelText: { color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.semibold },
  formSubmitBtn: {
    flex: 2, backgroundColor: COLORS.electricTeal, paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md, alignItems: 'center',
  },
  formSubmitText: { color: '#FFF', fontWeight: FONT_WEIGHTS.bold },

  // Empty state
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyTitle: {
    color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },
  emptyDesc: {
    color: COLORS.textSecondary, fontSize: 14, textAlign: 'center',
    maxWidth: '80%', lineHeight: 20,
  },
});
