import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert,
  SafeAreaView, Platform, Modal, TextInput, Linking, Image, useWindowDimensions, ScrollView,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { adminApi } from '@/api';
import { Ionicons } from '@expo/vector-icons';
import { useAdminDashboardBack } from '@/components/admin/AdminScreenLayout';

type DetailField = { label: string; value: string | undefined | null };

const PARKING_TEXT_FIELDS: { key: string; label: string; section: string }[] = [
  { key: 'parkName', label: 'Park Name', section: 'Park Details' },
  { key: 'parkAddress', label: 'Park Address', section: 'Park Details' },
  { key: 'parkPostcode', label: 'Park Postcode', section: 'Park Details' },
  { key: 'description', label: 'Description', section: 'Park Details' },
  { key: 'parkingType', label: 'Parking Type', section: 'Park Details' },
  { key: 'totalSpots', label: 'Total Capacity', section: 'Capacity & Pricing' },
  { key: 'hourlyRate', label: 'Hourly Rate (£)', section: 'Capacity & Pricing' },
  { key: 'dailyRate', label: 'Daily Rate (£)', section: 'Capacity & Pricing' },
  { key: 'chargesDescription', label: 'Charges Structure', section: 'Capacity & Pricing' },
  { key: 'bookingMethods', label: 'Booking Methods', section: 'Availability & Rules' },
  { key: 'acceptedVehicles', label: 'Accepted Vehicles', section: 'Availability & Rules' },
  { key: 'maxStayDetails', label: 'Max Stay Rules', section: 'Availability & Rules' },
  { key: 'openingTimes', label: 'Opening Times', section: 'Availability & Rules' },
];

function getPhotoUrls(docs: Record<string, any>, key: 'parkPhotos' | 'cctvPhotos'): string[] {
  const val = docs[key];
  if (Array.isArray(val)) return val.filter((u: unknown) => typeof u === 'string' && u);
  if (typeof val === 'string' && val) return [val];
  const legacy = key === 'parkPhotos' ? docs.parkPhotoUrl : docs.cctvPhotoUrl;
  return legacy ? [legacy] : [];
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function PresignedImage({ url, style }: { url: string; style?: any }) {
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminApi.getPresignedUrl(url);
        if (!cancelled) setPresignedUrl(res.data?.url || url);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (error) {
    return (
      <View style={[style, { justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surfaceAlt }]}>
        <Ionicons name="image-outline" size={24} color={COLORS.textTertiary} />
      </View>
    );
  }

  if (!presignedUrl) {
    return (
      <View style={[style, { justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surfaceAlt }]}>
        <ActivityIndicator size="small" color={COLORS.electricTeal} />
      </View>
    );
  }

  return <Image source={{ uri: presignedUrl }} style={style} resizeMode="cover" />;
}

function DetailRow({ label, value }: DetailField) {
  const display = formatValue(value);
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value} selectable>{display}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    marginBottom: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  label: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  value: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.label,
    lineHeight: 20,
  },
});

export function AdminVerificationQueueScreen() {
  const goToDashboard = useAdminDashboardBack();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - SPACING.md * 2;

  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchVerifications();
  }, []);

  const fetchVerifications = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getPendingParkingVerifications();
      if (res.data?.success) {
        setVerifications(res.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openDocument = async (url: string) => {
    if (!url) return;
    try {
      const res = await adminApi.getPresignedUrl(url);
      const presigned = res.data?.url || url;
      await Linking.openURL(presigned);
    } catch {
      Alert.alert('Error', 'Cannot open document');
    }
  };

  const handeApprove = async (id: string, name: string) => {
    Alert.alert(
      'Approve Parking Provider',
      `Are you sure you want to approve ${name}'s parking application? This will create their live searching Parking Space.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              setProcessingId(id);
              const res = await adminApi.approveParkingVerification(id);
              if (res.data?.success) {
                Alert.alert('Success!', 'Provider approved and Parking Space created successfully.');
                setExpandedIds(prev => {
                  const next = new Set(prev);
                  next.delete(id);
                  return next;
                });
                fetchVerifications();
              } else {
                Alert.alert('Error', res.data?.message || 'Something went wrong');
              }
            } catch {
              Alert.alert('Error', 'Failed to process approval.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = (id: string, name: string) => {
    setRejectModal({ id, name });
    setRejectionReason('');
  };

  const submitRejection = async () => {
    if (!rejectModal || !rejectionReason.trim()) {
      Alert.alert('Error', 'Please provide a rejection reason');
      return;
    }

    try {
      setProcessingId(rejectModal.id);
      const res = await adminApi.rejectParkingVerification(rejectModal.id, rejectionReason);
      if (res.data?.success) {
        Alert.alert('Done', 'Parking provider has been rejected and notified via email and push notification.');
        setRejectModal(null);
        fetchVerifications();
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to reject');
      }
    } catch {
      Alert.alert('Error', 'Failed to reject parking provider.');
    } finally {
      setProcessingId(null);
    }
  };

  const buildSections = (item: any): { title: string; fields: DetailField[] }[] => {
    const docs = item.documents || {};
    const userName = `${item.user?.firstName || ''} ${item.user?.lastName || ''}`.trim() || 'Unknown';
    const w3w = item.location?.what3words;

    const providerFields: DetailField[] = [
      { label: 'Full Name', value: userName },
      { label: 'Email', value: item.user?.email },
      { label: 'Phone', value: item.user?.phoneNumber },
      {
        label: 'Submitted',
        value: item.createdAt ? new Date(item.createdAt).toLocaleString() : undefined,
      },
    ];

    const sections: { title: string; fields: DetailField[] }[] = [
      { title: 'Provider', fields: providerFields },
    ];

    const fieldsBySection = new Map<string, DetailField[]>();
    for (const { key, label, section } of PARKING_TEXT_FIELDS) {
      const fromDocs = docs[key];
      const fallback =
        key === 'parkAddress' ? item.address :
        key === 'parkPostcode' ? item.postcode :
        undefined;
      const value = fromDocs ?? fallback;
      if (!fieldsBySection.has(section)) fieldsBySection.set(section, []);
      fieldsBySection.get(section)!.push({ label, value: formatValue(value) });
    }

    fieldsBySection.forEach((fields, title) => {
      sections.push({ title, fields });
    });

    if (w3w) {
      sections.push({
        title: 'Location',
        fields: [{ label: 'what3words', value: w3w }],
      });
    }

    return sections;
  };

  const renderPhotoGrid = (urls: string[], label: string) => {
    if (!urls.length) {
      return (
        <View style={styles.photoBlock}>
          <Text style={styles.photoBlockTitle}>{label}</Text>
          <Text style={styles.photoMissing}>Not uploaded</Text>
        </View>
      );
    }

    return (
      <View style={styles.photoBlock}>
        <Text style={styles.photoBlockTitle}>{label} ({urls.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
          {urls.map((url, idx) => (
            <TouchableOpacity key={`${url}-${idx}`} onPress={() => openDocument(url)} activeOpacity={0.85}>
              <PresignedImage url={url} style={styles.photoThumb} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const isProcessing = processingId === item._id;
    const isExpanded = expandedIds.has(item._id);
    const userName = `${item.user?.firstName || ''} ${item.user?.lastName || ''}`.trim();
    const docs = item.documents || {};
    const parkName = docs.parkName || 'Unnamed parking application';
    const postcode = docs.parkPostcode || item.postcode || '—';
    const sections = buildSections(item);
    const parkPhotos = getPhotoUrls(docs, 'parkPhotos');
    const cctvPhotos = getPhotoUrls(docs, 'cctvPhotos');

    return (
      <View style={[styles.card, { width: cardWidth }]}>
        <TouchableOpacity
          style={styles.cardHeaderTouchable}
          onPress={() => toggleExpanded(item._id)}
          activeOpacity={0.75}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderMain}>
              <Text style={styles.title} numberOfLines={isExpanded ? undefined : 2}>{parkName}</Text>
              <Text style={styles.summaryLine} numberOfLines={1}>
                {userName} · {postcode}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>PENDING</Text>
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={COLORS.textTertiary}
              />
            </View>
          </View>
          {!isExpanded && (
            <Text style={styles.expandHint}>Tap to view full application details</Text>
          )}
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedBody}>
            {sections.map(section => (
              <View key={section.title} style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.fields.map(field => (
                  <DetailRow key={`${section.title}-${field.label}`} label={field.label} value={field.value} />
                ))}
              </View>
            ))}

            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Photos & Security</Text>
              {renderPhotoGrid(parkPhotos, 'Parking space photos')}
              {renderPhotoGrid(cctvPhotos, 'CCTV / security photos')}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.rejectBtn, isProcessing && styles.btnDisabled]}
                disabled={isProcessing}
                onPress={() => handleReject(item._id, userName)}
              >
                <Ionicons name="close" size={18} color={COLORS.error} />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.approveBtn, isProcessing && styles.btnDisabled]}
                disabled={isProcessing}
                onPress={() => handeApprove(item._id, userName)}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#FFF" />
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </>
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
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={goToDashboard}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Verification Queue</Text>
          <Text style={styles.headerSub}>
            {verifications.length} pending · expand each card to review all submitted details
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
          <Text style={styles.loadingText}>Fetching pending applications...</Text>
        </View>
      ) : verifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="checkmark-circle-outline" size={64} color={COLORS.success} />
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptySub}>There are no pending applications.</Text>
        </View>
      ) : (
        <FlatList
          data={verifications}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={!!rejectModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rejection Reason</Text>
              <TouchableOpacity onPress={() => setRejectModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Provide detailed feedback for {rejectModal?.name}
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="e.g., Poor property photos, insufficient parking spaces, location issues..."
              placeholderTextColor={COLORS.textTertiary}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRejectModal(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, !rejectionReason.trim() && styles.submitBtnDisabled]}
                onPress={submitRejection}
                disabled={!rejectionReason.trim()}
              >
                <Text style={styles.submitBtnText}>Send Rejection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
  },
  headerSub: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    marginTop: 4,
    lineHeight: 18,
  },
  listContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  cardHeaderTouchable: {
    padding: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardHeaderMain: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  summaryLine: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  expandHint: {
    color: COLORS.electricTeal,
    fontSize: 12,
    marginTop: SPACING.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  statusBadge: {
    backgroundColor: 'rgba(243, 156, 18, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: COLORS.amber,
    fontSize: 10,
    fontWeight: 'bold',
  },
  expandedBody: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionBlock: {
    marginTop: SPACING.md,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.sm,
  },
  photoBlock: {
    marginBottom: SPACING.md,
  },
  photoBlockTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  photoMissing: {
    color: COLORS.error,
    fontSize: 12,
    fontStyle: 'italic',
  },
  photoScroll: {
    flexGrow: 0,
  },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: BORDER_RADIUS.md,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  approveBtnText: {
    color: '#FFF',
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.md,
  },
  emptySub: {
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error,
    backgroundColor: `${COLORS.error}08`,
  },
  rejectBtnText: {
    color: COLORS.error,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.xl,
    paddingBottom: 40,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.label,
    marginBottom: SPACING.lg,
  },
  reasonInput: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: SPACING.xl,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: `${COLORS.textTertiary}15`,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: FONT_SIZES.label,
  },
  submitBtn: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.error,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFF',
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: FONT_SIZES.label,
  },
});
