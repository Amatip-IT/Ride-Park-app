import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Linking,
} from 'react-native';
import { FareBreakdownCard } from '@/components/FareBreakdownCard';
import { formatElapsed, formatPence, metersToMilesLabel } from '@/utils/fare';
import { disputesApi } from '@/api';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { AdminScreenLayout } from '@/components/admin/AdminScreenLayout';
import { AdminFormModal } from '@/components/admin/AdminFormModal';

const RESOLUTIONS = [
  { id: 'override_driver_approval', label: 'Approve Driver', needsRecord: true },
  { id: 'override_provider_approval', label: 'Approve Provider', needsRecord: true },
  { id: 'issue_refund', label: 'Refund / Fare Adjustment', needsRefund: true },
  { id: 'suspend_user', label: 'Suspend User', needsSuspend: true },
  { id: 'close_no_action', label: 'Close (No Action)' },
  { id: 'other', label: 'Other Resolution' },
];

export function AdminDisputeDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  const runAction = async (fn: () => Promise<any>, done: string) => {
    setProcessing(true);
    try {
      const res = await fn();
      if (res.data?.success) {
        Alert.alert('Done', res.data.message || done);
        loadDispute();
      } else {
        Alert.alert('Error', res.data?.message || 'Action failed');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Action failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleAddNote = () => {
    if (!adminNotes.trim()) {
      Alert.alert('Note', 'Type a note first.');
      return;
    }
    runAction(() => disputesApi.addDisputeNote(disputeId, adminNotes.trim()), 'Note added').then(() =>
      setAdminNotes(''),
    );
  };

  const handleReject = () => {
    if (!adminNotes.trim()) {
      Alert.alert('Reason needed', 'Write the reason for rejecting in the notes box first. It is sent to the user.');
      return;
    }
    Alert.alert('Reject dispute?', 'No money will move. The user is told the dispute was not upheld.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: () => runAction(() => disputesApi.rejectDispute(disputeId, adminNotes.trim()), 'Dispute rejected'),
      },
    ]);
  };

  const resolutionMeta = RESOLUTIONS.find(r => r.id === selectedResolution);
  const ctx = dispute?.rideContext;
  const ride = ctx?.ride;

  if (loading) {
    return (
      <AdminScreenLayout title="Dispute Case" subtitle="Loading...">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.electricTeal} />
        </View>
      </AdminScreenLayout>
    );
  }

  if (!dispute) {
    return (
      <AdminScreenLayout title="Dispute Case" subtitle="Not found">
        <View style={styles.center}>
          <Text style={{ color: colors.error }}>Dispute not found</Text>
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
          <View style={[styles.badge, { backgroundColor: `${colors.amber}20` }]}>
            <Text style={[styles.badgeText, { color: colors.amber }]}>
              {({ investigating: 'Under Review' } as Record<string, string>)[dispute.status] || dispute.status}
            </Text>
          </View>
          <Text style={styles.category}>{dispute.category?.replace(/_/g, ' ')}</Text>
        </View>

        <Text style={styles.label}>Filed By</Text>
        <Text style={styles.value}>
          {filer.firstName} {filer.lastName} · {filer.email}
          {dispute.filedByRole && dispute.filedByRole !== 'other' ? ` (${dispute.filedByRole})` : ''}
        </Text>

        {dispute.assignedTo && (
          <>
            <Text style={styles.label}>Assigned To</Text>
            <Text style={styles.value}>
              {dispute.assignedTo.firstName} {dispute.assignedTo.lastName}
            </Text>
          </>
        )}

        {ctx && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ride {ctx.rideReference || ''}</Text>
            {ride ? (
              <>
                <Text style={styles.value}>
                  {ride.status} · payment {ride.paymentStatus} ({ride.paymentMethod || 'card'}) ·{' '}
                  {ride.vehicleCategory}
                </Text>
                <Text style={styles.small}>
                  {ride.pickup?.address || 'Pickup'} → {ride.dropoff?.address || 'Drop-off'}
                </Text>
                <Text style={styles.small}>
                  Passenger: {ride.passenger?.firstName} {ride.passenger?.lastName} · Driver: {ride.driver?.firstName}{' '}
                  {ride.driver?.lastName}
                </Text>
                <Text style={styles.small}>
                  Distance — approach {metersToMilesLabel(ride.approachMeters)}, estimated trip{' '}
                  {metersToMilesLabel(ride.estimatedTripMeters)}, GPS recorded {metersToMilesLabel(ride.recordedTripMeters)},
                  billed trip {metersToMilesLabel(ride.billedTripMeters)}
                  {ride.fareBreakdown?.tripDistanceBasis ? ` (${ride.fareBreakdown.tripDistanceBasis})` : ''}
                </Text>
                {ride.startedAt && (
                  <Text style={styles.small}>
                    {new Date(ride.startedAt).toLocaleString()} →{' '}
                    {ride.completedAt ? new Date(ride.completedAt).toLocaleString() : 'not completed'}
                  </Text>
                )}
                {ride.fareBreakdown && (
                  <View style={{ marginTop: SPACING.sm }}>
                    <FareBreakdownCard fare={ride.fareBreakdown} title="Fare charged" />
                  </View>
                )}
                {ride.hold && ride.hold.status !== 'none' && (
                  <Text style={styles.small}>
                    Wallet hold: {formatPence(ride.hold.amountPence)} · {ride.hold.status}
                    {ride.hold.capturedAmountPence != null ? ` · captured ${formatPence(ride.hold.capturedAmountPence)}` : ''}
                    {ride.hold.failureReason ? ` · ${ride.hold.failureReason}` : ''}
                  </Text>
                )}
                {(ride.stops || []).length > 0 && (
                  <>
                    <Text style={styles.label}>Stops</Text>
                    {ride.stops.map((s: any, i: number) => (
                      <Text key={`stop-${i}`} style={styles.small}>
                        {i + 1}. {s.initiatedBy} · {new Date(s.startedAt).toLocaleTimeString()}–
                        {s.endedAt ? new Date(s.endedAt).toLocaleTimeString() : 'open'} ·{' '}
                        {formatElapsed(s.durationSeconds || 0)} · {formatPence(s.chargePence)}
                      </Text>
                    ))}
                  </>
                )}
              </>
            ) : (
              <Text style={styles.small}>
                Ride never started · request {ctx.request?.status}
                {ctx.request?.cancelledBy ? ` (cancelled by ${ctx.request.cancelledBy})` : ''}
              </Text>
            )}
            {(ctx.walletTransactions || []).length + (ctx.driverEarnings || []).length > 0 && (
              <>
                <Text style={styles.label}>Transactions</Text>
                {[...(ctx.walletTransactions || []), ...(ctx.driverEarnings || [])].map((t: any) => (
                  <Text key={t._id} style={styles.small}>
                    {t.createdAt ? new Date(t.createdAt).toLocaleString() : ''} · {t.type.replace(/_/g, ' ')} ·{' '}
                    {t.amountPence != null ? formatPence(t.amountPence) : `£${Number(t.amount || 0).toFixed(2)}`} ·{' '}
                    {t.status}
                  </Text>
                ))}
              </>
            )}
          </View>
        )}

        {(dispute.evidenceUrls || []).length > 0 && (
          <>
            <Text style={styles.label}>Evidence</Text>
            {dispute.evidenceUrls.map((url: string, i: number) => (
              <TouchableOpacity key={`${url}-${i}`} onPress={() => Linking.openURL(url)}>
                <Text style={[styles.small, { color: colors.electricTeal }]}>Evidence {i + 1} (open)</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {(dispute.internalNotes || []).length > 0 && (
          <>
            <Text style={styles.label}>Internal note history</Text>
            {dispute.internalNotes.map((n: any, i: number) => (
              <Text key={`note-${i}`} style={styles.small}>
                {new Date(n.at).toLocaleString()} · {n.note}
              </Text>
            ))}
          </>
        )}

        {(dispute.statusHistory || []).length > 0 && (
          <>
            <Text style={styles.label}>Status history</Text>
            {dispute.statusHistory.map((h: any, i: number) => (
              <Text key={`hist-${i}`} style={styles.small}>
                {new Date(h.at).toLocaleString()} · {h.status}
                {h.note ? ` — ${h.note}` : ''}
              </Text>
            ))}
          </>
        )}

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
            <Text style={[styles.value, { color: colors.success }]}>{dispute.resolution?.replace(/_/g, ' ')}</Text>
            {dispute.resolutionNotes && <Text style={styles.notes}>{dispute.resolutionNotes}</Text>}
          </>
        )}

        <Text style={styles.label}>Internal Notes</Text>
        <TextInput
          style={[styles.input, { minHeight: 88 }]}
          value={adminNotes}
          onChangeText={setAdminNotes}
          placeholder="Add investigation notes..."
          placeholderTextColor={colors.textTertiary}
          multiline
          textAlignVertical="top"
          blurOnSubmit
        />

        <TouchableOpacity style={styles.noteBtn} onPress={handleAddNote} disabled={processing}>
          <Ionicons name="create-outline" size={16} color={colors.electricTeal} />
          <Text style={[styles.actionText, { color: colors.electricTeal }]}>Save internal note</Text>
        </TouchableOpacity>

        {!['resolved', 'closed', 'rejected'].includes(dispute.status) && (
          <>
            <View style={styles.actions}>
              {dispute.status === 'open' && (
                <TouchableOpacity style={styles.investigateBtn} onPress={handleInvestigate} disabled={processing}>
                  <Ionicons name="search-outline" size={18} color={colors.info} />
                  <Text style={[styles.actionText, { color: colors.info }]}>Investigate</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.investigateBtn}
                onPress={() => runAction(() => disputesApi.assignDispute(disputeId), 'Assigned to you')}
                disabled={processing}
              >
                <Ionicons name="person-add-outline" size={18} color={colors.info} />
                <Text style={[styles.actionText, { color: colors.info }]}>Assign to me</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.investigateBtn, { borderColor: colors.coralRed }]}
                onPress={handleReject}
                disabled={processing}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.coralRed} />
                <Text style={[styles.actionText, { color: colors.coralRed }]}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resolveBtn} onPress={() => setResolveModal(true)} disabled={processing}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                <Text style={styles.resolveBtnText}>Resolve</Text>
              </TouchableOpacity>
            </View>
          </>
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
              placeholderTextColor={colors.textTertiary}
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
              placeholderTextColor={colors.textTertiary}
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
              placeholderTextColor={colors.textTertiary}
            />
          </>
        )}

        <Text style={styles.label}>Message to User</Text>
        <TextInput
          style={[styles.input, { minHeight: 80 }]}
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholderTextColor={colors.textTertiary}
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  scroll: { paddingBottom: SPACING.xl },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  badge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.sm },
  badgeText: { fontSize: 12, fontWeight: FONT_WEIGHTS.bold, textTransform: 'capitalize' },
  category: { color: colors.textSecondary, textTransform: 'capitalize' },
  label: { color: colors.textTertiary, fontSize: FONT_SIZES.small, marginTop: SPACING.md, marginBottom: 4 },
  value: { color: colors.textPrimary, lineHeight: 22 },
  notes: { color: colors.textSecondary, fontStyle: 'italic', marginTop: SPACING.xs },
  input: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.md },
  section: {
    marginTop: SPACING.lg, padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  sectionTitle: { color: colors.textPrimary, fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.xs },
  small: { color: colors.textSecondary, fontSize: FONT_SIZES.small, lineHeight: 18, marginTop: 2 },
  noteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, alignSelf: 'flex-end',
    paddingVertical: SPACING.sm,
  },
  investigateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: colors.info,
  },
  actionText: { fontWeight: FONT_WEIGHTS.semibold },
  resolveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    backgroundColor: colors.electricTeal, padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
  },
  resolveBtnText: { color: '#FFF', fontWeight: FONT_WEIGHTS.semibold },
  resOption: {
    padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.xs,
  },
  resOptionActive: { borderColor: colors.electricTeal, backgroundColor: `${colors.electricTeal}10` },
  resOptionText: { color: colors.textPrimary },
  resOptionTextActive: { color: colors.electricTeal, fontWeight: FONT_WEIGHTS.semibold },
  typeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  typeChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: colors.border,
  },
  typeChipActive: { borderColor: colors.electricTeal, backgroundColor: `${colors.electricTeal}15` },
  typeText: { color: colors.textSecondary, fontSize: FONT_SIZES.small },
  typeTextActive: { color: colors.electricTeal },
  modalActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg },
  cancelBtn: { flex: 1, padding: SPACING.md, alignItems: 'center' },
  cancelText: { color: colors.textSecondary },
});
