import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { disputesApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AdminScreenLayout } from '@/components/admin/AdminScreenLayout';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'investigating', label: 'Investigating' },
  { id: 'resolved', label: 'Resolved' },
];

const STATUS_COLORS: Record<string, string> = {
  open: COLORS.amber,
  investigating: COLORS.info,
  resolved: COLORS.success,
  closed: COLORS.textTertiary,
};

export function AdminDisputesScreen() {
  const navigation = useNavigation<any>();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');

  const fetchDisputes = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await disputesApi.getAdminDisputes({
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      if (res.data?.success) setDisputes(res.data.data || []);
    } catch (err) {
      console.log('Failed to fetch disputes:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchDisputes(); }, [statusFilter]));

  const filterRow = (
    <View style={styles.filterRow}>
      {STATUS_FILTERS.map(f => (
        <TouchableOpacity
          key={f.id}
          style={[styles.filterChip, statusFilter === f.id && styles.filterChipActive]}
          onPress={() => setStatusFilter(f.id)}
        >
          <Text style={[styles.filterText, statusFilter === f.id && styles.filterTextActive]}>{f.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderItem = ({ item }: { item: any }) => {
    const filer = item.filedBy || {};
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('AdminDisputeDetail', { disputeId: item._id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.filerName}>{filer.firstName} {filer.lastName}</Text>
          <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[item.status] || COLORS.textTertiary}20` }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.category}>{item.category?.replace(/_/g, ' ')}</Text>
        <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
        <Text style={styles.date}>
          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <AdminScreenLayout
      title="Dispute Queue"
      subtitle={`${disputes.length} case${disputes.length !== 1 ? 's' : ''}`}
      headerBottom={filterRow}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      ) : disputes.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-circle-outline" size={64} color={COLORS.success} />
          <Text style={styles.emptyTitle}>No disputes in this filter</Text>
        </View>
      ) : (
        <FlatList
          data={disputes}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchDisputes(true)} tintColor={COLORS.electricTeal} />
          }
        />
      )}
    </AdminScreenLayout>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, padding: SPACING.md },
  filterChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterChipActive: { backgroundColor: `${COLORS.electricTeal}15`, borderColor: COLORS.electricTeal },
  filterText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  filterTextActive: { color: COLORS.electricTeal },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { color: COLORS.textSecondary, marginTop: SPACING.md },
  list: { padding: SPACING.md, paddingBottom: SPACING.xl },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  filerName: { color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.semibold, flex: 1 },
  statusPill: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.sm },
  statusText: { fontSize: 11, fontWeight: FONT_WEIGHTS.bold, textTransform: 'capitalize' },
  category: { color: COLORS.amber, fontSize: FONT_SIZES.small, textTransform: 'capitalize', marginBottom: 4 },
  desc: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  date: { color: COLORS.textTertiary, fontSize: 11, marginTop: SPACING.sm },
});
