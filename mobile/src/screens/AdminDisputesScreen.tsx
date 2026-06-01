import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Platform,
} from 'react-native';
import { disputesApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Dispute Queue</Text>
          <Text style={styles.headerSub}>{disputes.length} case{disputes.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

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

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.electricTeal} /></View>
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchDisputes(true)} tintColor={COLORS.electricTeal} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold },
  headerSub: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, padding: SPACING.md },
  filterChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterChipActive: { backgroundColor: `${COLORS.electricTeal}15`, borderColor: COLORS.electricTeal },
  filterText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  filterTextActive: { color: COLORS.electricTeal },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { color: COLORS.textSecondary, marginTop: SPACING.md },
  list: { padding: SPACING.lg },
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
