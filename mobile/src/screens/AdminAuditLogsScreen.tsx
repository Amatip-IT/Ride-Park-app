import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Platform, TextInput, Alert, Share,
} from 'react-native';
import { adminApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

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
  const navigation = useNavigation<any>();
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
    } catch (err) {
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

  return (
    <View style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Audit Logs</Text>
          <Text style={styles.headerSub}>Admin action history</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
          <Ionicons name="download-outline" size={22} color={COLORS.electricTeal} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <TextInput
          style={styles.filterInput}
          placeholder="Filter by action..."
          placeholderTextColor={COLORS.textTertiary}
          value={actionFilter}
          onChangeText={setActionFilter}
        />
        <TextInput
          style={styles.filterInput}
          placeholder="Target ID..."
          placeholderTextColor={COLORS.textTertiary}
          value={targetFilter}
          onChangeText={setTargetFilter}
        />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="document-text-outline" size={64} color={COLORS.textTertiary} />
          <Text style={styles.emptyTitle}>No audit logs yet</Text>
          <Text style={styles.emptySub}>Admin actions will appear here.</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={logs}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => fetchLogs(page, true)} tintColor={COLORS.electricTeal} />
            }
          />
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  exportBtn: { padding: SPACING.sm },
  headerTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },
  headerSub: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2 },
  filterRow: {
    flexDirection: 'row', gap: SPACING.sm,
    padding: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  filterInput: {
    flex: 1, backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.sm,
    color: COLORS.textPrimary, fontSize: FONT_SIZES.small,
    borderWidth: 1, borderColor: COLORS.border,
  },
  centerContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl,
  },
  emptyTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold, marginTop: SPACING.md,
  },
  emptySub: { color: COLORS.textSecondary, fontSize: FONT_SIZES.body, marginTop: SPACING.sm, textAlign: 'center' },
  listContainer: { padding: SPACING.md, paddingBottom: 80 },
  logCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.xs },
  actionText: { color: COLORS.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.semibold, flex: 1 },
  timeText: { color: COLORS.textTertiary, fontSize: 11 },
  adminText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginBottom: 4 },
  detailText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  reasonText: { color: COLORS.amber, fontSize: FONT_SIZES.small, marginTop: 4 },
  notesText: { color: COLORS.textTertiary, fontSize: FONT_SIZES.small, marginTop: 2 },
  paginationRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  pageBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { color: COLORS.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium },
  pageText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
});
