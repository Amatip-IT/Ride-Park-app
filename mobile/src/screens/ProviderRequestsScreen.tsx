import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, SafeAreaView, ActivityIndicator, Alert, RefreshControl,
  TextInput,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { bookingsApi, providerApi } from '@/api';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import {
  calculateDuration,
  formatBookingDateRange,
  formatCurrency,
  getApiErrorMessage,
} from '@/utils/helpers';

export function ProviderRequestsScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const isDriverOrTaxi = user?.role === 'driver' || user?.role === 'taxi_driver';
  const isChauffeur = user?.role === 'driver';
  const isTaxiDriver = user?.role === 'taxi_driver';
  const isParkingProvider = user?.role === 'parking_provider';
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(isDriverOrTaxi);
  const [activeTab, setActiveTab] = useState<'pending' | 'responded'>('pending');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [rejectMessage, setRejectMessage] = useState('');
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchRequests = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setFetchError(null);

    try {
      const response = await bookingsApi.getProviderRequests();
      if (response.data?.success) {
        setRequests(response.data.data || []);
      }
    } catch (err) {
      setFetchError(getApiErrorMessage(err, 'Could not load requests. Pull down to retry.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
      // Check verification for drivers/taxis
      if (isDriverOrTaxi) {
        (async () => {
          try {
            const res = await providerApi.getVerificationStatus();
            setVerificationStatus(res.data?.data?.status || 'not_applied');
          } catch { setVerificationStatus('not_applied'); }
          finally { setVerificationLoading(false); }
        })();
      }
    }, [])
  );

  // Verification gate for drivers/taxi drivers
  if (isDriverOrTaxi && verificationLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      </SafeAreaView>
    );
  }

  if (isDriverOrTaxi && verificationStatus !== 'approved') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl }}>
          <Ionicons name="shield-checkmark-outline" size={64} color={COLORS.amber} />
          <Text style={{ color: COLORS.textPrimary, fontSize: 20, fontWeight: 'bold' as const, marginTop: SPACING.lg, textAlign: 'center' }}>
            Verification Required
          </Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.sm, textAlign: 'center', lineHeight: 20 }}>
            Complete document verification and get approved before accepting work on Gleezip.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: COLORS.electricTeal, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, marginTop: SPACING.xl }}
            onPress={() => navigation.navigate('DriverVerification')}
          >
            <Text style={{ color: '#FFF', fontWeight: 'bold' as const, fontSize: 15 }}>Go to Verification</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleRespond = async (requestId: string, action: 'accept' | 'reject') => {
    if (action === 'reject' && showRejectInput !== requestId) {
      // Show the rejection reason input first
      setShowRejectInput(requestId);
      return;
    }

    setRespondingId(requestId);
    try {
      const res = await bookingsApi.respondToRequest(
        requestId,
        action,
        action === 'reject' ? rejectMessage || undefined : undefined,
      );

      if (res.data?.success) {
        Alert.alert(
          action === 'accept' ? 'Accepted!' : 'Rejected',
          action === 'accept'
            ? 'You have accepted this booking request. The parking spot has been reserved.'
            : 'You have rejected this booking request.',
        );
        setShowRejectInput(null);
        setRejectMessage('');
        fetchRequests();
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to respond');
      }
    } catch (err: unknown) {
      Alert.alert('Error', getApiErrorMessage(err, 'Failed to respond to request'));
    } finally {
      setRespondingId(null);
    }
  };

  const handleComplete = async (requestId: string) => {
    Alert.alert(
      'Complete Booking',
      'Mark this booking as completed? The parking spot will be freed up for new bookings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            setRespondingId(requestId);
            try {
              const res = await bookingsApi.completeBooking(requestId);
              if (res.data?.success) {
                Alert.alert('Completed! ✅', 'The booking has been completed and the parking spot is now available again.');
                fetchRequests();
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to complete booking');
              }
            } catch (err: unknown) {
              Alert.alert('Error', getApiErrorMessage(err, 'Failed to complete booking'));
            } finally {
              setRespondingId(null);
            }
          },
        },
      ],
    );
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const acceptedRequests = requests.filter(r => r.status === 'accepted');
  const respondedRequests = requests.filter(r => ['accepted', 'rejected', 'completed'].includes(r.status));
  const displayRequests = activeTab === 'pending' ? pendingRequests : respondedRequests;

  const renderRequestCard = (request: any) => {
    const requesterName = request.requester?.firstName
      ? `${request.requester.firstName} ${request.requester.lastName}`
      : 'User';
    const requesterEmail = request.requester?.email || '';
    const requesterPhone = request.requester?.phoneNumber || '';
    const date = request.createdAt ? new Date(request.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }) : '';
    const bookingWindow = formatBookingDateRange(request.startDate, request.endDate);
    const estimatedTotal = request.quotedPrice != null ? request.quotedPrice : null;

    const isPending = request.status === 'pending';
    const isResponding = respondingId === request._id;

    return (
      <View key={request._id} style={styles.requestCard}>
        {/* Header with service info */}
        <View style={styles.cardHeader}>
          <View style={styles.serviceTag}>
            <Ionicons name="car-sport" size={16} color={COLORS.electricTeal} />
            <Text style={styles.serviceTagText}>
              {request.serviceType === 'parking' ? 'Parking' : request.serviceType === 'driver' ? 'Driver' : 'Taxi'}
            </Text>
          </View>
          {!isPending && (
            <View style={[
              styles.statusBadge,
              { backgroundColor: request.status === 'accepted' ? `${COLORS.success}20`
                : request.status === 'completed' ? `${COLORS.info}20`
                : `${COLORS.coralRed}20` },
            ]}>
              <Text style={[
                styles.statusText,
                { color: request.status === 'accepted' ? COLORS.success
                  : request.status === 'completed' ? COLORS.info
                  : COLORS.coralRed },
              ]}>
                {request.status === 'accepted' ? 'Active' : request.status === 'completed' ? 'Completed' : 'Rejected'}
              </Text>
            </View>
          )}
        </View>

        {/* Service name */}
        <Text style={styles.serviceName}>{request.serviceName || 'Service'}</Text>

        {/* Requester info */}
        <View style={styles.requesterSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarLetter}>{requesterName.charAt(0)}</Text>
          </View>
          <View style={styles.requesterDetails}>
            <Text style={styles.requesterName}>{requesterName}</Text>
            {requesterEmail ? <Text style={styles.requesterContact}>{requesterEmail}</Text> : null}
            {requesterPhone ? <Text style={styles.requesterContact}>{requesterPhone}</Text> : null}
          </View>
        </View>

        {bookingWindow && (
          <View style={styles.dateWindow}>
            <Ionicons name="time-outline" size={16} color={COLORS.electricTeal} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dateWindowLabel}>Requested period</Text>
              <Text style={styles.dateWindowValue}>{bookingWindow}</Text>
              {request.startDate && request.endDate && (
                <Text style={styles.dateWindowSub}>
                  {calculateDuration(request.startDate, request.endDate).hours} hr(s) total
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.softSlate} />
          <Text style={styles.detailText}>Submitted {date}</Text>
        </View>
        {estimatedTotal != null && (
          <View style={styles.detailRow}>
            <Ionicons name="pricetag-outline" size={14} color={COLORS.softSlate} />
            <Text style={styles.detailText}>
              {formatCurrency(estimatedTotal)}
              {request.pricingUnit ? ` / ${request.pricingUnit === 'per_hour' ? 'hour' : request.pricingUnit === 'per_day' ? 'day' : 'trip'}` : ''}
            </Text>
          </View>
        )}
        {request.pickupAddress || request.pickupPostcode ? (
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={14} color={COLORS.softSlate} />
            <Text style={styles.detailText} numberOfLines={2}>
              Pickup: {request.pickupAddress || request.pickupPostcode}
            </Text>
          </View>
        ) : null}

        {/* Message from requester */}
        {request.message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageLabel}>Message from user:</Text>
            <Text style={styles.messageText}>{request.message}</Text>
          </View>
        )}

        {/* Action Buttons (only for pending) */}
        {isPending && (
          <View style={styles.actionsContainer}>
            {/* Reject reason input */}
            {showRejectInput === request._id && (
              <View style={styles.rejectInputWrapper}>
                <TextInput
                  style={styles.rejectInput}
                  placeholder="Reason for rejection (optional)"
                  placeholderTextColor={COLORS.softSlate}
                  value={rejectMessage}
                  onChangeText={setRejectMessage}
                  multiline
                />
              </View>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.rejectBtn, isResponding && styles.btnDisabled]}
                onPress={() => handleRespond(request._id, 'reject')}
                disabled={isResponding}
              >
                {isResponding && respondingId === request._id ? (
                  <ActivityIndicator size="small" color={COLORS.coralRed} />
                ) : (
                  <>
                    <Ionicons name="close" size={18} color={COLORS.coralRed} />
                    <Text style={styles.rejectBtnText}>
                      {showRejectInput === request._id ? 'Confirm Reject' : 'Reject'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptBtn, isResponding && styles.btnDisabled]}
                onPress={() => handleRespond(request._id, 'accept')}
                disabled={isResponding}
              >
                {isResponding ? (
                  <ActivityIndicator size="small" color={COLORS.deepNavy} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color={COLORS.deepNavy} />
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Complete button for accepted parking bookings */}
        {request.status === 'accepted' && request.serviceType === 'parking' && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.completeBtn, isResponding && styles.btnDisabled]}
              onPress={() => handleComplete(request._id)}
              disabled={isResponding}
            >
              {isResponding && respondingId === request._id ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#FFF" />
                  <Text style={styles.completeBtnText}>Complete Booking</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Response message shown on responded cards */}
        {!isPending && request.responseMessage && (
          <View style={styles.messageBox}>
            <Text style={styles.messageLabel}>Your response:</Text>
            <Text style={styles.messageText}>{request.responseMessage}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isParkingProvider
              ? 'Parking requests'
              : isChauffeur
                ? 'Scheduled jobs'
                : 'Booking requests'}
          </Text>
          {pendingRequests.length > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingRequests.length}</Text>
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
            onPress={() => setActiveTab('pending')}
          >
            <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>
              Pending ({pendingRequests.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'responded' && styles.activeTab]}
            onPress={() => setActiveTab('responded')}
          >
            <Text style={[styles.tabText, activeTab === 'responded' && styles.activeTabText]}>
              Responded ({respondedRequests.length})
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchRequests(true)} tintColor={COLORS.electricTeal} />
          }
        >
          {isTaxiDriver && (
            <TouchableOpacity
              style={styles.liveRidesCta}
              onPress={() => navigation.navigate('DriverRideRequests')}
              activeOpacity={0.8}
            >
              <Ionicons name="car-sport" size={22} color={COLORS.electricTeal} />
              <View style={{ flex: 1 }}>
                <Text style={styles.liveRidesTitle}>Live taxi ride requests</Text>
                <Text style={styles.liveRidesSub}>
                  Point-to-point trips with map tracking — open the live queue
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.electricTeal} />
            </TouchableOpacity>
          )}

          {isChauffeur && (
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.info} />
              <Text style={styles.infoBannerText}>
                These are scheduled chauffeur hires. Confirm the dates below before accepting. Live GPS tracking applies to taxi trips, not hourly hires.
              </Text>
            </View>
          )}

          {fetchError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={COLORS.coralRed} />
              <Text style={styles.errorBannerText}>{fetchError}</Text>
            </View>
          )}

          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={COLORS.electricTeal} />
            </View>
          ) : displayRequests.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="mail-open-outline" size={64} color={COLORS.steelBlue} />
              <Text style={styles.emptyTitle}>
                {activeTab === 'pending' ? 'No pending requests' : 'No responded requests yet'}
              </Text>
              <Text style={styles.emptySubtext}>
                {activeTab === 'pending'
                  ? isTaxiDriver
                    ? 'Parking or other bookings appear here. For live trips, use Live Ride Requests on your home screen.'
                    : 'When a customer requests your service, it will appear here.'
                  : 'Requests you accept or reject will show up here.'}
              </Text>
            </View>
          ) : (
            displayRequests.map(renderRequestCard)
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.lg, gap: SPACING.sm,
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold },
  pendingBadge: {
    backgroundColor: COLORS.coralRed, borderRadius: 12,
    minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 8,
  },
  pendingBadgeText: { color: '#fff', fontSize: 12, fontWeight: FONT_WEIGHTS.bold },

  // Tabs
  tabContainer: {
    flexDirection: 'row', paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  tab: {
    paddingBottom: SPACING.md, marginRight: SPACING.xl,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: COLORS.electricTeal },
  tabText: { color: COLORS.textSecondary, fontSize: 16, fontWeight: FONT_WEIGHTS.medium },
  activeTabText: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.bold },
  scrollContent: { padding: SPACING.lg, flexGrow: 1 },

  // Request Card
  requestCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  serviceTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serviceTagText: {
    color: COLORS.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.sm,
  },
  statusText: { fontSize: 12, fontWeight: FONT_WEIGHTS.bold },
  serviceName: {
    color: COLORS.textPrimary, fontSize: 17, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
  },

  // Requester
  requesterSection: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: SPACING.sm, gap: SPACING.sm,
  },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.electricTeal,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarLetter: { color: '#FFF', fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  requesterDetails: { flex: 1 },
  requesterName: { color: COLORS.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },
  requesterContact: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },

  // Details
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  detailText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.label },

  // Message
  messageBox: {
    backgroundColor: COLORS.surfaceAlt, borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm, marginTop: SPACING.sm,
  },
  messageLabel: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 2 },
  messageText: { color: COLORS.textPrimary, fontSize: FONT_SIZES.label },

  // Actions
  actionsContainer: { marginTop: SPACING.md },
  rejectInputWrapper: { marginBottom: SPACING.sm },
  rejectInput: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: COLORS.textPrimary, fontSize: FONT_SIZES.label,
    borderWidth: 1, borderColor: COLORS.border, minHeight: 60,
  },
  buttonRow: { flexDirection: 'row', gap: SPACING.sm },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: SPACING.md, borderWidth: 1, borderColor: COLORS.coralRed,
    borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.background,
  },
  rejectBtnText: { color: COLORS.coralRed, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: SPACING.md, backgroundColor: COLORS.electricTeal,
    borderRadius: BORDER_RADIUS.md,
  },
  acceptBtnText: { color: '#FFF', fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },
  btnDisabled: { opacity: 0.5 },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: SPACING.md, backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
  },
  completeBtnText: { color: '#FFF', fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },

  dateWindow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(0, 194, 168, 0.08)',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 168, 0.25)',
  },
  dateWindowLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: FONT_WEIGHTS.semibold },
  dateWindowValue: { color: COLORS.textPrimary, fontSize: 14, fontWeight: FONT_WEIGHTS.medium, marginTop: 2 },
  dateWindowSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  liveRidesCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.electricTeal,
  },
  liveRidesTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  liveRidesSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: BORDER_RADIUS.md,
  },
  infoBannerText: { flex: 1, color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderRadius: BORDER_RADIUS.md,
  },
  errorBannerText: { flex: 1, color: COLORS.coralRed, fontSize: 13, lineHeight: 18 },

  // Empty
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  emptyTitle: {
    color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },
  emptySubtext: {
    color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', maxWidth: '80%', lineHeight: 20,
  },
});
