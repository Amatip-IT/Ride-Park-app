import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { disputesApi } from '@/api';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { AdminScreenLayout } from '@/components/admin/AdminScreenLayout';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'investigating', label: 'Investigating' },
  { id: 'resolved', label: 'Resolved' },
];

const getStatusColors = (colors: ThemeColors): Record<string, string> => ({
  open: colors.amber,
  investigating: colors.info,
  resolved: colors.success,
  closed: colors.textTertiary,
});

export function AdminDisputesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const STATUS_COLORS = getStatusColors(colors);
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
          <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[item.status] || colors.textTertiary}20` }]}>
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
          <ActivityIndicator size="large" color={colors.electricTeal} />
        </View>
      ) : disputes.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-circle-outline" size={64} color={colors.success} />
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
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchDisputes(true)} tintColor={colors.electricTeal} />
          }
        />
      )}
    </AdminScreenLayout>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, padding: SPACING.md },
  filterChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: `${colors.electricTeal}15`, borderColor: colors.electricTeal },
  filterText: { color: colors.textSecondary, fontSize: FONT_SIZES.small },
  filterTextActive: { color: colors.electricTeal },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { color: colors.textSecondary, marginTop: SPACING.md },
  list: { padding: SPACING.md, paddingBottom: SPACING.xl },
  card: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  filerName: { color: colors.textPrimary, fontWeight: FONT_WEIGHTS.semibold, flex: 1 },
  statusPill: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.sm },
  statusText: { fontSize: 11, fontWeight: FONT_WEIGHTS.bold, textTransform: 'capitalize' },
  category: { color: colors.amber, fontSize: FONT_SIZES.small, textTransform: 'capitalize', marginBottom: 4 },
  desc: { color: colors.textSecondary, fontSize: FONT_SIZES.small },
  date: { color: colors.textTertiary, fontSize: 11, marginTop: SPACING.sm },
});
