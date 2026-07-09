import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Alert, Platform, Linking, Animated,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { taxiBookingsApi, ridesApi } from '@/api';
import { AmazonMap } from '@/components/AmazonMap';
import { useTaxiStore } from '@/store/taxiStore';
import { useAuthStore } from '@/store/authStore';
import { RatingModal } from '@/components/RatingModal';
import { useRideRouteAndEta } from '@/hooks/useRideRouteAndEta';
import { getApiErrorMessage } from '@/utils/helpers';
import { canCancelRide, getCancelRideMessage } from '@/utils/cancellation';

type ParamList = {
  PassengerTracking: { requestId: string };
};

export function PassengerTrackingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'PassengerTracking'>>();
  const { requestId } = route.params;

  const [loading, setLoading] = useState(true);
  const [showRating, setShowRating] = useState(false);
  const [ratingDismissed, setRatingDismissed] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  
  const { user } = useAuthStore();
  const {
    connect,
    disconnect,
    joinRide,
    leaveRide,
    activeRequest,
    driverLocation,
    setActiveRequest,
  } = useTaxiStore();

  const request = activeRequest;
  const { routeCoordinates, etaLabel } = useRideRouteAndEta(request, driverLocation);

  const fetchRequest = async () => {
    try {
      const res = await taxiBookingsApi.getRequest(requestId);
      if (res.data?.success) {
        setActiveRequest(res.data.data);
      }
    } catch (err) {
      console.log('Failed to fetch request:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequest();

    // Setup real-time Socket.io booking connection
    if (user) {
      const userId = user._id || (user as any).id;
      connect(userId);
      joinRide(requestId);
    }

    return () => {
      leaveRide(requestId);
    };
  }, [requestId, user]);

  // Keep a long fallback polling interval (30s) just in case of network drops
  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(fetchRequest, 30000);
      return () => clearInterval(interval);
    }, [requestId])
  );

  useEffect(() => {
    if (
      request?.status === 'completed' &&
      !ratingDismissed &&
      request.acceptedDriver?._id
    ) {
      setShowRating(true);
    }
  }, [request?.status, request?.acceptedDriver?._id, ratingDismissed]);

  // Pulsing animation for live status
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (request?.status === 'accepted' || request?.status === 'in_progress') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [request?.status]);

  const driver = request?.acceptedDriver;
  const driverId = driver?._id || driver?.id;
  const driverName = driver
    ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || 'Your driver'
    : 'Your driver';
  const linkedRide = request?.ride;
  const rideRecordId = typeof linkedRide === 'object' ? linkedRide?._id : linkedRide;
  const rideFare =
    typeof linkedRide === 'object' && linkedRide?.totalCost != null
      ? linkedRide.totalCost
      : request?.estimatedCost || 0;

  const handleConfirmArrival = async () => {
    if (!rideRecordId) {
      Alert.alert('Error', 'Ride details are not ready yet. Please try again shortly.');
      return;
    }
    try {
      const res = await ridesApi.confirmArrival(String(rideRecordId));
      if (res.data?.success) {
        Alert.alert('Location Confirmed', res.data.message || 'You can now complete payment.');
        fetchRequest();
      } else {
        Alert.alert('Error', res.data?.message || 'Could not confirm your location');
      }
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err, 'Could not confirm your location'));
    }
  };

  const handlePayRide = () => {
    if (!rideRecordId) {
      Alert.alert('Error', 'Ride details are not ready yet. Please try again shortly.');
      return;
    }
    if (!request?.passengerConfirmedAt) {
      Alert.alert(
        'Confirm Your Location',
        'Please confirm you are at your destination before paying.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm Location', onPress: handleConfirmArrival },
        ],
      );
      return;
    }

    Alert.alert(
      'Confirm Payment',
      `Pay £${rideFare.toFixed(2)} for your taxi ride?\n\nThis will be charged to your saved card.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            setPayLoading(true);
            try {
              const res = await ridesApi.payRide(String(rideRecordId));
              if (res.data?.success) {
                await fetchRequest();
                Alert.alert(
                  'Payment Successful',
                  res.data.message || 'Your payment has been processed. Receipt is available.',
                  [
                    {
                      text: 'View Receipt',
                      onPress: () => navigation.navigate('TripReceipt', {
                        requestId,
                        rideId: String(rideRecordId),
                      }),
                    },
                    { text: 'OK' },
                  ],
                );
              } else {
                Alert.alert('Payment Failed', res.data?.message || 'Could not process payment.');
              }
            } catch (err) {
              Alert.alert('Payment Failed', getApiErrorMessage(err, 'Could not process payment.'));
            } finally {
              setPayLoading(false);
            }
          },
        },
      ],
    );
  };

  const getStatusText = () => {
    if (!request) return '';
    switch (request.status) {
      case 'accepted': return '🚗 Driver is on the way';
      case 'arrived': return '📍 Driver has arrived';
      case 'in_progress': return '🛣️ Ride in progress';
      case 'awaiting_payment': return '💳 Confirm location and pay';
      case 'completed': return '✅ Ride completed';
      default: return '🔍 Finding a driver...';
    }
  };

  const getStatusColor = () => {
    if (!request) return COLORS.textSecondary;
    switch (request.status) {
      case 'accepted': return COLORS.info;
      case 'arrived': return COLORS.amber;
      case 'in_progress': return COLORS.success;
      case 'awaiting_payment': return COLORS.amber;
      case 'completed': return COLORS.electricTeal;
      default: return COLORS.textSecondary;
    }
  };

  const callDriver = () => {
    // If we have the driver's phone, use it
    if (request?.acceptedDriver?.phoneNumber) {
      Linking.openURL(`tel:${request.acceptedDriver.phoneNumber}`);
    } else {
      Alert.alert('Unavailable', 'Driver contact is not available yet.');
    }
  };

  const handleCancelRide = () => {
    Alert.alert(
      'Cancel Ride',
      getCancelRideMessage(request.status),
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await taxiBookingsApi.cancelRequest(requestId);
              if (res.data?.success) {
                Alert.alert('Cancelled', res.data.message || 'Your ride request has been cancelled');
                navigation.goBack();
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to cancel');
              }
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.message || 'Failed to cancel ride');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={{ color: COLORS.textPrimary }}>Ride request not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Live Map */}
      <View style={styles.mapContainer}>
        <AmazonMap
          pickupLat={request.pickupLat}
          pickupLng={request.pickupLng}
          destinationLat={request.destinationLat}
          destinationLng={request.destinationLng}
          driverLat={driverLocation?.lat}
          driverLng={driverLocation?.lng}
          driverRotation={driverLocation?.rotation}
          routeCoordinates={routeCoordinates}
        />
      </View>

      {/* Bottom Details Sheet */}
      <View style={styles.detailsSheet}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: `${getStatusColor()}15` }]}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
        </View>

        {/* Driver Info */}
        {request.acceptedDriver && (
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverAvatarText}>
                {(request.acceptedDriver.firstName?.[0] || '?').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>
                {request.acceptedDriver.firstName} {request.acceptedDriver.lastName}
              </Text>
              {request.driverVehicle && (
                <Text style={styles.vehicleText}>
                  {request.driverVehicle.color} {request.driverVehicle.make} {request.driverVehicle.model}
                  {request.driverVehicle.plateNumber ? ` • ${request.driverVehicle.plateNumber}` : ''}
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={callDriver}>
              <Ionicons name="call" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Route */}
        <View style={styles.routeBox}>
          <View style={styles.routeRow}>
            <Ionicons name="radio-button-on" size={14} color={COLORS.success} />
            <Text style={styles.routeText} numberOfLines={1}>
              {request.pickupAddress || request.pickupPostcode || 'GPS Pickup'}
            </Text>
          </View>
          <View style={styles.routeDivider} />
          <View style={styles.routeRow}>
            <Ionicons name="location" size={14} color={COLORS.error} />
            <Text style={styles.routeText} numberOfLines={1}>
              {request.destinationAddress || request.destinationPostcode}
            </Text>
          </View>
        </View>

        {/* Live ETA / Cost */}
        <View style={styles.infoRow}>
          {etaLabel && ['accepted', 'arrived', 'in_progress'].includes(request.status) && (
            <View style={styles.etaChip}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <View style={styles.liveDot} />
              </Animated.View>
              <Ionicons name="time-outline" size={16} color={COLORS.electricTeal} />
              <Text style={styles.etaChipText}>{etaLabel}</Text>
            </View>
          )}
          {request.estimatedCost && (
            <View style={styles.infoChip}>
              <Ionicons name="cash-outline" size={16} color={COLORS.electricTeal} />
              <Text style={styles.infoChipText}>Est: £{request.estimatedCost.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Live tracking indicator */}
        {driverLocation && ['accepted', 'in_progress'].includes(request.status) && (
          <View style={styles.liveTrackingBar}>
            <Animated.View style={[styles.liveIndicator, { opacity: pulseAnim }]}>
              <View style={styles.liveDotSmall} />
              <Text style={styles.liveText}>LIVE</Text>
            </Animated.View>
            <Text style={styles.liveSubtext}>
              {request.status === 'accepted' ? 'Tracking driver to you' : 'Tracking your ride'}
            </Text>
          </View>
        )}

        {request.status === 'awaiting_payment' && (
          <>
            {!request.passengerConfirmedAt ? (
              <TouchableOpacity style={styles.receiptBtn} onPress={handleConfirmArrival}>
                <Ionicons name="location-outline" size={18} color={COLORS.electricTeal} />
                <Text style={styles.receiptBtnText}>I'm at my destination</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.receiptBtn, { backgroundColor: COLORS.electricTeal }]}
                onPress={handlePayRide}
                disabled={payLoading}
              >
                {payLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={18} color="#FFF" />
                    <Text style={[styles.receiptBtnText, { color: '#FFF' }]}>
                      Pay £{rideFare.toFixed(2)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {request.status === 'completed' && rideRecordId && (
          <TouchableOpacity
            style={styles.receiptBtn}
            onPress={() => navigation.navigate('TripReceipt', { requestId, rideId: String(rideRecordId) })}
          >
            <Ionicons name="receipt-outline" size={18} color={COLORS.electricTeal} />
            <Text style={styles.receiptBtnText}>View trip receipt</Text>
          </TouchableOpacity>
        )}

        {/* Buttons */}
        <View style={{ flexDirection: 'row', gap: SPACING.md }}>
          <TouchableOpacity
            style={[styles.backButton, { flex: 1 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Close</Text>
          </TouchableOpacity>

          {canCancelRide(request.status) && (
            <TouchableOpacity
              style={[styles.backButton, { flex: 1, borderColor: COLORS.coralRed }]}
              onPress={handleCancelRide}
            >
              <Text style={[styles.backButtonText, { color: COLORS.coralRed }]}>Cancel Ride</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {driverId && (
        <RatingModal
          visible={showRating}
          onClose={() => {
            setShowRating(false);
            setRatingDismissed(true);
          }}
          subjectName={driverName}
          subjectId={driverId}
          bookingId={requestId}
          serviceType="taxi"
          title="Rate Your Ride"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapContainer: { flex: 1, backgroundColor: '#E2E8F0' },

  detailsSheet: {
    backgroundColor: COLORS.surface,
    padding: SPACING.xl,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 12,
  },
  statusBanner: {
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg, alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  statusText: {
    fontSize: 16, fontWeight: FONT_WEIGHTS.bold,
  },

  driverRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg,
  },
  driverAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: `${COLORS.electricTeal}18`,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  driverAvatarText: {
    color: COLORS.electricTeal, fontSize: 18, fontWeight: FONT_WEIGHTS.bold,
  },
  driverName: {
    color: COLORS.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold,
  },
  vehicleText: {
    color: COLORS.textSecondary, fontSize: 13, marginTop: 2,
  },
  callBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.success,
    justifyContent: 'center', alignItems: 'center',
  },

  routeBox: {
    backgroundColor: COLORS.background, padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  routeDivider: {
    width: 2, height: 14, backgroundColor: COLORS.border,
    marginVertical: 3, marginLeft: 6,
  },
  routeText: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },

  infoRow: {
    flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md,
  },
  etaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${COLORS.electricTeal}15`,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: `${COLORS.electricTeal}30`,
  },
  etaChipText: {
    color: COLORS.electricTeal, fontSize: 15, fontWeight: FONT_WEIGHTS.bold,
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#10B981',
  },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${COLORS.electricTeal}10`,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: 20,
  },
  infoChipText: {
    color: COLORS.electricTeal, fontSize: 13, fontWeight: FONT_WEIGHTS.semibold,
  },
  liveTrackingBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, marginBottom: SPACING.md,
  },
  liveIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#10B98118',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  liveDotSmall: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981',
  },
  liveText: {
    color: '#10B981', fontSize: 10, fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 1,
  },
  liveSubtext: {
    color: COLORS.textSecondary, fontSize: 12,
  },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.electricTeal,
    backgroundColor: `${COLORS.electricTeal}10`,
  },
  receiptBtnText: {
    color: COLORS.electricTeal,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  backButton: {
    alignItems: 'center', paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
  },
  backButtonText: {
    color: COLORS.textPrimary, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold,
  },
});
