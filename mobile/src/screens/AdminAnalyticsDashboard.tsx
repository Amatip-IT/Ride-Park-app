import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl, Share, Alert,
} from 'react-native';
import { adminApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AdminScreenLayout } from '@/components/admin/AdminScreenLayout';
import { SafeAreaView } from 'react-native-safe-area-context';

const PERIODS = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All Time' },
] as const;

type Period = typeof PERIODS[number]['id'];

function MetricCard({ label, value, sub, color = COLORS.electricTeal }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  );
}

function SimpleBarChart({ data, title }: { data: Array<{ label: string; value: number }>; title: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>{title}</Text>
      {data.length === 0 ? (
        <Text style={styles.emptyChart}>No data for this period</Text>
      ) : (
        <View style={styles.chartBars}>
          {data.slice(-7).map(item => (
            <View key={item.label} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height: `${Math.max(8, (item.value / max) * 100)}%` }]} />
              </View>
              <Text style={styles.barLabel} numberOfLines={1}>{item.label.slice(5)}</Text>
              <Text style={styles.barValue}>£{item.value.toFixed(0)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function AdminAnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = async (p = period, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await adminApi.getAnalyticsDashboard(p);
      if (res.data?.success) setData(res.data.data);
    } catch (err) {
      console.log('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchAnalytics(period); }, [period]));

  const handleExport = async () => {
    if (!data) return;
    const csv = [
      'section,metric,value',
      `revenue,mtdFees,${data.revenue?.mtdFees ?? 0}`,
      `revenue,ytdFees,${data.revenue?.ytdFees ?? 0}`,
      `revenue,allTimeFees,${data.revenue?.allTimeFees ?? 0}`,
      `verifications,approvalRate,${data.verifications?.approvalRate ?? 0}`,
      `verifications,pending,${data.verifications?.pending ?? 0}`,
      `users,totalUsers,${data.users?.totalUsers ?? 0}`,
      `users,newSignups,${data.users?.newSignups ?? 0}`,
      `queue,totalBacklog,${data.queue?.backlog?.total ?? 0}`,
      `queue,avgWaitDays,${data.queue?.averageWaitDays ?? 0}`,
    ].join('\n');

    try {
      await Share.share({ message: csv, title: 'Gleezip Analytics Export' });
    } catch {
      Alert.alert('Export Failed', 'Could not export analytics');
    }
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={COLORS.electricTeal} />
      </SafeAreaView>
    );
  }

  const revenue = data?.revenue || {};
  const verifications = data?.verifications || {};
  const users = data?.users || {};
  const queue = data?.queue || {};

  const periodRow = (
    <View style={styles.periodRow}>
      {PERIODS.map(p => (
        <TouchableOpacity
          key={p.id}
          style={[styles.periodChip, period === p.id && styles.periodChipActive]}
          onPress={() => setPeriod(p.id)}
        >
          <Text style={[styles.periodText, period === p.id && styles.periodTextActive]}>{p.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <AdminScreenLayout
      title="Analytics"
      subtitle="Business intelligence dashboard"
      headerBottom={periodRow}
      rightSlot={(
        <TouchableOpacity onPress={handleExport} style={styles.exportBtn}>
          <Ionicons name="download-outline" size={22} color={COLORS.electricTeal} />
        </TouchableOpacity>
      )}
    >
      <ScrollView
        style={styles.analyticsScroll}
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchAnalytics(period, true)} tintColor={COLORS.electricTeal} />
        }
      >
        <Text style={styles.sectionTitle}>Revenue</Text>
        <View style={styles.metricGrid}>
          <MetricCard label="MTD Fees" value={`£${(revenue.mtdFees || 0).toFixed(2)}`} color={COLORS.success} />
          <MetricCard label="YTD Fees" value={`£${(revenue.ytdFees || 0).toFixed(2)}`} color={COLORS.success} />
          <MetricCard label="All-Time" value={`£${(revenue.allTimeFees || 0).toFixed(2)}`} />
          <MetricCard label="Avg Fee / Txn" value={`£${(revenue.averageFeePerTransaction || 0).toFixed(2)}`} sub={`${revenue.transactionCount || 0} txns`} />
        </View>

        <SimpleBarChart data={revenue.trend || []} title="Platform Fee Trend" />

        {revenue.topProviders?.length > 0 && (
          <View style={styles.listCard}>
            <Text style={styles.chartTitle}>Top Earning Providers</Text>
            {revenue.topProviders.map((p: any, i: number) => (
              <View key={p.providerId || i} style={styles.listRow}>
                <Text style={styles.listName}>{p.name || 'Unknown'}</Text>
                <Text style={styles.listValue}>£{(p.totalFees || 0).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Verifications</Text>
        <View style={styles.metricGrid}>
          <MetricCard label="Approval Rate" value={`${(verifications.approvalRate || 0).toFixed(1)}%`} color={COLORS.info} />
          <MetricCard label="Avg Approval Time" value={`${verifications.averageApprovalDays || 0}d`} />
          <MetricCard label="Pending" value={verifications.pending || 0} color={COLORS.amber} />
          <MetricCard label="Resubmit Success" value={`${(verifications.resubmissionSuccessRate || 0).toFixed(1)}%`} />
        </View>

        {verifications.topRejectionReasons?.length > 0 && (
          <View style={styles.listCard}>
            <Text style={styles.chartTitle}>Top Rejection Reasons</Text>
            {verifications.topRejectionReasons.map((r: any, i: number) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listName} numberOfLines={2}>{r.reason}</Text>
                <Text style={styles.listValue}>{r.count}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Users & Drivers</Text>
        <View style={styles.metricGrid}>
          <MetricCard label="Total Users" value={users.totalUsers || 0} />
          <MetricCard label="New Sign-ups" value={users.newSignups || 0} color={COLORS.info} />
          <MetricCard label="Active Drivers" value={users.drivers?.active || 0} color={COLORS.success} />
          <MetricCard label="Churn Rate" value={`${(users.churnRate || 0).toFixed(1)}%`} color={COLORS.error} />
        </View>
        <MetricCard label="Docs Expiring (30 days)" value={users.documentExpiryForecast || 0} color={COLORS.warning} />

        <Text style={styles.sectionTitle}>Queue Health</Text>
        <View style={styles.metricGrid}>
          <MetricCard label="Total Backlog" value={queue.backlog?.total || 0} color={COLORS.amber} />
          <MetricCard label="Driver Queue" value={queue.backlog?.drivers || 0} />
          <MetricCard label="Avg Wait" value={`${queue.averageWaitDays || 0}d`} />
          <MetricCard label="Oldest Pending" value={`${queue.oldestPendingDays || 0}d`} color={COLORS.error} />
        </View>
        <MetricCard
          label="Est. Days to Clear Queue"
          value={queue.estimatedDaysToClearQueue ?? 'N/A'}
          sub={`${queue.approvalsPerDay || 0} approvals/day`}
        />
      </ScrollView>
    </AdminScreenLayout>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  exportBtn: { padding: SPACING.sm, width: 40, alignItems: 'center' },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  analyticsScroll: { flex: 1 },
  periodChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  periodChipActive: { backgroundColor: `${COLORS.electricTeal}15`, borderColor: COLORS.electricTeal },
  periodText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium },
  periodTextActive: { color: COLORS.electricTeal },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
  sectionTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md, marginTop: SPACING.sm,
  },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  metricCard: {
    width: '48%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  metricLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginBottom: 4 },
  metricValue: { color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
  metricSub: { color: COLORS.textTertiary, fontSize: 11, marginTop: 2 },
  chartCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chartTitle: { color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.md },
  emptyChart: { color: COLORS.textTertiary, textAlign: 'center', paddingVertical: SPACING.lg },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140 },
  barColumn: { flex: 1, alignItems: 'center' },
  barTrack: { width: 20, height: 100, backgroundColor: COLORS.divider, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: COLORS.electricTeal, borderRadius: 4 },
  barLabel: { fontSize: 9, color: COLORS.textTertiary, marginTop: 4 },
  barValue: { fontSize: 9, color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.medium },
  listCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  listRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  listName: { flex: 1, color: COLORS.textPrimary, fontSize: FONT_SIZES.small, marginRight: SPACING.sm },
  listValue: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.semibold },
});
