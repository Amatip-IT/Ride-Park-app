import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { adminApi } from '@/api';
import { useFocusEffect } from '@react-navigation/native';
import { AdminScreenLayout } from '@/components/admin/AdminScreenLayout';
import { AdminFormModal } from '@/components/admin/AdminFormModal';

export function AdminPayoutsQueueScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchWithdrawals = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getPendingWithdrawals();
      if (res.data?.success) setWithdrawals(res.data.data || []);
    } catch (err) {
      console.log('Failed to fetch withdrawals', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchWithdrawals(); }, []));

  const handleApprove = (id: string) => {
    Alert.alert('Process Withdrawal', 'This authorizes the Stripe transfer and manual bank payout. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Authorize Payment', style: 'default', onPress: async () => {
        setActionLoading(id);
        try {
          const res = await adminApi.approveWithdrawal(id);
          if (res.data?.success) {
            Alert.alert('Withdrawal Updated', res.data.message || 'Stripe processing started');
            fetchWithdrawals();
          } else {
            Alert.alert('Error', res.data?.message || 'Failed to approve');
          }
        } catch (err: any) {
          Alert.alert('Error', err?.response?.data?.message || 'Transfer failed');
        } finally {
          setActionLoading(null);
        }
      }},
    ]);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { Alert.alert('Error', 'Please provide a reason'); return; }
    const id = rejectModal!;
    setActionLoading(id);
    try {
      const res = await adminApi.rejectWithdrawal(id, rejectReason);
      if (res.data?.success) {
        Alert.alert('Done', 'Withdrawal rejected. Funds refunded to provider.');
        setRejectModal(null);
        setRejectReason('');
        fetchWithdrawals();
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to reject');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Rejection failed');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <>
    <AdminScreenLayout title="Payouts Queue" subtitle="Pending provider withdrawals" scroll contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.electricTeal} style={{ marginTop: 40 }} />
        ) : withdrawals.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
            <Text style={styles.emptyText}>No pending withdrawals</Text>
          </View>
        ) : (
          withdrawals.map((w: any) => {
            const provider = w.providerId || {};
            const actionLabel = w.status === 'payout_failed'
              ? 'Retry Payout'
              : w.status === 'transferred'
                ? 'Send Payout'
                : w.status === 'transfer_failed'
                  ? 'Retry Transfer'
                  : 'Approve & Pay';
            const canReject = !w.stripeTransferId && ['pending', 'approved', 'transfer_failed'].includes(w.status);
            const payoutInFlight = w.status === 'payout_pending';
            return (
              <View key={w._id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.providerName}>{provider.firstName} {provider.lastName}</Text>
                    <Text style={styles.providerEmail}>{provider.email}</Text>
                  </View>
                  <Text style={styles.amount}>£{Number(w.amount).toFixed(2)}</Text>
                </View>
                <Text style={styles.dateText}>Requested: {new Date(w.createdAt).toLocaleDateString('en-GB')}</Text>
                <Text style={styles.statusText}>Status: {String(w.status).replace(/_/g, ' ')}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.approveBtn, actionLoading === w._id && { opacity: 0.6 }]}
                    onPress={() => handleApprove(w._id)}
                    disabled={actionLoading === w._id || payoutInFlight}
                  >
                    {payoutInFlight ? <Text style={styles.approveBtnText}>Processing at Stripe</Text> : actionLoading === w._id ? <ActivityIndicator color="#FFF" size="small" /> : (
                      <><Ionicons name="checkmark" size={18} color="#FFF" /><Text style={styles.approveBtnText}>{actionLabel}</Text></>
                    )}
                  </TouchableOpacity>
                  {canReject && (
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejectModal(w._id)}>
                      <Ionicons name="close" size={18} color={colors.error} />
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
    </AdminScreenLayout>

      <AdminFormModal
        visible={!!rejectModal}
        onClose={() => { setRejectModal(null); setRejectReason(''); }}
        title="Rejection Reason"
        subtitle="Explain why this withdrawal is rejected"
      >
        <TextInput
          style={styles.modalInput}
          placeholder="Why are you rejecting this withdrawal?"
          placeholderTextColor={colors.textTertiary}
          value={rejectReason}
          onChangeText={setRejectReason}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <View style={styles.modalActions}>
          <TouchableOpacity
            style={[styles.rejectBtn, { flex: 1, justifyContent: 'center' }]}
            onPress={() => { setRejectModal(null); setRejectReason(''); }}
          >
            <Text style={styles.rejectBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.approveBtn, { flex: 1, backgroundColor: colors.error }]}
            onPress={handleReject}
          >
            <Text style={styles.approveBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      </AdminFormModal>
    </>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  scrollContent: { paddingBottom: SPACING.xl },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: colors.textSecondary, fontSize: FONT_SIZES.body, marginTop: SPACING.md },

  card: { backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
  providerName: { color: colors.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  providerEmail: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  amount: { color: colors.electricTeal, fontSize: 22, fontWeight: FONT_WEIGHTS.bold },
  dateText: { color: colors.textTertiary, fontSize: 12, marginBottom: SPACING.md },
  statusText: { color: colors.amber, fontSize: 12, textTransform: 'capitalize', marginBottom: SPACING.md },

  actions: { flexDirection: 'row', gap: SPACING.md },
  approveBtn: { flex: 1, backgroundColor: colors.success, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  approveBtnText: { color: '#FFF', fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.label },
  rejectBtn: { flex: 1, backgroundColor: `${colors.error}10`, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: `${colors.error}30` },
  rejectBtnText: { color: colors.error, fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.label },

  modalInput: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    color: colors.textPrimary, fontSize: FONT_SIZES.body, borderWidth: 1, borderColor: colors.border,
    minHeight: 100, textAlignVertical: 'top', marginBottom: SPACING.lg,
  },
  modalActions: { flexDirection: 'row', gap: SPACING.md },
});
