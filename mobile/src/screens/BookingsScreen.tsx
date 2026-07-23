import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, SafeAreaView, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { bookingsApi, taxiBookingsApi, ridesApi } from '@/api';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { RatingModal } from '@/components/RatingModal';
import { getApiErrorMessage } from '@/utils/helpers';
import {
  canCancelBooking,
  canCancelRide,
  getCancelBookingMessage,
  getCancelRideMessage,
} from '@/utils/cancellation';

type RatingTarget = {
  subjectName: string;
  subjectId: string;
  bookingId: string;
  serviceType: 'parking' | 'driver' | 'taxi';
  title: string;
};

export function BookingsScreen() {
  const navigation = useNavigation<any>();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const STATUS_CONFIG: Record<string, { color: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    pending: { color: colors.amber, label: 'Pending', icon: 'time-outline' },
    accepted: { color: colors.success, label: 'Accepted', icon: 'checkmark-circle-outline' },
    awaiting_payment: { color: colors.amber, label: 'Payment Due', icon: 'card-outline' },
    rejected: { color: colors.coralRed, label: 'Rejected', icon: 'close-circle-outline' },
    cancelled: { color: colors.softSlate, label: 'Cancelled', icon: 'ban-outline' },
    completed: { color: colors.info, label: 'Completed', icon: 'trophy-outline' },
  };

  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');
  const [bookings, setBookings] = useState<any[]>([]);
  const [rideRequests, setRideRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [ratingTarget, setRatingTarget] = useState<RatingTarget | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  const fetchBookings = async (isRefresh = false, background = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!background) setLoading(true);

    try {
      setFetchError(null);
      const [bookingsRes, ridesRes] = await Promise.all([
        bookingsApi.getMyBookings(),
        taxiBookingsApi.getMyRequests(),
      ]);
      if (bookingsRes.data?.success) {
        setBookings(bookingsRes.data.data || []);
      }
      if (ridesRes.data?.success) {
        setRideRequests(ridesRes.data.data || []);
      }
    } catch (err) {
      setFetchError(getApiErrorMessage(err, 'Could not load your bookings. Pull down to retry.'));
    } finally {
      if (!background) setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchBookings();
    }, [])
  );

  const hasProcessingPayment =
    bookings.some((booking) => booking.paymentStatus === 'processing') ||
    rideRequests.some((request) =>
      typeof request.ride === 'object' && request.ride?.paymentStatus === 'processing',
    );

  useEffect(() => {
    if (!hasProcessingPayment) return;
    const interval = setInterval(() => fetchBookings(false, true), 10000);
    return () => clearInterval(interval);
  }, [hasProcessingPayment]);

  const handleCancelBooking = (booking: any) => {
    Alert.alert(
      'Cancel Booking',
      getCancelBookingMessage(booking.status, booking.quotedPrice),
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            const actionKey = `booking:${booking._id}:cancel`;
            if (processingAction) return;
            setProcessingAction(actionKey);
            try {
              const res = await bookingsApi.cancelBooking(booking._id);
              if (res.data?.success) {
                Alert.alert('Cancelled', res.data.message || 'Your booking has been cancelled');
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to cancel');
              }
            } catch (err) {
              Alert.alert('Error', getApiErrorMessage(err, 'Failed to cancel booking'));
            } finally {
              await fetchBookings();
              setProcessingAction(null);
            }
          },
        },
      ],
    );
  };

  const handleConfirmBookingArrival = async (booking: any) => {
    if (processingAction) return;
    setProcessingAction(`booking:${booking._id}:confirm`);
    try {
      const res = await bookingsApi.confirmBookingArrival(booking._id);
      if (res.data?.success) {
        Alert.alert('Location Confirmed', res.data.message || 'You can now complete payment.');
        fetchBookings();
      } else {
        Alert.alert('Error', res.data?.message || 'Could not confirm your location');
      }
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err, 'Could not confirm your location'));
    } finally {
      setProcessingAction(null);
    }
  };

  const handlePayBooking = (booking: any) => {
    if (!booking.passengerConfirmedAt) {
      Alert.alert(
        'Confirm Your Location',
        'Please confirm you are at the service location before paying.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm Location', onPress: () => handleConfirmBookingArrival(booking) },
        ],
      );
      return;
    }

    Alert.alert(
      'Confirm Payment',
      `Pay £${(booking.quotedPrice || 0).toFixed(2)} for "${booking.serviceName || 'service'}"?\n\nThis will be charged to your saved card.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            if (processingAction || booking.paymentStatus === 'processing') return;
            setProcessingAction(`booking:${booking._id}:pay`);
            try {
              const res = await bookingsApi.payBooking(booking._id);
              if (res.data?.success) {
                Alert.alert(
                  'Payment Successful',
                  res.data.message || 'Your payment has been processed. Receipt is available.',
                  [
                    { text: 'View Receipt', onPress: () => navigation.navigate('TripReceipt', { bookingId: booking._id }) },
                    { text: 'OK' },
                  ]
                );
              } else {
                Alert.alert('Payment Failed', res.data?.message || 'Could not process payment. Please try again.');
              }
            } catch (err) {
              Alert.alert('Payment Failed', getApiErrorMessage(err, 'Could not process payment. Please check your card.'));
            } finally {
              await fetchBookings();
              setProcessingAction(null);
            }
          },
        },
      ],
    );
  };

  const getRideRecordId = (ride: any) => {
    const linked = ride.ride;
    return typeof linked === 'object' ? linked?._id : linked;
  };

  const getRideFare = (ride: any) => {
    const linked = ride.ride;
    if (typeof linked === 'object' && linked?.totalCost != null) {
      return linked.totalCost;
    }
    return ride.estimatedCost || 0;
  };

  const getRidePaymentStatus = (ride: any): string | undefined => {
    const linked = ride.ride;
    return typeof linked === 'object' ? linked?.paymentStatus : undefined;
  };

  const handleConfirmRideArrival = async (ride: any) => {
    if (processingAction) return;
    const rideRecordId = getRideRecordId(ride);
    if (!rideRecordId) {
      Alert.alert('Error', 'Ride details are not ready yet. Please try again shortly.');
      return;
    }
    setProcessingAction(`ride:${ride._id}:confirm`);
    try {
      const res = await ridesApi.confirmArrival(String(rideRecordId));
      if (res.data?.success) {
        Alert.alert('Location Confirmed', res.data.message || 'You can now complete payment.');
        fetchBookings();
      } else {
        Alert.alert('Error', res.data?.message || 'Could not confirm your location');
      }
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err, 'Could not confirm your location'));
    } finally {
      setProcessingAction(null);
    }
  };

  const handlePayRide = (ride: any) => {
    const rideRecordId = getRideRecordId(ride);
    if (!rideRecordId) {
      Alert.alert('Error', 'Ride details are not ready yet. Please try again shortly.');
      return;
    }

    const linkedPaymentStatus = getRidePaymentStatus(ride);
    if (processingAction || linkedPaymentStatus === 'processing') return;

    if (!ride.passengerConfirmedAt) {
      Alert.alert(
        'Confirm Your Location',
        'Please confirm you are at your destination before paying.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm Location', onPress: () => handleConfirmRideArrival(ride) },
        ],
      );
      return;
    }

    const fare = getRideFare(ride);
    Alert.alert(
      'Confirm Payment',
      `Pay £${fare.toFixed(2)} for your taxi ride?\n\nThis will be charged to your saved card.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            if (processingAction) return;
            setProcessingAction(`ride:${ride._id}:pay`);
            try {
              const res = await ridesApi.payRide(String(rideRecordId));
              if (res.data?.success) {
                Alert.alert(
                  'Payment Successful',
                  res.data.message || 'Your payment has been processed. Receipt is available.',
                  [
                    {
                      text: 'View Receipt',
                      onPress: () => navigation.navigate('TripReceipt', {
                        requestId: ride._id,
                        rideId: String(rideRecordId),
                      }),
                    },
                    {
                      text: 'Leave a Review',
                      onPress: () => {
                        const driverId = ride.acceptedDriver?._id || ride.acceptedDriver;
                        if (driverId) {
                          setRatingTarget({
                            subjectName: `${ride.acceptedDriver?.firstName || ''} ${ride.acceptedDriver?.lastName || ''}`.trim() || 'Your driver',
                            subjectId: String(driverId),
                            bookingId: ride._id,
                            serviceType: 'taxi',
                            title: 'Rate Your Ride',
                          });
                        }
                      },
                    },
                    { text: 'OK' },
                  ],
                );
              } else {
                Alert.alert('Payment Failed', res.data?.message || 'Could not process payment. Please try again.');
              }
            } catch (err) {
              Alert.alert('Payment Failed', getApiErrorMessage(err, 'Could not process payment. Please check your card.'));
            } finally {
              await fetchBookings();
              setProcessingAction(null);
            }
          },
        },
      ],
    );
  };

  const handleCancelRide = (ride: any) => {
    Alert.alert(
      'Cancel Ride',
      getCancelRideMessage(ride.status),
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            if (processingAction) return;
            setProcessingAction(`ride:${ride._id}:cancel`);
            try {
              const res = await taxiBookingsApi.cancelRequest(ride._id);
              if (res.data?.success) {
                Alert.alert('Cancelled', res.data.message || 'Your ride request has been cancelled');
                fetchBookings();
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to cancel');
              }
            } catch (err) {
              Alert.alert('Error', getApiErrorMessage(err, 'Failed to cancel ride'));
            } finally {
              setProcessingAction(null);
            }
          },
        },
      ],
    );
  };

  const activeBookings = bookings.filter(b => ['pending', 'accepted', 'awaiting_payment'].includes(b.status));
  const activeRides = rideRequests.filter(r =>
    ['searching', 'accepted', 'arrived', 'in_progress', 'awaiting_payment'].includes(r.status),
  );
  const pastBookings = bookings.filter(b => ['rejected', 'cancelled', 'completed'].includes(b.status));
  const pastRides = rideRequests.filter(r => ['cancelled', 'completed', 'expired'].includes(r.status));
  const displayBookings = activeTab === 'active' ? activeBookings : pastBookings;
  const displayRides = activeTab === 'active' ? activeRides : pastRides;

  const renderBookingCard = (booking: any) => {
    const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
    const providerName = booking.provider?.firstName
      ? `${booking.provider.firstName} ${booking.provider.lastName}`
      : 'Provider';
    const date = booking.createdAt ? new Date(booking.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    }) : '';
    const isBookingAction = processingAction?.startsWith(`booking:${booking._id}:`) ?? false;

    return (
      <View key={booking._id} style={styles.bookingCard}>
        <View style={styles.cardHeader}>
          <View style={styles.serviceTag}>
            <Ionicons
              name={booking.serviceType === 'parking' ? 'car-sport' : booking.serviceType === 'driver' ? 'person' : 'navigate'}
              size={16}
              color={colors.electricTeal}
            />
            <Text style={styles.serviceTagText}>
              {booking.serviceType === 'parking' ? 'Parking' : booking.serviceType === 'driver' ? 'Chauffeur' : 'Taxi'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusCfg.color}20` }]}>
            <Ionicons name={statusCfg.icon} size={14} color={statusCfg.color} />
            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>

        <Text style={styles.serviceName}>{booking.serviceName || 'Service'}</Text>

        <View style={styles.detailRow}>
          <Ionicons name="person-outline" size={14} color={colors.softSlate} />
          <Text style={styles.detailText}>{providerName}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.softSlate} />
          <Text style={styles.detailText}>Requested {date}</Text>
        </View>
        {booking.quotedPrice != null && (
          <View style={styles.detailRow}>
            <Ionicons name="pricetag-outline" size={14} color={colors.softSlate} />
            <Text style={styles.detailText}>£{booking.quotedPrice.toFixed(2)}/{booking.pricingUnit === 'per_hour' ? 'hr' : 'day'}</Text>
          </View>
        )}

        {booking.responseMessage && (
          <View style={styles.responseBox}>
            <Text style={styles.responseLabel}>Provider response:</Text>
            <Text style={styles.responseText}>{booking.responseMessage}</Text>
          </View>
        )}

        {booking.status === 'awaiting_payment' && (
          <>
            {booking.paymentStatus === 'processing' ? (
              <View style={styles.processingBanner}>
                <ActivityIndicator color={colors.amber} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.processingTitle}>Payment processing</Text>
                  <Text style={styles.processingText}>This booking will refresh automatically.</Text>
                </View>
              </View>
            ) : !booking.passengerConfirmedAt ? (
              <TouchableOpacity
                style={[styles.trackBtn, isBookingAction && { opacity: 0.6 }]}
                onPress={() => handleConfirmBookingArrival(booking)}
                disabled={!!processingAction}
                activeOpacity={0.8}
              >
                {isBookingAction ? (
                  <ActivityIndicator color={colors.electricTeal} />
                ) : (
                  <>
                    <Ionicons name="location-outline" size={16} color={colors.electricTeal} />
                    <Text style={styles.trackBtnText}>I am at the location</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.payNowBtn, isBookingAction && { opacity: 0.6 }]}
                onPress={() => handlePayBooking(booking)}
                disabled={!!processingAction}
                activeOpacity={0.8}
              >
                {isBookingAction ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={18} color="#FFF" />
                    <Text style={styles.payNowBtnText}>
                      {booking.paymentStatus === 'payment_failed' ? 'Retry' : 'Pay'} £{(booking.quotedPrice || 0).toFixed(2)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {booking.status === 'completed' && booking.paymentIntentId && (
          <>
            <TouchableOpacity
              style={styles.trackBtn}
              onPress={() => navigation.navigate('TripReceipt', { bookingId: booking._id })}
            >
              <Ionicons name="receipt-outline" size={16} color={colors.electricTeal} />
              <Text style={styles.trackBtnText}>View Receipt</Text>
            </TouchableOpacity>
            {booking.provider?._id && (
              <TouchableOpacity
                style={styles.trackBtn}
                onPress={() => setRatingTarget({
                  subjectName: providerName,
                  subjectId: booking.provider._id,
                  bookingId: booking._id,
                  serviceType: booking.serviceType === 'parking' ? 'parking' : 'driver',
                  title: booking.serviceType === 'parking' ? 'Rate Parking Provider' : 'Rate Your Driver',
                })}
              >
                <Ionicons name="star-outline" size={16} color={colors.amber} />
                <Text style={[styles.trackBtnText, { color: colors.amber }]}>Leave a Review</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {canCancelBooking(booking.status) && (
          <TouchableOpacity
            style={[styles.cancelBtn, isBookingAction && { opacity: 0.6 }]}
            onPress={() => handleCancelBooking(booking)}
            disabled={!!processingAction}
          >
            <Ionicons name="close" size={16} color={colors.coralRed} />
            <Text style={styles.cancelBtnText}>Cancel Booking</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderRideCard = (ride: any) => {
    const rideStatusConfig: Record<string, { color: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
      searching: { color: colors.amber, label: 'Searching', icon: 'search-outline' },
      accepted: { color: colors.success, label: 'Driver Found', icon: 'checkmark-circle-outline' },
      arrived: { color: colors.amber, label: 'Driver Arrived', icon: 'location-outline' },
      in_progress: { color: colors.info, label: 'In Progress', icon: 'car-outline' },
      awaiting_payment: { color: colors.amber, label: 'Payment Due', icon: 'card-outline' },
      completed: { color: colors.success, label: 'Completed', icon: 'trophy-outline' },
      cancelled: { color: colors.softSlate, label: 'Cancelled', icon: 'ban-outline' },
      expired: { color: colors.softSlate, label: 'Expired', icon: 'time-outline' },
    };
    const rStatusCfg = rideStatusConfig[ride.status] || rideStatusConfig.searching;
    const rideRecordId = getRideRecordId(ride);
    const driverId = ride.acceptedDriver?._id || ride.acceptedDriver;
    const driverName = ride.acceptedDriver
      ? `${ride.acceptedDriver.firstName || ''} ${ride.acceptedDriver.lastName || ''}`.trim() || 'Your driver'
      : 'Your driver';
    const date = ride.createdAt ? new Date(ride.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    }) : '';
    const ridePaymentStatus = getRidePaymentStatus(ride);
    const isRideAction = processingAction?.startsWith(`ride:${ride._id}:`) ?? false;

    return (
      <View key={ride._id} style={styles.bookingCard}>
        <View style={styles.cardHeader}>
          <View style={styles.serviceTag}>
            <Ionicons name="car" size={16} color={colors.electricTeal} />
            <Text style={styles.serviceTagText}>Taxi Ride</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${rStatusCfg.color}20` }]}>
            <Ionicons name={rStatusCfg.icon} size={14} color={rStatusCfg.color} />
            <Text style={[styles.statusText, { color: rStatusCfg.color }]}>{rStatusCfg.label}</Text>
          </View>
        </View>

        <Text style={styles.serviceName}>
          {ride.pickupAddress || ride.pickupPostcode || 'GPS Location'} → {ride.destinationAddress}
        </Text>

        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.softSlate} />
          <Text style={styles.detailText}>Requested {date}</Text>
        </View>
        {ride.estimatedCost != null && (
          <View style={styles.detailRow}>
            <Ionicons name="pricetag-outline" size={14} color={colors.softSlate} />
            <Text style={styles.detailText}>Est. £{ride.estimatedCost.toFixed(2)}</Text>
          </View>
        )}
        {ride.driverVehicle && (
          <View style={styles.detailRow}>
            <Ionicons name="car-sport-outline" size={14} color={colors.softSlate} />
            <Text style={styles.detailText}>
              {ride.driverVehicle.color} {ride.driverVehicle.make} {ride.driverVehicle.model}
              {ride.driverVehicle.plateNumber ? ` (${ride.driverVehicle.plateNumber})` : ''}
            </Text>
          </View>
        )}

        {['searching', 'accepted', 'arrived', 'in_progress'].includes(ride.status) && (
          <TouchableOpacity
            style={styles.trackBtn}
            onPress={() => navigation.navigate('PassengerTracking', { requestId: ride._id })}
          >
            <Ionicons name="navigate-outline" size={16} color={colors.electricTeal} />
            <Text style={styles.trackBtnText}>Track Ride</Text>
          </TouchableOpacity>
        )}

        {canCancelRide(ride.status) && (
          <TouchableOpacity
            style={[styles.cancelBtn, isRideAction && { opacity: 0.6 }]}
            onPress={() => handleCancelRide(ride)}
            disabled={!!processingAction}
          >
            <Ionicons name="close" size={16} color={colors.coralRed} />
            <Text style={styles.cancelBtnText}>Cancel Ride</Text>
          </TouchableOpacity>
        )}

        {ride.status === 'awaiting_payment' && (
          <>
            {ridePaymentStatus === 'processing' ? (
              <View style={styles.processingBanner}>
                <ActivityIndicator color={colors.amber} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.processingTitle}>Payment processing</Text>
                  <Text style={styles.processingText}>Your ride will refresh automatically.</Text>
                </View>
              </View>
            ) : !ride.passengerConfirmedAt ? (
              <TouchableOpacity
                style={[styles.trackBtn, isRideAction && { opacity: 0.6 }]}
                onPress={() => handleConfirmRideArrival(ride)}
                disabled={!!processingAction}
              >
                {isRideAction ? (
                  <ActivityIndicator color={colors.electricTeal} />
                ) : (
                  <>
                    <Ionicons name="location-outline" size={16} color={colors.electricTeal} />
                    <Text style={styles.trackBtnText}>I am at my destination</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.payNowBtn, isRideAction && { opacity: 0.6 }]}
                onPress={() => handlePayRide(ride)}
                disabled={!!processingAction}
                activeOpacity={0.8}
              >
                {isRideAction ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={18} color="#FFF" />
                    <Text style={styles.payNowBtnText}>
                      {ridePaymentStatus === 'payment_failed' ? 'Retry' : 'Pay'} £{getRideFare(ride).toFixed(2)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {ride.status === 'completed' && rideRecordId && (
          <>
            <TouchableOpacity
              style={styles.trackBtn}
              onPress={() => navigation.navigate('TripReceipt', {
                requestId: ride._id,
                rideId: String(rideRecordId),
              })}
            >
              <Ionicons name="receipt-outline" size={16} color={colors.electricTeal} />
              <Text style={styles.trackBtnText}>View Receipt</Text>
            </TouchableOpacity>
            {driverId && (
              <TouchableOpacity
                style={styles.trackBtn}
                onPress={() => setRatingTarget({
                  subjectName: driverName,
                  subjectId: String(driverId),
                  bookingId: ride._id,
                  serviceType: 'taxi',
                  title: 'Rate Your Ride',
                })}
              >
                <Ionicons name="star-outline" size={16} color={colors.amber} />
                <Text style={[styles.trackBtnText, { color: colors.amber }]}>Leave a Review</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Bookings</Text>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'active' && styles.activeTab]}
            onPress={() => setActiveTab('active')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
              Active ({activeBookings.length + activeRides.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'past' && styles.activeTab]}
            onPress={() => setActiveTab('past')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'past' && styles.activeTabText]}>
              Past ({pastBookings.length + pastRides.length})
            </Text>
          </TouchableOpacity>
        </View>

        {fetchError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.coralRed} />
            <Text style={styles.errorBannerText}>{fetchError}</Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchBookings(true)} tintColor={colors.electricTeal} />
          }
        >
          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={colors.electricTeal} />
            </View>
          ) : (displayBookings.length === 0 && displayRides.length === 0) ? (
            <View style={styles.emptyState}>
              <View style={styles.iconCircle}>
                <Ionicons name="calendar-outline" size={48} color={colors.electricTeal} />
              </View>
              <Text style={styles.emptyStateTitle}>
                No {activeTab === 'active' ? 'active' : 'past'} bookings
              </Text>
              <Text style={styles.emptyStateSubtext}>
                {activeTab === 'active'
                  ? "You don't have any pending or accepted bookings right now."
                  : "You haven't completed or cancelled any bookings yet."}
              </Text>
            </View>
          ) : (
            <>
              {displayRides.map(renderRideCard)}
              {displayBookings.map(renderBookingCard)}
            </>
          )}
        </ScrollView>
      </View>

      {ratingTarget && (
        <RatingModal
          visible={!!ratingTarget}
          onClose={() => setRatingTarget(null)}
          subjectName={ratingTarget.subjectName}
          subjectId={ratingTarget.subjectId}
          bookingId={ratingTarget.bookingId}
          serviceType={ratingTarget.serviceType}
          title={ratingTarget.title}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    header: {
      paddingHorizontal: SPACING.xl,
      paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
      paddingBottom: SPACING.lg,
    },
    headerTitle: { color: colors.textPrimary, fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold },
    tabContainer: {
      flexDirection: 'row', paddingHorizontal: SPACING.xl,
      marginBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    tab: {
      paddingBottom: SPACING.md, marginRight: SPACING.xl,
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    activeTab: { borderBottomColor: colors.electricTeal },
    tabText: { color: colors.textSecondary, fontSize: 16, fontWeight: FONT_WEIGHTS.medium },
    activeTabText: { color: colors.electricTeal, fontWeight: FONT_WEIGHTS.semibold },
    scrollContent: { padding: SPACING.lg, flexGrow: 1 },
    bookingCard: {
      backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.lg, marginBottom: SPACING.md,
      borderWidth: 1, borderColor: colors.border,
    },
    cardHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: SPACING.sm,
    },
    serviceTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    serviceTagText: {
      color: colors.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
    },
    statusBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.sm,
    },
    statusText: { fontSize: 12, fontWeight: FONT_WEIGHTS.bold },
    serviceName: {
      color: colors.textPrimary, fontSize: 17, fontWeight: FONT_WEIGHTS.bold,
      marginBottom: SPACING.sm,
    },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    detailText: { color: colors.textSecondary, fontSize: FONT_SIZES.label },
    responseBox: {
      backgroundColor: colors.surfaceAlt, borderRadius: BORDER_RADIUS.md,
      padding: SPACING.sm, marginTop: SPACING.sm,
    },
    responseLabel: { color: colors.textSecondary, fontSize: 11, marginBottom: 2 },
    responseText: { color: colors.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium },
    cancelBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      marginTop: SPACING.md, paddingVertical: SPACING.sm,
      borderWidth: 1, borderColor: colors.coralRed, borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background,
    },
    cancelBtnText: { color: colors.coralRed, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },
    trackBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      marginTop: SPACING.md, paddingVertical: SPACING.sm,
      borderWidth: 1, borderColor: colors.electricTeal, borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background,
    },
    trackBtnText: { color: colors.electricTeal, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },
    payNowBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: SPACING.md, paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.electricTeal,
    },
    payNowBtnText: { color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },
    processingBanner: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
      marginTop: SPACING.md, padding: SPACING.md,
      borderRadius: BORDER_RADIUS.md, backgroundColor: `${colors.amber}15`,
      borderWidth: 1, borderColor: `${colors.amber}40`,
    },
    processingTitle: { color: colors.amber, fontSize: 14, fontWeight: FONT_WEIGHTS.bold },
    processingText: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
    iconCircle: {
      width: 100, height: 100, borderRadius: 50,
      backgroundColor: `${colors.electricTeal}18`,
      justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl,
    },
    emptyStateTitle: {
      color: colors.textPrimary, fontSize: 22, fontWeight: FONT_WEIGHTS.bold,
      marginBottom: SPACING.md, textAlign: 'center',
    },
    emptyStateSubtext: {
      color: colors.textSecondary, fontSize: 16, textAlign: 'center', maxWidth: '85%', lineHeight: 24,
    },
    errorBanner: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
      marginHorizontal: SPACING.lg, marginBottom: SPACING.sm,
      padding: SPACING.md, backgroundColor: `${colors.coralRed}18`, borderRadius: BORDER_RADIUS.md,
    },
    errorBannerText: { flex: 1, color: colors.coralRed, fontSize: 13, lineHeight: 18 },
  });
