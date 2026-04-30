import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, Platform, ActivityIndicator, Alert, Modal,
  TextInput, KeyboardAvoidingView
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { walletApi } from '@/api';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

type Period = 'day' | 'week' | 'month' | undefined;

export function ProviderEarningsScreen() {
  const [wallet, setWallet] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>(undefined);

  // Bank details modal
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankForm, setBankForm] = useState({ accountName: '', accountNumber: '', sortCode: '' });
  const [bankLoading, setBankLoading] = useState(false);

  // Withdraw modal
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const fetchData = async (period?: Period) => {
    setLoading(true);
    try {
      const [walletRes, txRes] = await Promise.all([
        walletApi.getWalletInfo(),
        walletApi.getTransactions(period),
      ]);
      if (walletRes.data?.success) setWallet(walletRes.data.data);
      if (txRes.data?.success) setTransactions(txRes.data.data || []);
    } catch (err) {
      console.log('Failed to fetch wallet data', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(selectedPeriod); }, [selectedPeriod]));

  const handlePeriodChange = (p: Period) => {
    setSelectedPeriod(p);
  };

  const handleSaveBankDetails = async () => {
    if (!bankForm.accountName.trim() || !bankForm.accountNumber.trim() || !bankForm.sortCode.trim()) {
      Alert.alert('Error', 'Please fill in all bank details'); return;
    }
    if (bankForm.accountNumber.length !== 8) {
      Alert.alert('Error', 'Account number must be 8 digits'); return;
    }
    if (bankForm.sortCode.replace(/-/g, '').length !== 6) {
      Alert.alert('Error', 'Sort code must be 6 digits'); return;
    }
    setBankLoading(true);
    try {
      const res = await walletApi.updateBankDetails({
        accountName: bankForm.accountName,
        accountNumber: bankForm.accountNumber,
        sortCode: bankForm.sortCode.replace(/-/g, ''),
      });
      if (res.data?.success) {
        Alert.alert('Success', 'Bank details saved successfully');
        setShowBankModal(false);
        fetchData(selectedPeriod);
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to save bank details');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to save bank details');
    } finally {
      setBankLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount'); return;
    }
    if (!wallet?.bankDetails) {
      Alert.alert('Error', 'Please add bank details first'); return;
    }
    if (amount > (wallet?.balance || 0)) {
      Alert.alert('Error', 'Insufficient balance'); return;
    }
    setWithdrawLoading(true);
    try {
      const res = await walletApi.requestWithdrawal(amount);
      if (res.data?.success) {
        Alert.alert('Success', 'Withdrawal request submitted. You will be paid after admin approval.');
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        fetchData(selectedPeriod);
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to submit withdrawal');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Withdrawal failed');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleDownloadStatement = async () => {
    const periodLabel = selectedPeriod === 'day' ? 'Daily' : selectedPeriod === 'week' ? 'Weekly' : selectedPeriod === 'month' ? 'Monthly' : 'All Time';
    const rows = transactions.map(t => `
      <tr>
        <td>${new Date(t.createdAt).toLocaleDateString('en-GB')}</td>
        <td>${t.type === 'earning' ? 'Job Earning' : 'Withdrawal'}</td>
        <td>£${Number(t.amount).toFixed(2)}</td>
        <td>£${Number(t.platformFee || 0).toFixed(2)}</td>
        <td>${t.status}</td>
      </tr>`).join('');

    const html = `<html><head><style>
      body{font-family:Arial;padding:20px}
      h1{color:#00B4A0}
      table{width:100%;border-collapse:collapse;margin-top:20px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#00B4A0;color:#fff}
      .summary{margin:15px 0;font-size:16px}
    </style></head><body>
      <h1>Gleezip - Earnings Statement</h1>
      <p class="summary"><strong>Period:</strong> ${periodLabel}</p>
      <p class="summary"><strong>Total Earnings (Gross):</strong> £${(wallet?.totalEarnings || 0).toFixed(2)}</p>
      <p class="summary"><strong>Available Balance:</strong> £${(wallet?.balance || 0).toFixed(2)}</p>
      <p class="summary"><strong>Total Jobs:</strong> ${transactions.filter(t => t.type === 'earning').length}</p>
      <p class="summary"><strong>Total Charges:</strong> £${transactions.reduce((sum: number, t: any) => sum + (t.platformFee || 0), 0).toFixed(2)}</p>
      <table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Fee</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center">No transactions</td></tr>'}</tbody></table>
      <p style="margin-top:30px;color:#999;font-size:12px">Generated on ${new Date().toLocaleString('en-GB')}</p>
    </body></html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (err) {
      Alert.alert('Error', 'Failed to generate statement');
    }
  };

  const totalJobs = transactions.filter(t => t.type === 'earning').length;
  const totalCharges = transactions.reduce((sum: number, t: any) => sum + (t.platformFee || 0), 0);

  const renderTransaction = (item: any) => (
    <View key={item._id} style={styles.transactionCard}>
      <View style={[styles.iconBox, { backgroundColor: item.type === 'withdrawal' ? `${COLORS.amber}20` : `${COLORS.electricTeal}20` }]}>
        <Ionicons name={item.type === 'withdrawal' ? 'card-outline' : 'car-sport-outline'} size={22} color={item.type === 'withdrawal' ? COLORS.amber : COLORS.electricTeal} />
      </View>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionTitle} numberOfLines={1}>{item.description || item.type}</Text>
        <View style={styles.dateRow}>
          <Text style={styles.transactionDate}>{new Date(item.createdAt).toLocaleDateString('en-GB')}</Text>
          <View style={[styles.statusPill, { backgroundColor: item.status === 'completed' ? `${COLORS.success}20` : item.status === 'pending' ? `${COLORS.amber}20` : `${COLORS.error}20` }]}>
            <Text style={[styles.statusText, { color: item.status === 'completed' ? COLORS.success : item.status === 'pending' ? COLORS.amber : COLORS.error }]}>{item.status}</Text>
          </View>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.transactionAmount, { color: item.type === 'earning' ? COLORS.success : COLORS.textPrimary }]}>
          {item.type === 'earning' ? '+' : '-'}£{Number(item.amount).toFixed(2)}
        </Text>
        {item.platformFee > 0 && <Text style={styles.feeText}>Fee: £{Number(item.platformFee).toFixed(2)}</Text>}
      </View>
    </View>
  );

  if (loading && !wallet) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator size="large" color={COLORS.electricTeal} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleDownloadStatement}>
          <Ionicons name="download-outline" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Total Earnings (Gross) */}
        <View style={styles.grossCard}>
          <Ionicons name="trending-up" size={20} color={COLORS.electricTeal} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.grossLabel}>Total Earnings (Gross)</Text>
            <Text style={styles.grossValue}>£{(wallet?.totalEarnings || 0).toFixed(2)}</Text>
          </View>
        </View>

        {/* Available Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceValue}>£{(wallet?.balance || 0).toFixed(2)}</Text>
          <TouchableOpacity style={styles.withdrawBtn} activeOpacity={0.8} onPress={() => {
            if (!wallet?.bankDetails) { Alert.alert('Bank Details Required', 'Please add your bank details first.', [{ text: 'Add Now', onPress: () => setShowBankModal(true) }, { text: 'Cancel' }]); return; }
            setShowWithdrawModal(true);
          }}>
            <Ionicons name="wallet-outline" size={20} color="#FFF" />
            <Text style={styles.withdrawText}>Withdraw Funds</Text>
          </TouchableOpacity>
        </View>

        {/* Bank Details */}
        <TouchableOpacity style={styles.bankCard} onPress={() => { if (wallet?.bankDetails) { setBankForm(wallet.bankDetails); } setShowBankModal(true); }}>
          <View style={[styles.iconBox, { backgroundColor: `${COLORS.info}15` }]}>
            <Ionicons name="business-outline" size={22} color={COLORS.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bankTitle}>{wallet?.bankDetails ? 'Bank Account Linked' : 'Add Bank Details'}</Text>
            <Text style={styles.bankSub}>{wallet?.bankDetails ? `****${wallet.bankDetails.accountNumber?.slice(-4)} · ${wallet.bankDetails.sortCode}` : 'Required for withdrawals'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
        </TouchableOpacity>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <View style={styles.statHeader}><Ionicons name="briefcase-outline" size={18} color={COLORS.electricTeal} /><Text style={styles.statLabel}>Total Jobs</Text></View>
            <Text style={styles.statValue}>{totalJobs}</Text>
          </View>
          <View style={styles.statBox}>
            <View style={styles.statHeader}><Ionicons name="cut-outline" size={18} color={COLORS.coralRed} /><Text style={styles.statLabel}>Total Charges</Text></View>
            <Text style={styles.statValue}>£{totalCharges.toFixed(2)}</Text>
          </View>
        </View>

        {/* Period Filter */}
        <View style={styles.filterRow}>
          {([undefined, 'day', 'week', 'month'] as Period[]).map((p) => (
            <TouchableOpacity key={p || 'all'} style={[styles.filterBtn, selectedPeriod === p && styles.filterBtnActive]} onPress={() => handlePeriodChange(p)}>
              <Text style={[styles.filterText, selectedPeriod === p && styles.filterTextActive]}>{p ? p.charAt(0).toUpperCase() + p.slice(1) : 'All'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Transactions */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Transactions</Text>
          <View style={styles.transactionsWrapper}>
            {loading ? <ActivityIndicator color={COLORS.electricTeal} style={{ padding: 20 }} /> :
              transactions.length > 0 ? transactions.map(renderTransaction) : (
                <View style={{ padding: SPACING.xl, alignItems: 'center' }}>
                  <Ionicons name="receipt-outline" size={32} color={COLORS.softSlate} />
                  <Text style={{ color: COLORS.softSlate, marginTop: 8 }}>No transactions yet.</Text>
                </View>
              )}
          </View>
        </View>
      </ScrollView>

      {/* Bank Details Modal */}
      <Modal visible={showBankModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bank Details</Text>
              <TouchableOpacity onPress={() => setShowBankModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Enter your UK bank account details for payouts</Text>
            <TextInput style={styles.modalInput} placeholder="Account Holder Name" placeholderTextColor={COLORS.textTertiary} value={bankForm.accountName} onChangeText={v => setBankForm({ ...bankForm, accountName: v })} />
            <TextInput style={styles.modalInput} placeholder="Account Number (8 digits)" placeholderTextColor={COLORS.textTertiary} value={bankForm.accountNumber} onChangeText={v => setBankForm({ ...bankForm, accountNumber: v.replace(/\D/g, '').slice(0, 8) })} keyboardType="numeric" maxLength={8} />
            <TextInput style={styles.modalInput} placeholder="Sort Code (6 digits)" placeholderTextColor={COLORS.textTertiary} value={bankForm.sortCode} onChangeText={v => setBankForm({ ...bankForm, sortCode: v.replace(/\D/g, '').slice(0, 6) })} keyboardType="numeric" maxLength={6} />
            <TouchableOpacity style={[styles.modalBtn, bankLoading && { opacity: 0.6 }]} onPress={handleSaveBankDetails} disabled={bankLoading}>
              {bankLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnText}>Save Bank Details</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Withdraw Modal */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw Funds</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Available: £{(wallet?.balance || 0).toFixed(2)}</Text>
            <TextInput style={styles.modalInput} placeholder="Amount (£)" placeholderTextColor={COLORS.textTertiary} value={withdrawAmount} onChangeText={setWithdrawAmount} keyboardType="decimal-pad" />
            <TouchableOpacity style={[styles.modalBtn, withdrawLoading && { opacity: 0.6 }]} onPress={handleWithdraw} disabled={withdrawLoading}>
              {withdrawLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnText}>Submit Withdrawal Request</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm, paddingBottom: SPACING.md },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold },
  headerBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: 100 },

  grossCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  grossLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium },
  grossValue: { color: COLORS.textPrimary, fontSize: 24, fontWeight: FONT_WEIGHTS.bold, marginTop: 2 },

  balanceCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.md, borderWidth: 1, borderColor: 'rgba(0,180,160,0.4)', shadowColor: COLORS.electricTeal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  balanceLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.body, marginBottom: 8, fontWeight: FONT_WEIGHTS.medium },
  balanceValue: { color: COLORS.textPrimary, fontSize: 42, fontWeight: FONT_WEIGHTS.bold, letterSpacing: -1, marginBottom: SPACING.xl },
  withdrawBtn: { backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, gap: 8 },
  withdrawText: { color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },

  bankCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.xl, borderWidth: 1, borderColor: COLORS.border },
  bankTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold },
  bankSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.xl },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  statLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium },
  statValue: { color: COLORS.textPrimary, fontSize: 24, fontWeight: FONT_WEIGHTS.bold },

  filterRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  filterBtn: { flex: 1, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  filterBtnActive: { backgroundColor: COLORS.electricTeal, borderColor: COLORS.electricTeal },
  filterText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.semibold },
  filterTextActive: { color: '#FFF' },

  historySection: { flex: 1 },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.md },
  transactionsWrapper: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border },

  transactionCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  iconBox: { width: 44, height: 44, borderRadius: BORDER_RADIUS.md, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  transactionInfo: { flex: 1, marginRight: SPACING.sm },
  transactionTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold, marginBottom: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  transactionDate: { color: COLORS.textSecondary, fontSize: 13 },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: FONT_WEIGHTS.bold },
  transactionAmount: { fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  feeText: { color: COLORS.textTertiary, fontSize: 11, marginTop: 2 },

  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  modalTitle: { fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  modalSubtitle: { color: COLORS.textSecondary, fontSize: FONT_SIZES.body, marginBottom: SPACING.xl },
  modalInput: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, color: COLORS.textPrimary, fontSize: FONT_SIZES.body, borderWidth: 1, borderColor: COLORS.border, height: 50, marginBottom: SPACING.md },
  modalBtn: { backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, alignItems: 'center', marginTop: SPACING.sm },
  modalBtnText: { color: '#FFF', fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },
});
