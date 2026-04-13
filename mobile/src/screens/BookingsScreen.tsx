import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, SafeAreaView, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { bookingsApi } from '@/api';
import { useFocusEffect } from '@react-navigation/native';

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { color: COLORS.amber, label: 'Pending', icon: 'time-outline' },
  accepted: { color: COLORS.success, label: 'Accepted', icon: 'checkmark-circle-outline' },
  rejected: { color: COLORS.coralRed, label: 'Rejected', icon: 'close-circle-outline' },
  cancelled: { color: COLORS.softSlate, label: 'Cancelled', icon: 'ban-outline' },
  completed: { color: COLORS.info, label: 'Completed', icon: 'trophy-outline' },
};

export function BookingsScreen() {
  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBookings = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await bookingsApi.getMyBookings();
      if (response.data?.success) {
        setBookings(response.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch bookings:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Reload when screen is focused
  useFocusEffect(
    useCallback(() => {
      fetchBookings();
    }, [])
  );

  const handleCancelBooking = (bookingId: string) => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await bookingsApi.cancelBooking(bookingId);
              if (res.data?.success) {
                Alert.alert('Cancelled', 'Your booking has been cancelled');
                fetchBookings();
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to cancel');
              }
            } catch (err) {
              Alert.alert('Error', 'Failed to cancel booking');
            }
          },
        },
      ],
    );
  };

  const activeBookings = bookings.filter(b => ['pending', 'accepted'].includes(b.status));
  const pastBookings = bookings.filter(b => ['rejected', 'cancelled', 'completed'].includes(b.status));
  const displayBookings = activeTab === 'active' ? activeBookings : pastBookings;

  const renderBookingCard = (booking: any) => {
    const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
    const providerName = booking.provider?.firstName
      ? `${booking.provider.firstName} ${booking.provider.lastName}`
      : 'Provider';
    const date = booking.createdAt ? new Date(booking.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    }) : '';

    return (
      <View key={booking._id} style={styles.bookingCard}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.serviceTag}>
            <Ionicons
              name={booking.serviceType === 'parking' ? 'car-sport' : booking.serviceType === 'driver' ? 'person' : 'navigate'}
              size={16}
              color={COLORS.electricTeal}
            />
            <Text style={styles.serviceTagText}>
              {booking.serviceType === 'parking' ? 'Parking' : booking.serviceType === 'driver' ? 'Driver' : 'Taxi'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusCfg.color}20` }]}>
            <Ionicons name={statusCfg.icon} size={14} color={statusCfg.color} />
            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>

        {/* Service name */}
        <Text style={styles.serviceName}>{booking.serviceName || 'Service'}</Text>

        {/* Details */}
        <View style={styles.detailRow}>
          <Ionicons name="person-outline" size={14} color={COLORS.softSlate} />
          <Text style={styles.detailText}>{providerName}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.softSlate} />
          <Text style={styles.detailText}>Requested {date}</Text>
        </View>
        {booking.quotedPrice != null && (
          <View style={styles.detailRow}>
            <Ionicons name="pricetag-outline" size={14} color={COLORS.softSlate} />
            <Text style={styles.detailText}>£{booking.quotedPrice.toFixed(2)}/{booking.pricingUnit === 'per_hour' ? 'hr' : 'day'}</Text>
          </View>
        )}

        {/* Response message from provider */}
        {booking.responseMessage && (
          <View style={styles.responseBox}>
            <Text style={styles.responseLabel}>Provider's response:</Text>
            <Text style={styles.responseText}>{booking.responseMessage}</Text>
          </View>
        )}

        {/* Cancel button for active bookings */}
        {['pending', 'accepted'].includes(booking.status) && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancelBooking(booking._id)}
          >
            <Ionicons name="close" size={16} color={COLORS.coralRed} />
            <Text style={styles.cancelBtnText}>Cancel Booking</Text>
          </TouchableOpacity>
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

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'active' && styles.activeTab]}
            onPress={() => setActiveTab('active')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
              Active ({activeBookings.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'past' && styles.activeTab]}
            onPress={() => setActiveTab('past')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'past' && styles.activeTabText]}>
              Past ({pastBookings.length})
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchBookings(true)} tintColor={COLORS.electricTeal} />
          }
        >
          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={COLORS.electricTeal} />
            </View>
          ) : displayBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.iconCircle}>
                <Ionicons name="calendar-outline" size={48} color={COLORS.electricTeal} />
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
            displayBookings.map(renderBookingCard)
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
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  headerTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold,
  },
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
  activeTabText: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.semibold },
  scrollContent: { padding: SPACING.lg, flexGrow: 1 },

  // Booking Card
  bookingCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  serviceTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  serviceTagText: {
    color: COLORS.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.sm,
  },
  statusText: { fontSize: 12, fontWeight: FONT_WEIGHTS.bold },
  serviceName: {
    color: COLORS.textPrimary, fontSize: 17, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4,
  },
  detailText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.label },

  // Response
  responseBox: {
    backgroundColor: COLORS.surfaceAlt, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, marginTop: SPACING.sm,
  },
  responseLabel: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 2 },
  responseText: { color: COLORS.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium },

  // Cancel
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.coralRed, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
  },
  cancelBtnText: { color: COLORS.coralRed, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },

  // Empty
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(0, 180, 160, 0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl,
  },
  emptyStateTitle: {
    color: COLORS.textPrimary, fontSize: 22, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md, textAlign: 'center',
  },
  emptyStateSubtext: {
    color: COLORS.textSecondary, fontSize: 16, textAlign: 'center', maxWidth: '85%', lineHeight: 24,
  },
});
