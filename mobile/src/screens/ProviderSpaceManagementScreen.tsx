import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, Switch,
  TextInput, Modal, KeyboardAvoidingView,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { providerApi } from '@/api';
import { searchLocationByPosition } from '@/api/amazonLocation';
import { getApiErrorMessage } from '@/utils/helpers';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';

interface SpaceStats {
  activeBookings: number;
  pendingRequests: number;
  completedBookings: number;
  totalRevenue: number;
  availableSpots: number;
}

interface ParkingSpace {
  _id: string;
  name: string;
  description?: string;
  postCode: string;
  hourlyRate: number;
  dailyRate?: number;
  totalSpots: number;
  occupiedSpots: number;
  isAvailable: boolean;
  isVerified: boolean;
  parkingType?: string;
  photos: string[];
  stats: SpaceStats;
}

interface Verification {
  _id: string;
  status: string;
  documents?: Record<string, any>;
  createdAt?: string;
  rejectionReason?: string;
}

export function ProviderSpaceManagementScreen() {
  const navigation = useNavigation<any>();
  const [spaces, setSpaces] = useState<ParkingSpace[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit modal state
  const [editModal, setEditModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState<ParkingSpace | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);

  const fetchSpaces = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setFetchError(null);
    try {
      const [spacesRes, verifRes] = await Promise.all([
        providerApi.getMySpaces(),
        providerApi.getVerificationStatus(),
      ]);
      if (spacesRes.data?.success) {
        setSpaces(spacesRes.data.data || []);
      }
      if (verifRes.data?.success && verifRes.data.data?.verifications) {
        setVerifications(verifRes.data.data.verifications);
      }
    } catch (err) {
      setFetchError(getApiErrorMessage(err, 'Could not load your parking spaces.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchSpaces(); }, []));

  const handleToggle = async (spaceId: string) => {
    setTogglingId(spaceId);
    try {
      const res = await providerApi.toggleSpaceAvailability(spaceId);
      if (res.data?.success) {
        Alert.alert('Updated', res.data.message);
        fetchSpaces();
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to toggle availability');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to toggle');
    } finally {
      setTogglingId(null);
    }
  };

  const openEditModal = (space: ParkingSpace) => {
    setEditingSpace(space);
    setEditForm({
      name: space.name || '',
      description: space.description || '',
      hourlyRate: String(space.hourlyRate || ''),
      dailyRate: String(space.dailyRate || ''),
      totalSpots: String(space.totalSpots || ''),
      parkingType: space.parkingType || '',
      address: (space as any).address || '',
      postCode: space.postCode || '',
    });
    setEditModal(true);
  };

  const handleUseCurrentLocation = async () => {
    setLocatingGps(true);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        Alert.alert('Location Permission', 'Please allow location access to auto-fill the address.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const result = await searchLocationByPosition(loc.coords.latitude, loc.coords.longitude);

      if (result) {
        const streetParts = [result.addressNumber, result.street].filter(Boolean).join(' ');
        const fullAddress = streetParts
          || [result.neighborhood, result.municipality].filter(Boolean).join(', ')
          || result.label;

        setEditForm(prev => ({
          ...prev,
          address: fullAddress,
          postCode: result.postalCode || prev.postCode || '',
        }));
      } else {
        Alert.alert('Could not find address', 'Please enter the address manually.');
      }
    } catch {
      Alert.alert('Location Error', 'Failed to get your current location. Please ensure GPS is enabled.');
    } finally {
      setLocatingGps(false);
    }
  };

  const handleSave = async () => {
    if (!editingSpace) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (editForm.name && editForm.name !== editingSpace.name) updates.name = editForm.name;
      if (editForm.description !== (editingSpace.description || '')) updates.description = editForm.description;
      if (editForm.hourlyRate && parseFloat(editForm.hourlyRate) !== editingSpace.hourlyRate) {
        updates.hourlyRate = parseFloat(editForm.hourlyRate);
      }
      if (editForm.dailyRate) {
        const newDaily = parseFloat(editForm.dailyRate);
        if (!isNaN(newDaily) && newDaily !== (editingSpace.dailyRate || 0)) {
          updates.dailyRate = newDaily;
        }
      }
      if (editForm.totalSpots && parseInt(editForm.totalSpots) !== editingSpace.totalSpots) {
        updates.totalSpots = parseInt(editForm.totalSpots);
      }
      if (editForm.address && editForm.address !== (editingSpace as any).address) {
        updates.address = editForm.address;
      }
      if (editForm.postCode && editForm.postCode !== editingSpace.postCode) {
        updates.postCode = editForm.postCode;
      }

      if (Object.keys(updates).length === 0) {
        setEditModal(false);
        return;
      }

      const res = await providerApi.updateSpace(editingSpace._id, updates);
      if (res.data?.success) {
        Alert.alert('Saved ✅', 'Your parking space has been updated.');
        setEditModal(false);
        fetchSpaces();
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to save changes');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Occupancy percentage for the bar
  const getOccupancyPercent = (space: ParkingSpace) => {
    if (!space.totalSpots) return 0;
    return Math.min(100, Math.round((space.occupiedSpots / space.totalSpots) * 100));
  };

  const getOccupancyColor = (percent: number) => {
    if (percent >= 90) return COLORS.coralRed;
    if (percent >= 60) return COLORS.amber;
    return COLORS.success;
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

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>My Parking Spaces</Text>
          <Text style={styles.headerSub}>
            {spaces.length} approved · {verifications.filter(v => v.status === 'pending').length} pending
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {fetchError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={COLORS.coralRed} />
            <Text style={styles.errorBannerText}>{fetchError}</Text>
            <TouchableOpacity onPress={() => fetchSpaces(true)}>
              <Text style={styles.retryLink}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pending Verifications Section */}
        {verifications.filter(v => v.status !== 'approved').length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Pending Verifications</Text>
            {verifications
              .filter(v => v.status !== 'approved')
              .map((v) => (
                <View key={v._id} style={styles.verifCard}>
                  <View style={styles.verifHeader}>
                    <Text style={styles.verifName}>
                      {v.documents?.parkName || 'Unnamed Park'}
                    </Text>
                    <View style={[
                      styles.verifBadge,
                      { backgroundColor: v.status === 'rejected' ? `${COLORS.coralRed}20` : `${COLORS.amber}20` },
                    ]}>
                      <Text style={[
                        styles.verifBadgeText,
                        { color: v.status === 'rejected' ? COLORS.coralRed : COLORS.amber },
                      ]}>
                        {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                  {v.documents?.parkPostcode && (
                    <Text style={styles.verifDetail}>{v.documents.parkPostcode}</Text>
                  )}
                  {v.rejectionReason && (
                    <Text style={styles.verifRejection}>Reason: {v.rejectionReason}</Text>
                  )}
                  {v.createdAt && (
                    <Text style={styles.verifDate}>
                      Submitted {new Date(v.createdAt).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              ))}
          </>
        )}

        {/* Approved Spaces Section */}
        {spaces.length > 0 && (
          <Text style={styles.sectionLabel}>Approved Spaces</Text>
        )}

        {spaces.length === 0 && verifications.filter(v => v.status !== 'approved').length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={64} color={COLORS.softSlate} />
            <Text style={styles.emptyTitle}>No Parking Spaces Yet</Text>
            <Text style={styles.emptySub}>
              Submit a parking verification to get started. Once approved by an admin, your spaces will appear here.
            </Text>
          </View>
        ) : spaces.length === 0 ? null : (
          spaces.map((space) => {
            const occupancyPct = getOccupancyPercent(space);
            const occColor = getOccupancyColor(occupancyPct);
            const isToggling = togglingId === space._id;

            return (
              <View key={space._id} style={styles.spaceCard}>
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.spaceName}>{space.name}</Text>
                    <Text style={styles.spacePostcode}>{space.postCode}</Text>
                  </View>
                  <View style={[
                    styles.availBadge,
                    { backgroundColor: space.isAvailable ? `${COLORS.success}20` : `${COLORS.coralRed}20` },
                  ]}>
                    <View style={[styles.availDot, { backgroundColor: space.isAvailable ? COLORS.success : COLORS.coralRed }]} />
                    <Text style={[styles.availText, { color: space.isAvailable ? COLORS.success : COLORS.coralRed }]}>
                      {space.isAvailable ? 'Live' : 'Paused'}
                    </Text>
                  </View>
                </View>

                {/* Occupancy Bar */}
                <View style={styles.occupancySection}>
                  <View style={styles.occupancyLabelRow}>
                    <Text style={styles.occupancyLabel}>Occupancy</Text>
                    <Text style={[styles.occupancyValue, { color: occColor }]}>
                      {space.occupiedSpots}/{space.totalSpots} spots
                    </Text>
                  </View>
                  <View style={styles.occupancyBarBg}>
                    <View style={[styles.occupancyBarFill, { width: `${occupancyPct}%`, backgroundColor: occColor }]} />
                  </View>
                  <Text style={styles.availSpotsText}>
                    {space.stats.availableSpots > 0
                      ? `${space.stats.availableSpots} spot${space.stats.availableSpots !== 1 ? 's' : ''} available`
                      : 'FULL — No spots available'}
                  </Text>
                </View>

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Ionicons name="time-outline" size={18} color={COLORS.amber} />
                    <Text style={styles.statValue}>{space.stats.pendingRequests}</Text>
                    <Text style={styles.statLabel}>Pending</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.success} />
                    <Text style={styles.statValue}>{space.stats.activeBookings}</Text>
                    <Text style={styles.statLabel}>Active</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="flag-outline" size={18} color={COLORS.info} />
                    <Text style={styles.statValue}>{space.stats.completedBookings}</Text>
                    <Text style={styles.statLabel}>Completed</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="cash-outline" size={18} color={COLORS.electricTeal} />
                    <Text style={styles.statValue}>£{(space.stats.totalRevenue || 0).toFixed(0)}</Text>
                    <Text style={styles.statLabel}>Revenue</Text>
                  </View>
                </View>

                {/* Pricing Row */}
                <View style={styles.pricingRow}>
                  <View style={styles.priceChip}>
                    <Text style={styles.priceChipLabel}>Hourly</Text>
                    <Text style={styles.priceChipValue}>£{space.hourlyRate?.toFixed(2)}</Text>
                  </View>
                  {space.dailyRate ? (
                    <View style={styles.priceChip}>
                      <Text style={styles.priceChipLabel}>Daily</Text>
                      <Text style={styles.priceChipValue}>£{space.dailyRate?.toFixed(2)}</Text>
                    </View>
                  ) : null}
                  <View style={styles.priceChip}>
                    <Text style={styles.priceChipLabel}>Type</Text>
                    <Text style={styles.priceChipValue}>{space.parkingType || 'N/A'}</Text>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => openEditModal(space)}
                  >
                    <Ionicons name="create-outline" size={18} color={COLORS.electricTeal} />
                    <Text style={styles.editBtnText}>Edit Details</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.toggleBtn, !space.isAvailable && styles.toggleBtnActive]}
                    onPress={() => handleToggle(space._id)}
                    disabled={isToggling}
                  >
                    {isToggling ? (
                      <ActivityIndicator size="small" color={space.isAvailable ? COLORS.coralRed : COLORS.success} />
                    ) : (
                      <>
                        <Ionicons
                          name={space.isAvailable ? 'pause-circle-outline' : 'play-circle-outline'}
                          size={18}
                          color={space.isAvailable ? COLORS.coralRed : COLORS.success}
                        />
                        <Text style={[styles.toggleBtnText, { color: space.isAvailable ? COLORS.coralRed : COLORS.success }]}>
                          {space.isAvailable ? 'Pause' : 'Resume'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Space</Text>
              <TouchableOpacity onPress={() => setEditModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              {/* Name */}
              <Text style={styles.fieldLabel}>Space Name</Text>
              <TextInput
                style={styles.input}
                value={editForm.name}
                onChangeText={(v) => setEditForm(p => ({ ...p, name: v }))}
                placeholder="Park name"
                placeholderTextColor={COLORS.softSlate}
              />

              {/* Location auto-fill */}
              <TouchableOpacity
                style={styles.useLocationBtn}
                onPress={handleUseCurrentLocation}
                disabled={locatingGps}
                activeOpacity={0.7}
              >
                {locatingGps ? (
                  <ActivityIndicator size="small" color={COLORS.electricTeal} />
                ) : (
                  <Ionicons name="locate" size={18} color={COLORS.electricTeal} />
                )}
                <Text style={styles.useLocationBtnText}>
                  {locatingGps ? 'Getting location...' : 'Use my current location'}
                </Text>
              </TouchableOpacity>

              {/* Address */}
              <Text style={styles.fieldLabel}>Address</Text>
              <TextInput
                style={styles.input}
                value={editForm.address}
                onChangeText={(v) => setEditForm(p => ({ ...p, address: v }))}
                placeholder="Street address"
                placeholderTextColor={COLORS.softSlate}
              />

              {/* Postcode */}
              <Text style={styles.fieldLabel}>Postcode</Text>
              <TextInput
                style={styles.input}
                value={editForm.postCode}
                onChangeText={(v) => setEditForm(p => ({ ...p, postCode: v }))}
                placeholder="e.g. SW1A 1AA"
                placeholderTextColor={COLORS.softSlate}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, { minHeight: 70 }]}
                value={editForm.description}
                onChangeText={(v) => setEditForm(p => ({ ...p, description: v }))}
                placeholder="Describe your space"
                placeholderTextColor={COLORS.softSlate}
                multiline
              />

              {/* Hourly Rate */}
              <Text style={styles.fieldLabel}>Hourly Rate (£)</Text>
              <TextInput
                style={styles.input}
                value={editForm.hourlyRate}
                onChangeText={(v) => setEditForm(p => ({ ...p, hourlyRate: v }))}
                placeholder="e.g. 3.50"
                placeholderTextColor={COLORS.softSlate}
                keyboardType="decimal-pad"
              />

              {/* Daily Rate */}
              <Text style={styles.fieldLabel}>Daily Rate (£)</Text>
              <TextInput
                style={styles.input}
                value={editForm.dailyRate}
                onChangeText={(v) => setEditForm(p => ({ ...p, dailyRate: v }))}
                placeholder="e.g. 15.00"
                placeholderTextColor={COLORS.softSlate}
                keyboardType="decimal-pad"
              />

              {/* Total Spots */}
              <Text style={styles.fieldLabel}>Total Capacity</Text>
              <TextInput
                style={styles.input}
                value={editForm.totalSpots}
                onChangeText={(v) => setEditForm(p => ({ ...p, totalSpots: v }))}
                placeholder="e.g. 10"
                placeholderTextColor={COLORS.softSlate}
                keyboardType="number-pad"
              />
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: COLORS.textPrimary, fontSize: 22, fontWeight: FONT_WEIGHTS.bold },
  headerSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },

  scrollContent: { padding: SPACING.lg, paddingBottom: 40 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderRadius: BORDER_RADIUS.md,
  },
  errorBannerText: { flex: 1, color: COLORS.coralRed, fontSize: 13 },
  retryLink: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.bold, fontSize: 13 },

  // Section label
  sectionLabel: {
    color: COLORS.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md, marginTop: SPACING.sm,
  },

  // Verification cards
  verifCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  verifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  verifName: { color: COLORS.textPrimary, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold, flex: 1 },
  verifBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  verifBadgeText: { fontSize: 11, fontWeight: FONT_WEIGHTS.bold },
  verifDetail: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  verifRejection: { color: COLORS.coralRed, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  verifDate: { color: COLORS.textTertiary, fontSize: 11, marginTop: 4 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold, marginTop: SPACING.lg },
  emptySub: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginTop: SPACING.sm, maxWidth: '80%', lineHeight: 20 },

  // Space Card
  spaceCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.md },
  spaceName: { color: COLORS.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold },
  spacePostcode: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },

  availBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  availDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  availText: { fontSize: 12, fontWeight: FONT_WEIGHTS.bold },

  // Occupancy
  occupancySection: { marginBottom: SPACING.md },
  occupancyLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  occupancyLabel: { color: COLORS.textSecondary, fontSize: 13 },
  occupancyValue: { fontSize: 13, fontWeight: FONT_WEIGHTS.bold },
  occupancyBarBg: {
    height: 10, borderRadius: 5, backgroundColor: COLORS.surfaceAlt,
    overflow: 'hidden', marginBottom: 4,
  },
  occupancyBarFill: { height: '100%', borderRadius: 5 },
  availSpotsText: { color: COLORS.textSecondary, fontSize: 12 },

  // Stats
  statsGrid: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  statItem: {
    flex: 1, backgroundColor: COLORS.surfaceAlt, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, alignItems: 'center',
  },
  statValue: { color: COLORS.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold, marginTop: 4 },
  statLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },

  // Pricing
  pricingRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  priceChip: {
    flex: 1, backgroundColor: `${COLORS.electricTeal}10`, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, alignItems: 'center',
    borderWidth: 1, borderColor: `${COLORS.electricTeal}30`,
  },
  priceChipLabel: { color: COLORS.textSecondary, fontSize: 11 },
  priceChipValue: { color: COLORS.electricTeal, fontSize: 15, fontWeight: FONT_WEIGHTS.bold, marginTop: 2 },

  // Actions
  actionRow: { flexDirection: 'row', gap: SPACING.sm },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.electricTeal, backgroundColor: COLORS.background,
  },
  editBtnText: { color: COLORS.electricTeal, fontSize: 14, fontWeight: FONT_WEIGHTS.bold },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  toggleBtnActive: { borderColor: COLORS.success },
  toggleBtnText: { fontSize: 14, fontWeight: FONT_WEIGHTS.bold },

  // Modal
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.xl, paddingBottom: SPACING['2xl'],
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
  useLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: `${COLORS.electricTeal}10`,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: `${COLORS.electricTeal}30`,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  useLocationBtnText: {
    color: COLORS.electricTeal,
    fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: FONT_WEIGHTS.medium, marginBottom: 6, marginTop: SPACING.md },
  input: {
    backgroundColor: COLORS.surfaceAlt, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    color: COLORS.textPrimary, fontSize: 15,
    borderWidth: 1, borderColor: COLORS.border,
  },
  saveBtn: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 16, alignItems: 'center', marginTop: SPACING.xl,
    shadowColor: COLORS.electricTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
});
