import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, SafeAreaView, ActivityIndicator, Alert, RefreshControl,
  TextInput,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { bookingsApi } from '@/api';
import { useFocusEffect } from '@react-navigation/native';

export function ProviderRequestsScreen() {
  const [activeTab, setActiveTab] = useState<'pending' | 'responded'>('pending');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [rejectMessage, setRejectMessage] = useState('');
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);

  const fetchRequests = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await bookingsApi.getProviderRequests();
      if (response.data?.success) {
        setRequests(response.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch requests:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [])
  );

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
            ? 'You have accepted this booking request.'
            : 'You have rejected this booking request.',
        );
        setShowRejectInput(null);
        setRejectMessage('');
        fetchRequests();
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to respond');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to respond to request');
    } finally {
      setRespondingId(null);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const respondedRequests = requests.filter(r => ['accepted', 'rejected'].includes(r.status));
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
              { backgroundColor: request.status === 'accepted' ? `${COLORS.success}20` : `${COLORS.coralRed}20` },
            ]}>
              <Text style={[
                styles.statusText,
                { color: request.status === 'accepted' ? COLORS.success : COLORS.coralRed },
              ]}>
                {request.status === 'accepted' ? 'Accepted' : 'Rejected'}
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

        {/* Date & price */}
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.softSlate} />
          <Text style={styles.detailText}>Requested {date}</Text>
        </View>
        {request.quotedPrice != null && (
          <View style={styles.detailRow}>
            <Ionicons name="pricetag-outline" size={14} color={COLORS.softSlate} />
            <Text style={styles.detailText}>
              £{request.quotedPrice.toFixed(2)}/{request.pricingUnit === 'per_hour' ? 'hr' : 'day'}
            </Text>
          </View>
        )}

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
          <Text style={styles.headerTitle}>Requests</Text>
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
                  ? 'When a user requests your service, it will appear here.'
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
  safeArea: { flex: 1, backgroundColor: COLORS.deepNavy },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.lg, gap: SPACING.sm,
  },
  headerTitle: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold },
  pendingBadge: {
    backgroundColor: COLORS.coralRed, borderRadius: 12,
    minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 8,
  },
  pendingBadgeText: { color: '#fff', fontSize: 12, fontWeight: FONT_WEIGHTS.bold },

  // Tabs
  tabContainer: {
    flexDirection: 'row', paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.steelBlue,
  },
  tab: {
    paddingBottom: SPACING.md, marginRight: SPACING.xl,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: COLORS.electricTeal },
  tabText: { color: COLORS.softSlate, fontSize: 16, fontWeight: FONT_WEIGHTS.medium },
  activeTabText: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.semibold },
  scrollContent: { padding: SPACING.lg, flexGrow: 1 },

  // Request Card
  requestCard: {
    backgroundColor: COLORS.steelBlue, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  serviceTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serviceTagText: {
    color: COLORS.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.sm,
  },
  statusText: { fontSize: 12, fontWeight: FONT_WEIGHTS.semibold },
  serviceName: {
    color: COLORS.cloudWhite, fontSize: 17, fontWeight: FONT_WEIGHTS.semibold,
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
  avatarLetter: { color: COLORS.deepNavy, fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  requesterDetails: { flex: 1 },
  requesterName: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold },
  requesterContact: { color: COLORS.softSlate, fontSize: FONT_SIZES.small },

  // Details
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  detailText: { color: COLORS.softSlate, fontSize: FONT_SIZES.label },

  // Message
  messageBox: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm, marginTop: SPACING.sm,
  },
  messageLabel: { color: COLORS.softSlate, fontSize: 11, marginBottom: 2 },
  messageText: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.label },

  // Actions
  actionsContainer: { marginTop: SPACING.md },
  rejectInputWrapper: { marginBottom: SPACING.sm },
  rejectInput: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: COLORS.cloudWhite, fontSize: FONT_SIZES.label,
    borderWidth: 1, borderColor: COLORS.softSlate, minHeight: 60,
  },
  buttonRow: { flexDirection: 'row', gap: SPACING.sm },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: SPACING.md, borderWidth: 1, borderColor: COLORS.coralRed,
    borderRadius: BORDER_RADIUS.md,
  },
  rejectBtnText: { color: COLORS.coralRed, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.semibold },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: SPACING.md, backgroundColor: COLORS.electricTeal,
    borderRadius: BORDER_RADIUS.md,
  },
  acceptBtnText: { color: COLORS.deepNavy, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },
  btnDisabled: { opacity: 0.5 },

  // Empty
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  emptyTitle: {
    color: COLORS.cloudWhite, fontSize: 20, fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },
  emptySubtext: {
    color: COLORS.softSlate, fontSize: 14, textAlign: 'center', maxWidth: '80%', lineHeight: 20,
  },
});
