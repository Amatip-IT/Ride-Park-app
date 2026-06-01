import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView, Platform, Linking,
  Modal, TextInput,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { adminApi } from '@/api';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

// Human-readable labels for each doc field
const DOC_LABELS: Record<string, string> = {
  natInsuranceUrl: 'National Insurance',
  vatCertUrl: 'VAT Certificate',
  dvlaLicenceUrl: 'DVLA Driving Licence',
  bankStatementUrl: 'Bank Statement',
  dvlaCheckCodeUrl: 'DVLA Check Code',
  phvDriverLicenceUrl: 'PHV Driver Licence',
  profilePhotoUrl: 'Profile Photo',
  phvlUrl: 'PHV Licence (PHVL)',
  v5cUrl: 'V5C Logbook',
  insuranceUrl: 'Insurance Certificate',
  vehicleInspectionUrl: 'Vehicle Inspection',
};

const ALL_DOC_FIELDS = Object.keys(DOC_LABELS);

const STATUS_FILTERS = [
  { id: 'pending_admin_review', label: 'Pending' },
  { id: 'all', label: 'All' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'waiting', label: 'Longest Wait' },
  { id: 'completeness', label: 'Most Complete' },
  { id: 'name', label: 'Name A-Z' },
];

const selectionKey = (id: string, providerType: string) => `${id}:${providerType}`;

export function AdminDriverQueueScreen() {
  const navigation = useNavigation<any>();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{id: string; providerType: string; name: string; docField?: string; bulk?: boolean} | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending_admin_review');
  const [providerFilter, setProviderFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [messageModal, setMessageModal] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);

  useEffect(() => {
    fetchRecords();
  }, [statusFilter, providerFilter, sortBy]);

  const fetchRecords = async (query = searchQuery) => {
    try {
      setLoading(true);
      const useSearch = query.trim() || statusFilter !== 'pending_admin_review' || providerFilter || sortBy !== 'newest';
      const res = useSearch
        ? await adminApi.searchDriverVerifications({
            q: query.trim() || undefined,
            status: statusFilter,
            providerType: providerFilter || undefined,
            sort: sortBy,
          })
        : await adminApi.getPendingDriverVerifications();
      if (res.data?.success) {
        setRecords(res.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch driver verifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string, providerType: string) => {
    const key = selectionKey(id, providerType);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedKeys(new Set(records.map(r => selectionKey(r._id, r.providerType || 'driver'))));
  };

  const clearSelection = () => setSelectedKeys(new Set());

  const getSelectedItems = () =>
    records
      .filter(r => selectedKeys.has(selectionKey(r._id, r.providerType || 'driver')))
      .map(r => ({ recordId: r._id, providerType: r.providerType || 'driver' }));

  const handleBulkApprove = () => {
    const items = getSelectedItems();
    if (!items.length) return;

    Alert.alert(
      'Bulk Approve',
      `Approve ${items.length} selected driver(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve All',
          onPress: async () => {
            try {
              setBulkProcessing(true);
              const res = await adminApi.bulkApproveDrivers(items);
              Alert.alert('Done', res.data?.message || 'Bulk approve complete');
              clearSelection();
              fetchRecords();
            } catch {
              Alert.alert('Error', 'Bulk approve failed');
            } finally {
              setBulkProcessing(false);
            }
          },
        },
      ],
    );
  };

  const handleBulkReject = () => {
    if (!selectedKeys.size) return;
    setRejectModal({ id: '', providerType: '', name: `${selectedKeys.size} drivers`, bulk: true });
    setRejectionReason('');
  };

  const handleBulkMessage = async () => {
    if (!bulkMessage.trim()) {
      Alert.alert('Message Required', 'Enter a message to send.');
      return;
    }
    const items = getSelectedItems();
    try {
      setBulkProcessing(true);
      const res = await adminApi.bulkMessageDrivers(items, bulkMessage.trim());
      Alert.alert('Done', res.data?.message || 'Messages sent');
      setMessageModal(false);
      setBulkMessage('');
      clearSelection();
    } catch {
      Alert.alert('Error', 'Failed to send messages');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleApproveDoc = async (id: string, providerType: string, docField: string, docLabel: string) => {
    try {
      setProcessingId(`${id}-${docField}`);
      const res = await adminApi.approveDocumentField(id, providerType, docField);
      if (res.data?.success) {
        Alert.alert('Success!', `${docLabel} approved.`);
        fetchRecords();
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to approve document');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to approve document');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectDoc = (id: string, providerType: string, docField: string, docLabel: string) => {
    setRejectModal({ id, providerType, name: docLabel, docField });
    setRejectionReason('');
  };

  const handleApprove = (id: string, providerType: string, name: string) => {
    Alert.alert(
      'Approve Driver',
      `Are you sure you want to approve ${name}? They will be able to accept rides.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              setProcessingId(id);
              const res = await adminApi.approveDriverVerification(id, providerType);
              if (res.data?.success) {
                Alert.alert('Success!', res.data.message || 'Driver approved.');
                fetchRecords();
              } else {
                Alert.alert('Error', res.data?.message || 'Something went wrong');
              }
            } catch (err) {
              Alert.alert('Error', 'Failed to approve driver.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = (id: string, providerType: string, name: string) => {
    setRejectModal({ id, providerType, name });
    setRejectionReason('');
  };

  const submitRejection = async () => {
    if (!rejectModal || !rejectionReason.trim()) {
      Alert.alert('Error', 'Please provide a rejection reason');
      return;
    }

    try {
      setProcessingId(rejectModal.docField ? `${rejectModal.id}-${rejectModal.docField}` : rejectModal.id);

      if (rejectModal.bulk) {
        const res = await adminApi.bulkRejectDrivers(getSelectedItems(), rejectionReason);
        Alert.alert('Done', res.data?.message || 'Bulk rejection complete');
        clearSelection();
      } else if (rejectModal.docField) {
        // Per-document rejection
        const res = await adminApi.rejectDocumentField(
          rejectModal.id,
          rejectModal.providerType,
          rejectModal.docField,
          rejectionReason
        );
        if (res.data?.success) {
          Alert.alert('Done', `${rejectModal.name} has been rejected and driver notified.`);
        } else {
          Alert.alert('Error', res.data?.message || 'Failed to reject document');
        }
      } else {
        // Overall driver rejection
        await adminApi.rejectDriverVerification(
          rejectModal.id,
          rejectModal.providerType,
          rejectionReason
        );
        Alert.alert('Done', 'Driver has been rejected and notified via email and push notification.');
      }
      setRejectModal(null);
      fetchRecords();
    } catch (err) {
      Alert.alert('Error', 'Failed to reject.');
    } finally {
      setProcessingId(null);
    }
  };

  const openDocument = (url: string) => {
    if (url) Linking.openURL(url).catch(() => Alert.alert('Error', 'Cannot open document'));
  };

  const renderItem = ({ item }: { item: any }) => {
    const isProcessing = processingId === item._id;
    const userData = item.user || {};
    const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown';
    const providerType = item.providerType || 'driver';
    const roleLabel = providerType === 'taxi_driver' ? 'Taxi Driver' : 'Chauffeur';
    const isSelected = selectedKeys.has(selectionKey(item._id, providerType));

    // Count uploaded documents
    const uploadedDocs = ALL_DOC_FIELDS.filter(f => item[f]);
    const totalDocs = ALL_DOC_FIELDS.length;

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={[styles.checkbox, isSelected && styles.checkboxSelected]}
            onPress={() => toggleSelection(item._id, providerType)}
          >
            {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
          </TouchableOpacity>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {(userData.firstName?.[0] || '?').toUpperCase()}
              {(userData.lastName?.[0] || '').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nameText}>{fullName}</Text>
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{(item.status || 'PENDING').toUpperCase().replace(/_/g, ' ')}</Text>
          </View>
        </View>

        {/* Contact */}
        <View style={styles.detailRow}>
          <Ionicons name="mail-outline" size={15} color={COLORS.textTertiary} />
          <Text style={styles.detailText}>{userData.email || 'No email'}</Text>
        </View>
        {userData.phoneNumber && (
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={15} color={COLORS.textTertiary} />
            <Text style={styles.detailText}>{userData.phoneNumber}</Text>
          </View>
        )}

        {/* Document progress */}
        <View style={styles.progressRow}>
          <Ionicons name="documents-outline" size={16} color={COLORS.electricTeal} />
          <Text style={styles.progressText}>
            {uploadedDocs.length} of {totalDocs} documents uploaded
          </Text>
        </View>

        {/* Individual documents section */}
        <Text style={styles.documentsSectionTitle}>Documents</Text>
        {ALL_DOC_FIELDS.map(field => {
          const hasDoc = !!item[field];
          const docStatus = item.documentStatuses?.[field];
          const label = DOC_LABELS[field] || field;
          const isProcessingDoc = processingId === `${item._id}-${field}`;

          if (!hasDoc) {
            return (
              <View key={field} style={[styles.docRow, styles.docRowMissing]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docLabel}>{label}</Text>
                  <Text style={styles.docMissingText}>Not uploaded</Text>
                </View>
              </View>
            );
          }

          return (
            <View key={field} style={[styles.docRow, styles.docRowUploaded]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docLabel}>{label}</Text>
                {docStatus?.status && (
                  <Text style={[
                    styles.docStatusText,
                    docStatus.status === 'verified' && { color: COLORS.success },
                    docStatus.status === 'rejected' && { color: COLORS.error },
                    docStatus.status === 'uploaded' && { color: COLORS.amber },
                  ]}>
                    Status: {docStatus.status}
                  </Text>
                )}
                {docStatus?.rejectionReason && (
                  <Text style={styles.docRejectionText}>
                    Reason: {docStatus.rejectionReason}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.docViewBtn, isProcessingDoc && styles.btnDisabled]}
                onPress={() => openDocument(item[field])}
              >
                <Ionicons name="eye-outline" size={16} color={COLORS.info} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.docApproveBtn, isProcessingDoc && styles.btnDisabled]}
                disabled={isProcessingDoc}
                onPress={() => handleApproveDoc(item._id, providerType, field, label)}
              >
                <Ionicons name="checkmark" size={16} color={COLORS.success} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.docRejectBtn, isProcessingDoc && styles.btnDisabled]}
                disabled={isProcessingDoc}
                onPress={() => handleRejectDoc(item._id, providerType, field, label)}
              >
                <Ionicons name="close" size={16} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Date */}
        <Text style={styles.dateText}>
          Last updated: {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : 'N/A'}
        </Text>

        {/* Overall action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.rejectBtn, isProcessing && styles.btnDisabled]}
            disabled={isProcessing}
            onPress={() => handleReject(item._id, providerType, fullName)}
          >
            <Ionicons name="close" size={18} color={COLORS.error} />
            <Text style={styles.rejectBtnText}>Reject All</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.approveBtn, isProcessing && styles.btnDisabled]}
            disabled={isProcessing}
            onPress={() => handleApprove(item._id, providerType, fullName)}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#FFF" />
                <Text style={styles.approveBtnText}>Approve All</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Driver Verifications</Text>
          <Text style={styles.headerSub}>
            {records.length} record{records.length !== 1 ? 's' : ''}
            {selectedKeys.size > 0 ? ` · ${selectedKeys.size} selected` : ''}
          </Text>
        </View>
        {records.length > 0 && (
          <TouchableOpacity style={styles.selectAllBtn} onPress={selectedKeys.size === records.length ? clearSelection : selectAll}>
            <Text style={styles.selectAllText}>
              {selectedKeys.size === records.length ? 'Clear' : 'Select All'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={18} color={COLORS.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, email, phone..."
            placeholderTextColor={COLORS.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => fetchRecords()}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={() => fetchRecords()}>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterScroll}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterChip, statusFilter === f.id && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.id)}
          >
            <Text style={[styles.filterChipText, statusFilter === f.id && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.filterChip, providerFilter === 'driver' && styles.filterChipActive]}
          onPress={() => setProviderFilter(providerFilter === 'driver' ? '' : 'driver')}
        >
          <Text style={[styles.filterChipText, providerFilter === 'driver' && styles.filterChipTextActive]}>Chauffeur</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, providerFilter === 'taxi_driver' && styles.filterChipActive]}
          onPress={() => setProviderFilter(providerFilter === 'taxi_driver' ? '' : 'taxi_driver')}
        >
          <Text style={[styles.filterChipText, providerFilter === 'taxi_driver' && styles.filterChipTextActive]}>Taxi</Text>
        </TouchableOpacity>
        {SORT_OPTIONS.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[styles.filterChip, sortBy === s.id && styles.filterChipActive]}
            onPress={() => setSortBy(s.id)}
          >
            <Text style={[styles.filterChipText, sortBy === s.id && styles.filterChipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
          <Text style={styles.loadingText}>Loading submissions...</Text>
        </View>
      ) : records.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="checkmark-done-circle-outline" size={64} color={COLORS.success} />
          <Text style={styles.emptyTitle}>All Clear!</Text>
          <Text style={styles.emptySub}>No pending driver verifications to review.</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContainer, selectedKeys.size > 0 && { paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {selectedKeys.size > 0 && (
        <View style={styles.bulkBar}>
          <TouchableOpacity style={styles.bulkBtn} onPress={handleBulkApprove} disabled={bulkProcessing}>
            <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.success} />
            <Text style={styles.bulkBtnText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bulkBtn} onPress={handleBulkReject} disabled={bulkProcessing}>
            <Ionicons name="close-circle-outline" size={18} color={COLORS.error} />
            <Text style={styles.bulkBtnText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bulkBtn} onPress={() => setMessageModal(true)} disabled={bulkProcessing}>
            <Ionicons name="mail-outline" size={18} color={COLORS.info} />
            <Text style={styles.bulkBtnText}>Message</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bulk Message Modal */}
      <Modal visible={messageModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bulk Message</Text>
              <TouchableOpacity onPress={() => setMessageModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Send a message to {selectedKeys.size} selected driver(s)
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Enter your message..."
              placeholderTextColor={COLORS.textTertiary}
              value={bulkMessage}
              onChangeText={setBulkMessage}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setMessageModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, !bulkMessage.trim() && styles.submitBtnDisabled]}
                onPress={handleBulkMessage}
                disabled={!bulkMessage.trim() || bulkProcessing}
              >
                <Text style={styles.submitBtnText}>Send Message</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rejection Reason Modal */}
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
              {rejectModal?.docField && ' document'}
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="e.g., DVLA license is expired, photo quality is poor, documents don't match..."
              placeholderTextColor={COLORS.textTertiary}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setRejectModal(null)}
              >
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
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  headerTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },
  headerSub: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2,
  },
  selectAllBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  selectAllText: { color: COLORS.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: FONT_SIZES.body, paddingVertical: SPACING.sm },
  searchBtn: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm + 2,
  },
  filterScroll: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterChipActive: { backgroundColor: `${COLORS.electricTeal}15`, borderColor: COLORS.electricTeal },
  filterChipText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: FONT_WEIGHTS.medium },
  filterChipTextActive: { color: COLORS.electricTeal },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: COLORS.border,
    marginRight: SPACING.sm, justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: COLORS.electricTeal, borderColor: COLORS.electricTeal },
  bulkBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
  },
  bulkBtn: { alignItems: 'center', gap: 4 },
  bulkBtnText: { color: COLORS.textPrimary, fontSize: 11, fontWeight: FONT_WEIGHTS.medium },
  listContainer: { padding: SPACING.lg },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: SPACING.md },
  emptyTitle: {
    color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold, marginTop: SPACING.md,
  },
  emptySub: { color: COLORS.textSecondary, marginTop: 4 },

  // Card
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md,
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: `${COLORS.electricTeal}18`,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  avatarText: {
    color: COLORS.electricTeal, fontSize: 16, fontWeight: FONT_WEIGHTS.bold,
  },
  nameText: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold,
  },
  roleText: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 1,
  },
  pendingBadge: {
    backgroundColor: `${COLORS.amber}18`, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  pendingBadgeText: {
    color: COLORS.amber, fontSize: 10, fontWeight: 'bold',
  },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 5,
  },
  detailText: {
    color: COLORS.textSecondary, fontSize: 13, marginLeft: 6,
  },

  // Progress
  progressRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm, marginBottom: SPACING.sm,
  },
  progressText: {
    color: COLORS.electricTeal, fontSize: 13, fontWeight: FONT_WEIGHTS.medium, marginLeft: 6,
  },

  // Documents section
  documentsSectionTitle: {
    fontSize: 13, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.textPrimary,
    marginTop: SPACING.md, marginBottom: SPACING.sm,
  },
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm,
    marginBottom: 4, borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  docRowUploaded: {
    backgroundColor: `${COLORS.info}08`, borderColor: COLORS.info,
  },
  docRowMissing: {
    backgroundColor: COLORS.surfaceAlt, borderColor: COLORS.border, opacity: 0.6,
  },
  docLabel: {
    fontSize: 13, fontWeight: FONT_WEIGHTS.medium, color: COLORS.textPrimary,
  },
  docStatusText: {
    fontSize: 11, fontWeight: FONT_WEIGHTS.medium, marginTop: 2,
  },
  docMissingText: {
    fontSize: 11, color: COLORS.textTertiary, marginTop: 2,
  },
  docRejectionText: {
    fontSize: 10, color: COLORS.error, fontStyle: 'italic', marginTop: 2,
  },
  docViewBtn: {
    padding: SPACING.xs, marginRight: SPACING.xs,
  },
  docApproveBtn: {
    padding: SPACING.xs, marginRight: SPACING.xs,
  },
  docRejectBtn: {
    padding: SPACING.xs,
  },

  dateText: {
    color: COLORS.textTertiary, fontSize: 11, marginBottom: SPACING.sm,
  },

  // Actions
  actionRow: {
    flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs,
  },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.error,
    backgroundColor: `${COLORS.error}08`,
  },
  rejectBtnText: {
    color: COLORS.error, fontWeight: FONT_WEIGHTS.semibold, fontSize: 13,
  },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.success,
  },
  approveBtnText: {
    color: '#FFF', fontWeight: FONT_WEIGHTS.bold, fontSize: 13,
  },
  btnDisabled: { opacity: 0.5 },

  // Modal styles
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.xl, paddingBottom: 40, minHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary,
  },
  modalSubtitle: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.label, marginBottom: SPACING.lg,
  },
  reasonInput: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body,
    borderWidth: 1, borderColor: COLORS.border,
    minHeight: 120, textAlignVertical: 'top', marginBottom: SPACING.xl,
  },
  modalActions: {
    flexDirection: 'row', gap: SPACING.md,
  },
  cancelBtn: {
    flex: 1, paddingVertical: SPACING.lg, borderRadius: BORDER_RADIUS.md,
    backgroundColor: `${COLORS.textTertiary}15`, alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.label,
  },
  submitBtn: {
    flex: 1, paddingVertical: SPACING.lg, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.error, alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFF', fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.label,
  },
});
