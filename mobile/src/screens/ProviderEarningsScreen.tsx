import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, Platform, ActivityIndicator
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { providerApi } from '@/api';
import { useFocusEffect } from '@react-navigation/native';

export function ProviderEarningsScreen() {
  const [balance, setBalance] = useState(0);
  const [weeklyEarnings, setWeeklyEarnings] = useState(0);
  const [totalBookings, setTotalBookings] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEarnings = async () => {
    setLoading(true);
    try {
      const res = await providerApi.getEarnings();
      if (res.data?.success && res.data.data) {
        setBalance(res.data.data.balance || 0);
        setWeeklyEarnings(res.data.data.weeklyEarnings || 0);
        setTotalBookings(res.data.data.totalBookings || 0);
        setTransactions(res.data.data.transactions || []);
      }
    } catch (err) {
      console.log('Failed to fetch earnings', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchEarnings();
    }, [])
  );

  const renderTransaction = ({ item }: { item: any }) => (
    <View style={styles.transactionCard}>
      <View style={[
        styles.iconBox,
        { backgroundColor: item.type === 'withdrawal' ? `${COLORS.amber}20` : `${COLORS.electricTeal}20` }
      ]}>
        <Ionicons 
          name={item.type === 'withdrawal' ? 'card-outline' : 'car-sport-outline'} 
          size={22} 
          color={item.type === 'withdrawal' ? COLORS.amber : COLORS.electricTeal} 
        />
      </View>
      
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.dateRow}>
          <Text style={styles.transactionDate}>{item.date}</Text>
          {item.status === 'processing' && (
            <Text style={styles.processingPill}>Processing</Text>
          )}
        </View>
      </View>

      <Text style={[
        styles.transactionAmount,
        { color: item.amount > 0 ? COLORS.success : COLORS.textPrimary }
      ]}>
        {item.amount > 0 ? '+' : ''}£{Math.abs(item.amount).toFixed(2)}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Ionicons name="filter-outline" size={24} color={COLORS.cloudWhite} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Main Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceValue}>£{balance.toFixed(2)}</Text>
          
          <TouchableOpacity style={styles.withdrawBtn} activeOpacity={0.8}>
            <Ionicons name="wallet-outline" size={20} color={COLORS.deepNavy} />
            <Text style={styles.withdrawText}>Withdraw Funds</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <View style={styles.statHeader}>
              <Ionicons name="trending-up" size={18} color={COLORS.electricTeal} />
              <Text style={styles.statLabel}>This Week</Text>
            </View>
            <Text style={styles.statValue}>£{weeklyEarnings.toFixed(2)}</Text>
          </View>

          <View style={styles.statBox}>
            <View style={styles.statHeader}>
              <Ionicons name="stats-chart" size={18} color={COLORS.info} />
              <Text style={styles.statLabel}>Total Bookings</Text>
            </View>
            <Text style={styles.statValue}>{totalBookings}</Text>
          </View>
        </View>

        {/* History Section */}
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            {transactions.length > 0 && (
              <TouchableOpacity>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.transactionsWrapper}>
            {transactions.length > 0 ? (
              transactions.map((item: any) => (
                <React.Fragment key={item.id}>
                  {renderTransaction({ item })}
                </React.Fragment>
              ))
            ) : (
              <View style={{ padding: SPACING.xl, alignItems: 'center' }}>
                <Ionicons name="receipt-outline" size={32} color={COLORS.softSlate} />
                <Text style={{ color: COLORS.softSlate, marginTop: 8 }}>No earnings yet.</Text>
              </View>
            )}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold },
  headerBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border
  },
  
  scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: 100 },

  // Balance Card
  balanceCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl, marginTop: SPACING.md, marginBottom: SPACING.xl,
    borderWidth: 1, borderColor: 'rgba(0, 180, 160, 0.4)',
    shadowColor: COLORS.electricTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 5,
  },
  balanceLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.body, marginBottom: 8, fontWeight: FONT_WEIGHTS.medium },
  balanceValue: { color: COLORS.textPrimary, fontSize: 42, fontWeight: FONT_WEIGHTS.bold, letterSpacing: -1, marginBottom: SPACING.xl },
  withdrawBtn: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, gap: 8,
  },
  withdrawText: { color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },

  // Stats
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.xl },
  statBox: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
  },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  statLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium },
  statValue: { color: COLORS.textPrimary, fontSize: 24, fontWeight: FONT_WEIGHTS.bold },

  // History
  historySection: { flex: 1 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: SPACING.md },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
  viewAllText: { color: COLORS.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.semibold },
  
  transactionsWrapper: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  
  transactionCard: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  iconBox: { width: 44, height: 44, borderRadius: BORDER_RADIUS.md, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  transactionInfo: { flex: 1, marginRight: SPACING.sm },
  transactionTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold, marginBottom: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  transactionDate: { color: COLORS.textSecondary, fontSize: 13 },
  processingPill: { backgroundColor: `${COLORS.amber}20`, color: COLORS.amber, fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, fontWeight: FONT_WEIGHTS.bold },
  transactionAmount: { fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
});
