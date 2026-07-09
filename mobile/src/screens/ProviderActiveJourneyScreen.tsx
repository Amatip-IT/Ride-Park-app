import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { taxiBookingsApi, ridesApi } from '@/api';
import { AmazonMap } from '@/components/AmazonMap';
import * as Location from 'expo-location';
import { useTaxiStore } from '@/store/taxiStore';
import { useAuthStore } from '@/store/authStore';
import {
  getApiErrorMessage,
  haversineDistanceMiles,
  openMapsNavigation,
} from '@/utils/helpers';
import { useRideRouteAndEta } from '@/hooks/useRideRouteAndEta';

type JourneyState = 'accepted' | 'arrived' | 'in_progress' | 'awaiting_payment' | 'completed';

type ParamList = {
  ProviderActiveJourney: {
    requestId: string;
    serviceType: 'driver' | 'taxi';
  };
};

function mapRequestStatusToJourney(status?: string): JourneyState {
  switch (status) {
    case 'arrived':
      return 'arrived';
    case 'in_progress':
      return 'in_progress';
    case 'awaiting_payment':
      return 'awaiting_payment';
    case 'completed':
      return 'completed';
    default:
      return 'accepted';
  }
}

export function ProviderActiveJourneyScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'ProviderActiveJourney'>>();
  const { requestId, serviceType } = route.params;

  const [requestItem, setRequestItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [journeyState, setJourneyState] = useState<JourneyState>('accepted');
  const [rideId, setRideId] = useState<string | null>(null);

  const rideStartedAtRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const accumulatedMilesRef = useRef(0);

  const { user } = useAuthStore();
  const { connect, joinRide, leaveRide, updateDriverLocation, driverLocation } = useTaxiStore();
  const { routeCoordinates, etaLabel } = useRideRouteAndEta(requestItem, driverLocation);

  const applyRequestData = useCallback((data: any) => {
    setRequestItem(data);
    if (data?.status) {
      setJourneyState(mapRequestStatusToJourney(data.status));
    }
    const linkedRide = data?.ride?._id || data?.ride;
    if (linkedRide) {
      setRideId(String(linkedRide));
    }
    if (data?.status === 'in_progress' && !rideStartedAtRef.current) {
      rideStartedAtRef.current = data.updatedAt
        ? new Date(data.updatedAt).getTime()
        : Date.now();
    }
  }, []);

  const fetchRequest = async () => {
    try {
      const res = await taxiBookingsApi.getRequest(requestId);
      if (res.data?.success) {
        applyRequestData(res.data.data);
      }
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to load trip details.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequest();
  }, [requestId]);

  const trackLocation = ['accepted', 'arrived', 'in_progress'].includes(journeyState);

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Location required', 'Enable location to share your position with the passenger.');
          return;
        }

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 5,
          },
          (location) => {
            const { latitude, longitude, heading } = location.coords;
            const driverId = user?._id || (user as any)?.id;

            // Use device heading if available; otherwise compute bearing from last position
            let bearing = heading > 0 ? heading : 0;
            const last = lastPositionRef.current;
            if (bearing <= 0 && last) {
              const dLng = longitude - last.lng;
              const y = Math.sin(dLng * Math.PI / 180) * Math.cos(latitude * Math.PI / 180);
              const x = Math.cos(last.lat * Math.PI / 180) * Math.sin(latitude * Math.PI / 180)
                - Math.sin(last.lat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) * Math.cos(dLng * Math.PI / 180);
              bearing = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
            }

            if (driverId && requestId) {
              updateDriverLocation(requestId, driverId, latitude, longitude, bearing);
            }

            if (journeyState === 'in_progress') {
              if (last) {
                accumulatedMilesRef.current += haversineDistanceMiles(
                  last.lat,
                  last.lng,
                  latitude,
                  longitude,
                );
              }
              lastPositionRef.current = { lat: latitude, lng: longitude };
            } else {
              lastPositionRef.current = { lat: latitude, lng: longitude };
            }
          },
        );
      } catch (err) {
        console.error('Error starting location watcher:', err);
      }
    };

    if (user && trackLocation) {
      const userId = user._id || (user as any).id;
      connect(userId);
      joinRide(requestId);
      startWatching();
    }

    return () => {
      locationSubscription?.remove();
      leaveRide(requestId);
    };
  }, [requestId, user, journeyState, trackLocation]);

  const resolveTripMetrics = () => {
    const estimatedMiles = requestItem?.estimatedDistanceMiles || 5;
    const estimatedMins = requestItem.estimatedDurationMinutes || 15;

    let distanceMiles = accumulatedMilesRef.current;
    if (distanceMiles < 0.1 && requestItem?.pickupLat && requestItem?.destinationLat) {
      distanceMiles = haversineDistanceMiles(
        requestItem.pickupLat,
        requestItem.pickupLng,
        requestItem.destinationLat,
        requestItem.destinationLng,
      );
    }
    if (distanceMiles < 0.1) {
      distanceMiles = estimatedMiles;
    }

    let durationMinutes = estimatedMins;
    if (rideStartedAtRef.current) {
      durationMinutes = Math.max(
        1,
        Math.ceil((Date.now() - rideStartedAtRef.current) / 60000),
      );
    }

    return {
      distanceMiles: Math.round(distanceMiles * 100) / 100,
      durationMinutes,
    };
  };

  const handleAction = async () => {
    if (actionLoading) return;
    setActionLoading(true);

    try {
      if (journeyState === 'accepted') {
        const res = await taxiBookingsApi.updateStatus(requestId, 'arrived');
        if (res.data?.success) {
          applyRequestData(res.data.data);
          Alert.alert('Arrived', 'Passenger has been notified of your arrival.');
        } else {
          Alert.alert('Error', res.data?.message || 'Failed to update status');
        }
      } else if (journeyState === 'arrived') {
        const passengerId =
          requestItem.passenger?._id || requestItem.passenger;
        const driverId = user?._id || (user as any)?.id;

        if (!passengerId || !driverId) {
          Alert.alert('Error', 'Missing passenger or driver information.');
          return;
        }

        const res = await ridesApi.startRide({
          passengerId: String(passengerId),
          driverId: String(driverId),
          serviceType,
          bookingId: requestId,
          pickup: {
            address: requestItem.pickupAddress || requestItem.pickupPostcode,
            lat: requestItem.pickupLat,
            lng: requestItem.pickupLng,
          },
          dropoff: {
            address: requestItem.destinationAddress || requestItem.destinationPostcode,
            lat: requestItem.destinationLat,
            lng: requestItem.destinationLng,
          },
        });

        if (res.data?.success) {
          const newRideId = res.data.data._id;
          setRideId(newRideId);
          rideStartedAtRef.current = Date.now();
          lastPositionRef.current = null;
          accumulatedMilesRef.current = 0;

          const statusRes = await taxiBookingsApi.updateStatus(requestId, 'in_progress', newRideId);
          if (statusRes.data?.success) {
            applyRequestData(statusRes.data.data);
          } else {
            setJourneyState('in_progress');
          }
          Alert.alert('Ride started', 'Head to the destination. The passenger can track your trip.');
        } else {
          Alert.alert('Error', res.data?.message || 'Failed to start ride');
        }
      } else if (journeyState === 'in_progress') {
        if (!rideId) {
          Alert.alert('Error', 'Ride record not found. Please try again.');
          return;
        }

        const { distanceMiles, durationMinutes } = resolveTripMetrics();
        const res = await ridesApi.completeRide(rideId, distanceMiles, durationMinutes);

        if (res.data?.success) {
          const statusRes = await taxiBookingsApi.updateStatus(requestId, 'awaiting_payment', rideId);
          if (statusRes.data?.success) {
            applyRequestData(statusRes.data.data);
          } else {
            setJourneyState('awaiting_payment');
          }

          const total = res.data.data?.totalCost ?? 0;
          Alert.alert(
            'Trip ended',
            `Fare: £${total.toFixed(2)}. Waiting for the passenger to confirm their location and pay.`,
            [{ text: 'OK' }],
          );
        } else {
          Alert.alert('Error', res.data?.message || 'Failed to complete ride');
        }
      } else if (journeyState === 'completed') {
        navigation.navigate('ProviderTabs', { screen: 'ProviderHome' });
      }
    } catch (err: unknown) {
      Alert.alert('Error', getApiErrorMessage(err, 'An error occurred'));
    } finally {
      setActionLoading(false);
    }
  };

  const callPassenger = () => {
    const phone = requestItem?.passenger?.phoneNumber;
    if (phone) {
      Linking.openURL(`tel:${phone}`).catch(() => {
        Alert.alert('Could not call', 'Unable to open the phone app.');
      });
    } else {
      Alert.alert('Unavailable', 'Passenger phone number is not available.');
    }
  };

  const navigateToPickup = () => {
    openMapsNavigation({
      lat: requestItem?.pickupLat,
      lng: requestItem?.pickupLng,
      label: 'Pickup',
      address: [requestItem?.pickupAddress, requestItem?.pickupPostcode].filter(Boolean).join(', '),
    });
  };

  const navigateToDropoff = () => {
    openMapsNavigation({
      lat: requestItem?.destinationLat,
      lng: requestItem?.destinationLng,
      label: 'Drop-off',
      address: [requestItem?.destinationAddress, requestItem?.destinationPostcode].filter(Boolean).join(', '),
    });
  };

  const getActionText = () => {
    switch (journeyState) {
      case 'accepted':
        return 'I Have Arrived';
      case 'arrived':
        return 'Start Ride (Pick Up)';
      case 'in_progress':
        return 'Complete Ride';
      case 'awaiting_payment':
        return 'Waiting for Passenger Payment';
      case 'completed':
        return 'Finish & Return Home';
      default:
        return 'Continue';
    }
  };

  const getActionColor = () => {
    switch (journeyState) {
      case 'accepted':
        return COLORS.amber;
      case 'arrived':
        return COLORS.success;
      case 'in_progress':
        return COLORS.error;
      case 'awaiting_payment':
        return COLORS.amber;
      case 'completed':
        return COLORS.electricTeal;
      default:
        return COLORS.electricTeal;
    }
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

  if (!requestItem) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={{ color: COLORS.textPrimary }}>Request not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const navTarget =
    journeyState === 'in_progress' ? 'dropoff' : 'pickup';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.mapContainer}>
        <AmazonMap
          pickupLat={requestItem.pickupLat}
          pickupLng={requestItem.pickupLng}
          destinationLat={requestItem.destinationLat}
          destinationLng={requestItem.destinationLng}
          driverLat={driverLocation?.lat}
          driverLng={driverLocation?.lng}
          driverRotation={driverLocation?.rotation}
          routeCoordinates={routeCoordinates}
        />
      </View>

      <View style={styles.detailsContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.passengerStr}>
            {requestItem.passenger?.firstName} {requestItem.passenger?.lastName}
          </Text>
          <TouchableOpacity style={styles.callBtn} onPress={callPassenger} activeOpacity={0.8}>
            <Ionicons name="call" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.routeBox}>
          <TouchableOpacity style={styles.routeRow} onPress={navigateToPickup} activeOpacity={0.7}>
            <Ionicons name="radio-button-on" size={16} color={COLORS.success} />
            <Text style={styles.routeText} numberOfLines={2}>
              {requestItem.pickupAddress || requestItem.pickupPostcode || 'GPS Location'}
            </Text>
            <Ionicons name="navigate-outline" size={18} color={COLORS.electricTeal} />
          </TouchableOpacity>
          <View style={styles.routeDivider} />
          <TouchableOpacity style={styles.routeRow} onPress={navigateToDropoff} activeOpacity={0.7}>
            <Ionicons name="location" size={16} color={COLORS.error} />
            <Text style={styles.routeText} numberOfLines={2}>
              {requestItem.destinationAddress || requestItem.destinationPostcode}
            </Text>
            <Ionicons name="navigate-outline" size={18} color={COLORS.electricTeal} />
          </TouchableOpacity>
        </View>

        {etaLabel && journeyState !== 'completed' && (
          <View style={styles.etaBanner}>
            <Ionicons name="time-outline" size={18} color={COLORS.electricTeal} />
            <Text style={styles.etaText}>{etaLabel}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.navBtn}
          onPress={navTarget === 'dropoff' ? navigateToDropoff : navigateToPickup}
          activeOpacity={0.8}
        >
          <Ionicons name="navigate" size={20} color={COLORS.electricTeal} />
          <Text style={styles.navBtnText}>
            {navTarget === 'dropoff' ? 'Navigate to drop-off' : 'Navigate to pickup'}
          </Text>
        </TouchableOpacity>

        {journeyState === 'completed' && requestItem?.ride?.paymentStatus === 'charged' && (
          <TouchableOpacity
            style={styles.receiptBtn}
            onPress={() => navigation.navigate('TripReceipt', { requestId, rideId })}
            activeOpacity={0.8}
          >
            <Ionicons name="receipt-outline" size={18} color={COLORS.electricTeal} />
            <Text style={styles.receiptBtnText}>View trip receipt</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.mainBtn, { backgroundColor: getActionColor() }, actionLoading && { opacity: 0.7 }]}
          onPress={handleAction}
          disabled={actionLoading || journeyState === 'awaiting_payment'}
          activeOpacity={0.8}
        >
          {actionLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.mainBtnText}>{getActionText()}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapContainer: { flex: 1, backgroundColor: '#E2E8F0' },
  detailsContainer: {
    backgroundColor: COLORS.surface,
    padding: SPACING.xl,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  passengerStr: { fontSize: 22, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeBox: {
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  routeDivider: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.border,
    marginVertical: 4,
    marginLeft: 7,
  },
  routeText: { fontSize: FONT_SIZES.body, color: COLORS.textSecondary, flex: 1 },
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: `${COLORS.electricTeal}12`,
  },
  etaText: {
    color: COLORS.electricTeal,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
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
    fontWeight: FONT_WEIGHTS.bold,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.electricTeal,
    backgroundColor: `${COLORS.electricTeal}10`,
  },
  navBtnText: {
    color: COLORS.electricTeal,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.bold,
  },
  mainBtn: {
    paddingVertical: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  mainBtnText: { color: '#FFF', fontSize: 18, fontWeight: FONT_WEIGHTS.bold },
});
