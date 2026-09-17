import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
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
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'ProviderActiveJourney'>>();
  const { requestId, serviceType } = route.params;

  const [requestItem, setRequestItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [journeyState, setJourneyState] = useState<JourneyState>('accepted');
  const [rideId, setRideId] = useState<string | null>(null);
  const [mapFocusToken, setMapFocusToken] = useState(0);

  const rideStartedAtRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const accumulatedMilesRef = useRef(0);

  const { user } = useAuthStore();
  const {
    connect,
    joinRide,
    leaveRide,
    updateDriverLocation,
    driverLocation,
    activeRequest,
  } = useTaxiStore();
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

  const fetchRequest = async (showAlert = true) => {
    try {
      const res = await taxiBookingsApi.getRequest(requestId);
      if (res.data?.success) {
        applyRequestData(res.data.data);
        setFetchError(null);
      }
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to load trip details.');
      setFetchError(message);
      if (showAlert) Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequest();
  }, [requestId]);

  useEffect(() => {
    if (!user) return;
    const userId = user._id || (user as any).id;
    connect(userId);
    joinRide(requestId);
    return () => leaveRide(requestId);
  }, [connect, joinRide, leaveRide, requestId, user]);

  useEffect(() => {
    if (activeRequest?._id?.toString() === requestId) {
      applyRequestData(activeRequest);
      setFetchError(null);
    }
  }, [activeRequest, applyRequestData, requestId]);

  useEffect(() => {
    const interval = setInterval(() => fetchRequest(false), 15000);
    return () => clearInterval(interval);
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
            let bearing = heading != null && heading > 0 ? heading : 0;
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
      startWatching();
    }

    return () => {
      locationSubscription?.remove();
    };
  }, [requestId, user, journeyState, trackLocation, updateDriverLocation]);

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

  const messagePassenger = () => {
    const passenger = requestItem?.passenger;
    const passengerId = passenger?._id || passenger?.id;
    if (!passengerId) {
      Alert.alert('Unavailable', 'Passenger chat is not available yet.');
      return;
    }
    const name =
      `${passenger?.firstName || ''} ${passenger?.lastName || ''}`.trim() || 'Passenger';
    navigation.navigate('Chat', {
      userId: String(passengerId),
      userName: name,
      bookingId: requestId,
    });
  };

  /** Keep navigation inside the app map (blue route) — do not open Apple/Google Maps. */
  const focusInAppRoute = () => {
    setMapFocusToken((n) => n + 1);
  };

  const navigateToPickup = () => focusInAppRoute();
  const navigateToDropoff = () => focusInAppRoute();

  const getActionText = () => {
    switch (journeyState) {
      case 'accepted':
        return 'I Have Arrived';
      case 'arrived':
        return 'Start Ride (Pick Up)';
      case 'in_progress':
        return 'Complete Ride';
      case 'awaiting_payment':
        return requestItem?.ride?.paymentStatus === 'processing'
          ? 'Passenger Payment Processing'
          : requestItem?.ride?.paymentStatus === 'payment_failed'
            ? 'Passenger Retrying Payment'
            : 'Waiting for Passenger Payment';
      case 'completed':
        return 'Finish & Return Home';
      default:
        return 'Continue';
    }
  };

  const goHome = () => {
    navigation.navigate('ProviderTabs', { screen: 'ProviderHome' });
  };

  const getActionColor = () => {
    switch (journeyState) {
      case 'accepted':
        return colors.amber;
      case 'arrived':
        return colors.success;
      case 'in_progress':
        return colors.error;
      case 'awaiting_payment':
        return colors.amber;
      case 'completed':
        return colors.electricTeal;
      default:
        return colors.electricTeal;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={goHome} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.electricTeal} />
        </View>
      </SafeAreaView>
    );
  }

  if (!requestItem) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={goHome} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <Text style={{ color: colors.textPrimary }}>Request not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const navTarget =
    journeyState === 'in_progress' ? 'dropoff' : 'pickup';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.mapContainer}>
        <TouchableOpacity style={styles.mapBackBtn} onPress={goHome} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <AmazonMap
          pickupLat={requestItem.pickupLat}
          pickupLng={requestItem.pickupLng}
          destinationLat={requestItem.destinationLat}
          destinationLng={requestItem.destinationLng}
          driverLat={driverLocation?.lat}
          driverLng={driverLocation?.lng}
          driverRotation={driverLocation?.rotation}
          routeCoordinates={routeCoordinates}
          focusToken={mapFocusToken}
        />
      </View>

      <View style={styles.detailsContainer}>
        {fetchError && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => fetchRequest()}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.coralRed} />
            <Text style={styles.errorBannerText}>Updates paused. Tap to retry.</Text>
          </TouchableOpacity>
        )}
        <View style={styles.headerRow}>
          <Text style={styles.passengerStr}>
            {requestItem.passenger?.firstName} {requestItem.passenger?.lastName}
          </Text>
          <View style={styles.contactActions}>
            <TouchableOpacity style={styles.messageBtn} onPress={messagePassenger} activeOpacity={0.8}>
              <Ionicons name="chatbubble" size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} onPress={callPassenger} activeOpacity={0.8}>
              <Ionicons name="call" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.routeBox}>
          <TouchableOpacity style={styles.routeRow} onPress={navigateToPickup} activeOpacity={0.7}>
            <Ionicons name="radio-button-on" size={16} color={colors.success} />
            <Text style={styles.routeText} numberOfLines={2}>
              {requestItem.pickupAddress || requestItem.pickupPostcode || 'GPS Location'}
            </Text>
            <Ionicons name="navigate-outline" size={18} color={colors.electricTeal} />
          </TouchableOpacity>
          <View style={styles.routeDivider} />
          <TouchableOpacity style={styles.routeRow} onPress={navigateToDropoff} activeOpacity={0.7}>
            <Ionicons name="location" size={16} color={colors.error} />
            <Text style={styles.routeText} numberOfLines={2}>
              {requestItem.destinationAddress || requestItem.destinationPostcode}
            </Text>
            <Ionicons name="navigate-outline" size={18} color={colors.electricTeal} />
          </TouchableOpacity>
        </View>

        {etaLabel && journeyState !== 'completed' && (
          <View style={styles.etaBanner}>
            <Ionicons name="time-outline" size={18} color={colors.electricTeal} />
            <Text style={styles.etaText}>{etaLabel}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.navBtn}
          onPress={navTarget === 'dropoff' ? navigateToDropoff : navigateToPickup}
          activeOpacity={0.8}
        >
          <Ionicons name="navigate" size={20} color={colors.electricTeal} />
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
            <Ionicons name="receipt-outline" size={18} color={colors.electricTeal} />
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapContainer: { flex: 1, backgroundColor: colors.surfaceAlt },
  mapBackBtn: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  detailsContainer: {
    backgroundColor: colors.surface,
    padding: SPACING.xl,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: `${colors.coralRed}15`, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, marginBottom: SPACING.md,
  },
  errorBannerText: { flex: 1, color: colors.coralRed, fontSize: FONT_SIZES.small },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  passengerStr: { fontSize: 22, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.electricTeal,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  routeBox: {
    backgroundColor: colors.background,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: SPACING.md,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  routeDivider: {
    width: 2,
    height: 16,
    backgroundColor: colors.border,
    marginVertical: 4,
    marginLeft: 7,
  },
  routeText: { fontSize: FONT_SIZES.body, color: colors.textSecondary, flex: 1 },
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: `${colors.electricTeal}12`,
  },
  etaText: {
    color: colors.electricTeal,
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
    borderColor: colors.electricTeal,
    backgroundColor: `${colors.electricTeal}10`,
  },
  receiptBtnText: {
    color: colors.electricTeal,
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
    borderColor: colors.electricTeal,
    backgroundColor: `${colors.electricTeal}10`,
  },
  navBtnText: {
    color: colors.electricTeal,
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
