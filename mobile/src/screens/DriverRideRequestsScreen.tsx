import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, TextInput,
  RefreshControl, Modal
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { taxiBookingsApi } from '@/api';
import { AmazonMap } from '@/components/AmazonMap';

export function DriverRideRequestsScreen() {
  const navigation = useNavigation<NavigationProp<any>>();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Selected request for the map modal
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Accept form state (ETA)
  const [etaMinutes, setEtaMinutes] = useState('5');

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

  const handleAccept = async () => {
    if (!selectedRequest) return;
    
    if (!etaMinutes || isNaN(Number(etaMinutes))) {
      Alert.alert('ETA Required', 'Please select an estimated arrival time.');
      return;
    }

    setAcceptingId(selectedRequest._id);

    try {
      const res = await taxiBookingsApi.acceptRequest(selectedRequest._id, {
        etaMinutes: Number(etaMinutes),
      });

      if (res.data?.success) {
        // Success
        const reqId = selectedRequest._id;
        setSelectedRequest(null);
        Alert.alert('✅ Ride Accepted!', 'The passenger has been notified. Head to the pickup location.');
        // Navigate straight to the active journey tracker!
        navigation.navigate('ProviderActiveJourney', {
          requestId: reqId,
          serviceType: 'taxi'
        });
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to accept ride');
      }
    } catch (error: any) {
      const msg = error?.message || error?.response?.data?.message || 'Failed to accept';
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

        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={() => setSelectedRequest(req)}
          activeOpacity={0.7}
        >
          <Ionicons name="map-outline" size={20} color="#FFF" />
          <Text style={styles.acceptBtnText}>View on Map</Text>
        </TouchableOpacity>
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

      {/* MATCH MODAL (Uber-Style UI) */}
      <Modal
        visible={!!selectedRequest}
        animationType="slide"
        transparent={false}
      >
        <View style={styles.modalContainer}>
          {/* Map Background */}
          {selectedRequest && (
            <AmazonMap
              pickupLat={selectedRequest.pickupLat}
              pickupLng={selectedRequest.pickupLng}
              destinationLat={selectedRequest.destinationLat}
              destinationLng={selectedRequest.destinationLng}
            />
          )}

          {/* Dark Overlay Info Card (Uber style) */}
          <View style={styles.matchCard}>
            <View style={styles.matchCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="person" size={16} color="#FFF" />
                <Text style={styles.matchCardTitle}>UberX Request</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedRequest(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <Text style={styles.matchPrice}>£{selectedRequest?.estimatedCost?.toFixed(2) || '0.00'}</Text>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Ionicons name="star" size={14} color={COLORS.amber} />
              <Text style={styles.matchRating}>4.91</Text>
            </View>

            <View style={styles.feeBadge}>
              <Text style={styles.feeText}>£0.77 est. holiday entitlement included</Text>
            </View>

            <View style={styles.matchRoute}>
              {/* Pickup Line */}
              <View style={styles.matchRouteItem}>
                <View style={styles.matchNode} />
                <Text style={styles.matchRouteText} numberOfLines={1}>
                  5 min (1.4 mi) {selectedRequest?.pickupAddress || selectedRequest?.pickupPostcode || 'Current Location'}
                </Text>
              </View>
              
              <View style={styles.matchRouteLine} />
              
              {/* Dropoff Line */}
              <View style={styles.matchRouteItem}>
                <View style={[styles.matchNode, { backgroundColor: '#FFF' }]} />
                <Text style={styles.matchRouteText} numberOfLines={2}>
                  {Math.round(selectedRequest?.estimatedDurationMinutes || 12)} mins ({selectedRequest?.estimatedDistanceMiles?.toFixed(1) || 4.3} mi){'\n'}
                  {selectedRequest?.destinationAddress || selectedRequest?.destinationPostcode}
                </Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.matchBtn, acceptingId === selectedRequest?._id && { opacity: 0.6 }]}
              onPress={handleAccept}
              disabled={acceptingId === selectedRequest?._id}
              activeOpacity={0.8}
            >
              {acceptingId === selectedRequest?._id ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.matchBtnText}>Match</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  acceptBtn: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', gap: SPACING.sm,
  },
  acceptBtnText: { color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },

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

  // MODAL UBER UI
  modalContainer: { flex: 1, backgroundColor: '#1C1C1E' },
  matchCard: {
    position: 'absolute', bottom: 20, left: 16, right: 16,
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 15,
  },
  matchCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchCardTitle: { color: '#B0B0B0', fontSize: 15, fontWeight: 'bold' as any },
  closeBtn: { padding: 4 },
  matchPrice: { color: '#FFF', fontSize: 44, fontWeight: 'bold' as any, letterSpacing: -1 },
  matchRating: { color: '#FFF', fontSize: 15, fontWeight: 'bold' as any, marginLeft: 4 },
  feeBadge: { backgroundColor: 'rgba(255,255,255,0.1)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginTop: 12, marginBottom: 20 },
  feeText: { color: '#B0B0B0', fontSize: 12, fontWeight: 'bold' as any },
  matchRoute: { marginBottom: 24, paddingLeft: 4 },
  matchRouteItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  matchNode: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'transparent', borderWidth: 2, borderColor: '#FFF', marginTop: 6 },
  matchRouteText: { color: '#FFF', fontSize: 14, fontWeight: '500' as any, lineHeight: 20, flex: 1 },
  matchRouteLine: { width: 2, height: 24, backgroundColor: '#555', marginLeft: 3, marginVertical: 4 },
  
  matchBtn: { backgroundColor: '#FFF', paddingVertical: 18, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  matchBtnText: { color: '#000', fontSize: 18, fontWeight: 'bold' as any },
});
