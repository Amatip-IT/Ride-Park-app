import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, TextInput,
} from 'react-native';
import { disputesApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { AdminScreenLayout } from '@/components/admin/AdminScreenLayout';
import { AdminFormModal } from '@/components/admin/AdminFormModal';

const RESOLUTIONS = [
  { id: 'override_driver_approval', label: 'Approve Driver', needsRecord: true },
  { id: 'override_provider_approval', label: 'Approve Provider', needsRecord: true },
  { id: 'issue_refund', label: 'Issue Refund', needsRefund: true },
  { id: 'suspend_user', label: 'Suspend User', needsSuspend: true },
  { id: 'close_no_action', label: 'Close (No Action)' },
  { id: 'other', label: 'Other Resolution' },
];

export function AdminDisputeDetailScreen() {
  const route = useRoute<any>();
  const disputeId = route.params?.disputeId as string;

  const [dispute, setDispute] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [resolveModal, setResolveModal] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState('close_no_action');
  const [notes, setNotes] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [recordId, setRecordId] = useState('');
  const [providerType, setProviderType] = useState('driver');
  const [suspendReason, setSuspendReason] = useState('');

  const loadDispute = async () => {
    try {
      const res = await disputesApi.getAdminDispute(disputeId);
      if (res.data?.success) {
        setDispute(res.data.data);
        setRecordId(res.data.data?.metadata?.recordId || res.data.data?.relatedServiceId || '');
        setProviderType(res.data.data?.metadata?.providerType || 'driver');
      }
    } catch (err) {
      console.log('Failed to load dispute:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDispute(); }, [disputeId]);

  const handleInvestigate = () => {
    Alert.alert('Start Investigation', 'Mark this dispute as under investigation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Investigate',
        onPress: async () => {
          setProcessing(true);
          try {
            const res = await disputesApi.investigateDispute(disputeId, adminNotes || undefined);
            if (res.data?.success) {
              Alert.alert('Done', res.data.message || 'Investigation started');
              loadDispute();
            } else {
              Alert.alert('Error', res.data?.message || 'Failed');
            }
          } catch {
            Alert.alert('Error', 'Failed to start investigation');
          } finally {
            setProcessing(false);
          }
        },
      },
    ]);
  };

  const handleResolve = async () => {
    const resolution = RESOLUTIONS.find(r => r.id === selectedResolution);
    if (resolution?.needsRefund && (!refundAmount || parseFloat(refundAmount) <= 0)) {
      Alert.alert('Refund Amount', 'Enter a valid refund amount.');
      return;
    }
    if (resolution?.needsRecord && !recordId.trim()) {
      Alert.alert('Record ID', 'Enter the driver/provider record ID.');
      return;
    }
    if (resolution?.needsSuspend && !dispute?.complaintAbout) {
      Alert.alert('No Target', 'This dispute has no user to suspend.');
      return;
    }

    setProcessing(true);
    try {
      const res = await disputesApi.resolveDispute(disputeId, {
        resolution: selectedResolution,
        notes: notes.trim() || undefined,
        adminNotes: adminNotes.trim() || undefined,
        refundAmount: refundAmount ? parseFloat(refundAmount) : undefined,
        recordId: recordId.trim() || undefined,
        providerType,
        suspendReason: suspendReason.trim() || undefined,
      });
      if (res.data?.success) {
        Alert.alert('Resolved', res.data.message || 'Dispute resolved', [
          { text: 'OK', onPress: () => { setResolveModal(false); loadDispute(); } },
        ]);
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to resolve');
      }
    } catch {
      Alert.alert('Error', 'Failed to resolve dispute');
    } finally {
      setProcessing(false);
    }
  };

  const resolutionMeta = RESOLUTIONS.find(r => r.id === selectedResolution);

  if (loading) {
    return (
      <AdminScreenLayout title="Dispute Case" subtitle="Loading...">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      </AdminScreenLayout>
    );
  }

  if (!dispute) {
    return (
      <AdminScreenLayout title="Dispute Case" subtitle="Not found">
        <View style={styles.center}>
          <Text style={{ color: COLORS.error }}>Dispute not found</Text>
        </View>
      </AdminScreenLayout>
    );
  }

  const filer = dispute.filedBy || {};
  const about = dispute.complaintAbout;

  return (
    <>
    <AdminScreenLayout title="Dispute Case" subtitle={dispute.category?.replace(/_/g, ' ')} scroll contentContainerStyle={styles.scroll}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: `${COLORS.amber}20` }]}>
            <Text style={[styles.badgeText, { color: COLORS.amber }]}>{dispute.status}</Text>
          </View>
          <Text style={styles.category}>{dispute.category?.replace(/_/g, ' ')}</Text>
        </View>

        <Text style={styles.label}>Filed By</Text>
        <Text style={styles.value}>{filer.firstName} {filer.lastName} · {filer.email}</Text>

        {about && (
          <>
            <Text style={styles.label}>Complaint About</Text>
            <Text style={styles.value}>{about.firstName} {about.lastName} · {about.email}</Text>
          </>
        )}

        <Text style={styles.label}>Description</Text>
        <Text style={styles.value}>{dispute.description}</Text>

        {dispute.adminNotes && (
          <>
            <Text style={styles.label}>Admin Notes</Text>
            <Text style={styles.value}>{dispute.adminNotes}</Text>
          </>
        )}

        {dispute.resolution && (
          <>
            <Text style={styles.label}>Resolution</Text>
            <Text style={[styles.value, { color: COLORS.success }]}>{dispute.resolution?.replace(/_/g, ' ')}</Text>
            {dispute.resolutionNotes && <Text style={styles.notes}>{dispute.resolutionNotes}</Text>}
          </>
        )}

        <Text style={styles.label}>Internal Notes</Text>
        <TextInput
          style={[styles.input, { minHeight: 88 }]}
          value={adminNotes}
          onChangeText={setAdminNotes}
          placeholder="Add investigation notes..."
          placeholderTextColor={COLORS.textTertiary}
          multiline
          textAlignVertical="top"
          blurOnSubmit
        />

        {dispute.status !== 'resolved' && dispute.status !== 'closed' && (
          <View style={styles.actions}>
            {dispute.status === 'open' && (
              <TouchableOpacity style={styles.investigateBtn} onPress={handleInvestigate} disabled={processing}>
                <Ionicons name="search-outline" size={18} color={COLORS.info} />
                <Text style={[styles.actionText, { color: COLORS.info }]}>Investigate</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.resolveBtn} onPress={() => setResolveModal(true)} disabled={processing}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
              <Text style={styles.resolveBtnText}>Resolve</Text>
            </TouchableOpacity>
          </View>
        )}
    </AdminScreenLayout>

      <AdminFormModal
        visible={resolveModal}
        onClose={() => setResolveModal(false)}
        title="Resolve Dispute"
        maxHeightRatio={0.92}
      >
        <Text style={styles.label}>Resolution Action</Text>
        {RESOLUTIONS.map(r => (
          <TouchableOpacity
            key={r.id}
            style={[styles.resOption, selectedResolution === r.id && styles.resOptionActive]}
            onPress={() => setSelectedResolution(r.id)}
          >
            <Text style={[styles.resOptionText, selectedResolution === r.id && styles.resOptionTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}

        {resolutionMeta?.needsRefund && (
          <>
            <Text style={styles.label}>Refund Amount (£)</Text>
            <TextInput
              style={styles.input}
              value={refundAmount}
              onChangeText={setRefundAmount}
              keyboardType="decimal-pad"
              placeholderTextColor={COLORS.textTertiary}
            />
          </>
        )}

        {resolutionMeta?.needsRecord && (
          <>
            <Text style={styles.label}>Record ID</Text>
            <TextInput
              style={styles.input}
              value={recordId}
              onChangeText={setRecordId}
              placeholderTextColor={COLORS.textTertiary}
              autoCapitalize="none"
            />
            <Text style={styles.label}>Provider Type</Text>
            <View style={styles.typeRow}>
              {['driver', 'taxi_driver'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, providerType === t && styles.typeChipActive]}
                  onPress={() => setProviderType(t)}
                >
                  <Text style={[styles.typeText, providerType === t && styles.typeTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {resolutionMeta?.needsSuspend && (
          <>
            <Text style={styles.label}>Suspension Reason</Text>
            <TextInput
              style={styles.input}
              value={suspendReason}
              onChangeText={setSuspendReason}
              placeholderTextColor={COLORS.textTertiary}
            />
          </>
        )}

        <Text style={styles.label}>Message to User</Text>
        <TextInput
          style={[styles.input, { minHeight: 80 }]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholderTextColor={COLORS.textTertiary}
          textAlignVertical="top"
        />

        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setResolveModal(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resolveBtn} onPress={handleResolve} disabled={processing}>
            <Text style={styles.resolveBtnText}>{processing ? 'Processing...' : 'Confirm Resolve'}</Text>
          </TouchableOpacity>
        </View>
      </AdminFormModal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  scroll: { paddingBottom: SPACING.xl },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  badge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.sm },
  badgeText: { fontSize: 12, fontWeight: FONT_WEIGHTS.bold, textTransform: 'capitalize' },
  category: { color: COLORS.textSecondary, textTransform: 'capitalize' },
  label: { color: COLORS.textTertiary, fontSize: FONT_SIZES.small, marginTop: SPACING.md, marginBottom: 4 },
  value: { color: COLORS.textPrimary, lineHeight: 22 },
  notes: { color: COLORS.textSecondary, fontStyle: 'italic', marginTop: SPACING.xs },
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: COLORS.textPrimary,
    borderWidth: 1, borderColor: COLORS.border,
  },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.xl },
  investigateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.info,
  },
  actionText: { fontWeight: FONT_WEIGHTS.semibold },
  resolveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.electricTeal, padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
  },
  resolveBtnText: { color: '#FFF', fontWeight: FONT_WEIGHTS.semibold },
  resOption: {
    padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.xs,
  },
  resOptionActive: { borderColor: COLORS.electricTeal, backgroundColor: `${COLORS.electricTeal}10` },
  resOptionText: { color: COLORS.textPrimary },
  resOptionTextActive: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.semibold },
  typeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  typeChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
  },
  typeChipActive: { borderColor: COLORS.electricTeal, backgroundColor: `${COLORS.electricTeal}15` },
  typeText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  typeTextActive: { color: COLORS.electricTeal },
  modalActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg },
  cancelBtn: { flex: 1, padding: SPACING.md, alignItems: 'center' },
  cancelText: { color: COLORS.textSecondary },
});
