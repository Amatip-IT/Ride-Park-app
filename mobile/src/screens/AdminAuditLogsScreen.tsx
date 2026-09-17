import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, TextInput, Alert, Share,
} from 'react-native';
import { adminApi } from '@/api';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { AdminScreenLayout } from '@/components/admin/AdminScreenLayout';

const ACTION_LABELS: Record<string, string> = {
  approve_parking: 'Approve Parking',
  reject_parking: 'Reject Parking',
  approve_driver: 'Approve Driver',
  reject_driver: 'Reject Driver',
  approve_document: 'Approve Document',
  reject_document: 'Reject Document',
  approve_identity: 'Approve Identity',
  reject_identity: 'Reject Identity',
  suspend_user: 'Suspend User',
  unsuspend_user: 'Unsuspend User',
  ban_user: 'Ban User',
  unban_user: 'Unban User',
  renew_document: 'Renew Document',
  update_platform_fee: 'Update Platform Fee',
  approve_withdrawal: 'Approve Withdrawal',
  reject_withdrawal: 'Reject Withdrawal',
  bulk_approve_drivers: 'Bulk Approve Drivers',
  bulk_reject_drivers: 'Bulk Reject Drivers',
  bulk_message_drivers: 'Bulk Message Drivers',
  send_admin_message: 'Send Admin Message',
  investigate_dispute: 'Investigate Dispute',
  resolve_dispute: 'Resolve Dispute',
};

type AuditLog = {
  _id: string;
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  notes?: string;
  ipAddress?: string;
  createdAt?: string;
  admin?: { firstName?: string; lastName?: string; email?: string } | string;
};

export function AdminAuditLogsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionFilter, setActionFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = async (pageNum = page, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await adminApi.getAuditLogs({
        action: actionFilter || undefined,
        targetId: targetFilter || undefined,
        page: pageNum,
        limit: 25,
      });
      if (res.data?.success) {
        setLogs(res.data.data || []);
        const meta = (res.data as any).meta;
        setTotalPages(meta?.totalPages || 1);
        setPage(pageNum);
      }
    } catch (err) {
      console.log('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [actionFilter, targetFilter]);

  const handleExport = async () => {
    try {
      const res = await adminApi.exportAuditLogs({
        action: actionFilter || undefined,
      });
      if (res.data?.success && res.data.data?.csv) {
        await Share.share({
          message: res.data.data.csv,
          title: 'Gleezip Admin Audit Logs',
        });
      } else {
        Alert.alert('Export Failed', res.data?.message || 'Could not export logs');
      }
    } catch {
      Alert.alert('Export Failed', 'Could not export audit logs');
    }
  };

  const renderItem = ({ item }: { item: AuditLog }) => {
    const admin = typeof item.admin === 'object' ? item.admin : null;
    const adminName = admin
      ? `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email
      : 'Unknown admin';

    return (
      <View style={styles.logCard}>
        <View style={styles.logHeader}>
          <Text style={styles.actionText}>
            {ACTION_LABELS[item.action] || item.action}
          </Text>
          <Text style={styles.timeText}>
            {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
          </Text>
        </View>
        <Text style={styles.adminText}>By: {adminName}</Text>
        {item.targetType && (
          <Text style={styles.detailText}>
            Target: {item.targetType}{item.targetId ? ` · ${item.targetId.slice(-8)}` : ''}
          </Text>
        )}
        {item.reason && <Text style={styles.reasonText}>Reason: {item.reason}</Text>}
        {item.notes && <Text style={styles.notesText}>Notes: {item.notes}</Text>}
      </View>
    );
  };

  const filterRow = (
    <View style={styles.filterRow}>
      <TextInput
        style={styles.filterInput}
        placeholder="Filter by action..."
        placeholderTextColor={colors.textTertiary}
        value={actionFilter}
        onChangeText={setActionFilter}
        returnKeyType="done"
        blurOnSubmit
      />
      <TextInput
        style={styles.filterInput}
        placeholder="Target ID..."
        placeholderTextColor={colors.textTertiary}
        value={targetFilter}
        onChangeText={setTargetFilter}
        returnKeyType="done"
        blurOnSubmit
        autoCapitalize="none"
      />
    </View>
  );

  const pagination = (
    <View style={styles.paginationRow}>
      <TouchableOpacity
        style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
        disabled={page <= 1}
        onPress={() => fetchLogs(page - 1)}
      >
        <Text style={styles.pageBtnText}>Previous</Text>
      </TouchableOpacity>
      <Text style={styles.pageText}>Page {page} of {totalPages}</Text>
      <TouchableOpacity
        style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
        disabled={page >= totalPages}
        onPress={() => fetchLogs(page + 1)}
      >
        <Text style={styles.pageBtnText}>Next</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <AdminScreenLayout
      title="Audit Logs"
      subtitle="Admin action history"
      headerBottom={filterRow}
      rightSlot={(
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
          <Ionicons name="download-outline" size={22} color={colors.electricTeal} />
        </TouchableOpacity>
      )}
      footer={!loading && logs.length > 0 ? pagination : undefined}
    >
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.electricTeal} />
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No audit logs yet</Text>
          <Text style={styles.emptySub}>Admin actions will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchLogs(page, true)}
              tintColor={colors.electricTeal}
            />
          }
        />
      )}
    </AdminScreenLayout>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  exportBtn: { padding: SPACING.sm, width: 40, alignItems: 'center' },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    color: colors.textPrimary,
    fontSize: FONT_SIZES.small,
    borderWidth: 1,
    borderColor: colors.border,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.md,
  },
  emptySub: {
    color: colors.textSecondary,
    fontSize: FONT_SIZES.body,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  listContainer: { padding: SPACING.md, paddingBottom: SPACING.md },
  logCard: {
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  actionText: {
    color: colors.textPrimary,
    fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.semibold,
    flex: 1,
  },
  timeText: { color: colors.textTertiary, fontSize: 11 },
  adminText: { color: colors.textSecondary, fontSize: FONT_SIZES.small, marginBottom: 4 },
  detailText: { color: colors.textSecondary, fontSize: FONT_SIZES.small },
  reasonText: { color: colors.amber, fontSize: FONT_SIZES.small, marginTop: 4 },
  notesText: { color: colors.textTertiary, fontSize: FONT_SIZES.small, marginTop: 2 },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  pageBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: {
    color: colors.electricTeal,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
  },
  pageText: { color: colors.textSecondary, fontSize: FONT_SIZES.small },
});
