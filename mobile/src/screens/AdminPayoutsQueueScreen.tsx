import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, Platform, ActivityIndicator, Alert, TextInput, Modal
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { adminApi } from '@/api';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

export function AdminPayoutsQueueScreen() {
  const navigation = useNavigation();
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
    Alert.alert('Approve Withdrawal', 'This will transfer funds via Stripe to the provider\'s bank account. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve & Transfer', style: 'default', onPress: async () => {
        setActionLoading(id);
        try {
          const res = await adminApi.approveWithdrawal(id);
          if (res.data?.success) {
            Alert.alert('Success', 'Funds transferred successfully');
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payouts Queue</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.electricTeal} style={{ marginTop: 40 }} />
        ) : withdrawals.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.success} />
            <Text style={styles.emptyText}>No pending withdrawals</Text>
          </View>
        ) : (
          withdrawals.map((w: any) => {
            const provider = w.providerId || {};
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
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.approveBtn, actionLoading === w._id && { opacity: 0.6 }]}
                    onPress={() => handleApprove(w._id)}
                    disabled={actionLoading === w._id}
                  >
                    {actionLoading === w._id ? <ActivityIndicator color="#FFF" size="small" /> : (
                      <><Ionicons name="checkmark" size={18} color="#FFF" /><Text style={styles.approveBtnText}>Approve & Pay</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejectModal(w._id)}>
                    <Ionicons name="close" size={18} color={COLORS.error} />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Reject Modal */}
      <Modal visible={!!rejectModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rejection Reason</Text>
            <TextInput style={styles.modalInput} placeholder="Why are you rejecting this withdrawal?" placeholderTextColor={COLORS.textTertiary} value={rejectReason} onChangeText={setRejectReason} multiline numberOfLines={3} />
            <View style={{ flexDirection: 'row', gap: SPACING.md }}>
              <TouchableOpacity style={[styles.rejectBtn, { flex: 1, justifyContent: 'center' }]} onPress={() => { setRejectModal(null); setRejectReason(''); }}>
                <Text style={styles.rejectBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.approveBtn, { flex: 1, backgroundColor: COLORS.error }]} onPress={handleReject}>
                <Text style={styles.approveBtnText}>Reject</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: Platform.OS === 'ios' ? 10 : 30, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.body, marginTop: SPACING.md },

  card: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
  providerName: { color: COLORS.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  providerEmail: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  amount: { color: COLORS.electricTeal, fontSize: 22, fontWeight: FONT_WEIGHTS.bold },
  dateText: { color: COLORS.textTertiary, fontSize: 12, marginBottom: SPACING.md },

  actions: { flexDirection: 'row', gap: SPACING.md },
  approveBtn: { flex: 1, backgroundColor: COLORS.success, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  approveBtnText: { color: '#FFF', fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.label },
  rejectBtn: { flex: 1, backgroundColor: `${COLORS.error}10`, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: `${COLORS.error}30` },
  rejectBtnText: { color: COLORS.error, fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.label },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: 40 },
  modalTitle: { fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary, marginBottom: SPACING.lg },
  modalInput: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, color: COLORS.textPrimary, fontSize: FONT_SIZES.body, borderWidth: 1, borderColor: COLORS.border, minHeight: 80, textAlignVertical: 'top', marginBottom: SPACING.lg },
});
