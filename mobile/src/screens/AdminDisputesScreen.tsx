import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, TextInput,
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
  { id: 'investigating', label: 'Under Review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'rejected', label: 'Rejected' },
];

const CATEGORY_FILTERS = [
  { id: 'all', label: 'Any category' },
  { id: 'payment_issue', label: 'Payment' },
  { id: 'service_quality', label: 'Service' },
  { id: 'misconduct', label: 'Misconduct' },
  { id: 'unfair_rejection', label: 'Rejection' },
  { id: 'verification', label: 'Verification' },
  { id: 'other', label: 'Other' },
];

const ROLE_FILTERS = [
  { id: 'all', label: 'Anyone' },
  { id: 'customer', label: 'Customers' },
  { id: 'driver', label: 'Drivers' },
];

const DATE_FILTERS = [
  { id: 'all', label: 'Any time', days: 0 },
  { id: '1', label: '24h', days: 1 },
  { id: '7', label: '7 days', days: 7 },
  { id: '30', label: '30 days', days: 30 },
];

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  investigating: 'Under Review',
  resolved: 'Resolved',
  rejected: 'Rejected',
  closed: 'Closed',
};

const getStatusColors = (colors: ThemeColors): Record<string, string> => ({
  open: colors.amber,
  investigating: colors.info,
  resolved: colors.success,
  rejected: colors.coralRed,
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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [rideQuery, setRideQuery] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchDisputes = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const days = DATE_FILTERS.find((d) => d.id === dateFilter)?.days || 0;
      const person = personQuery.trim();
      const res = await disputesApi.getAdminDisputes({
        status: statusFilter === 'all' ? undefined : statusFilter,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        filedByRole: roleFilter === 'all' ? undefined : roleFilter,
        from: days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined,
        ride: rideQuery.trim() || undefined,
        // A user id matches either side of a ride dispute
        customerId: person && roleFilter !== 'driver' ? person : undefined,
        driverId: person && roleFilter === 'driver' ? person : undefined,
      });
      if (res.data?.success) setDisputes(res.data.data || []);
    } catch (err) {
      console.log('Failed to fetch disputes:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDisputes();
    }, [statusFilter, categoryFilter, roleFilter, dateFilter]),
  );

  const chips = (
    options: Array<{ id: string; label: string }>,
    value: string,
    onChange: (id: string) => void,
  ) => (
    <View style={styles.filterRow}>
      {options.map((f) => (
        <TouchableOpacity
          key={f.id}
          style={[styles.filterChip, value === f.id && styles.filterChipActive]}
          onPress={() => onChange(f.id)}
        >
          <Text style={[styles.filterText, value === f.id && styles.filterTextActive]}>{f.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const filterPanel = (
    <View>
      {chips(STATUS_FILTERS, statusFilter, setStatusFilter)}
      <TouchableOpacity style={styles.moreFilters} onPress={() => setShowFilters((s) => !s)}>
        <Ionicons name="options-outline" size={14} color={colors.electricTeal} />
        <Text style={styles.moreFiltersText}>{showFilters ? 'Hide filters' : 'More filters'}</Text>
      </TouchableOpacity>
      {showFilters && (
        <View>
          {chips(CATEGORY_FILTERS, categoryFilter, setCategoryFilter)}
          {chips(ROLE_FILTERS, roleFilter, setRoleFilter)}
          {chips(DATE_FILTERS, dateFilter, setDateFilter)}
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={rideQuery}
              onChangeText={setRideQuery}
              placeholder="Ride ref (GZ-…) or ride ID"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              onSubmitEditing={() => fetchDisputes()}
            />
            <TextInput
              style={styles.searchInput}
              value={personQuery}
              onChangeText={setPersonQuery}
              placeholder={roleFilter === 'driver' ? 'Driver user ID' : 'Customer user ID'}
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              onSubmitEditing={() => fetchDisputes()}
            />
            <TouchableOpacity style={styles.searchBtn} onPress={() => fetchDisputes()}>
              <Ionicons name="search" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
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
          <Text style={styles.filerName}>
            {filer.firstName} {filer.lastName}
            {item.filedByRole && item.filedByRole !== 'other' ? ` · ${item.filedByRole}` : ''}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[item.status] || colors.textTertiary}20` }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
              {STATUS_LABELS[item.status] || item.status}
            </Text>
          </View>
        </View>
        <Text style={styles.category}>
          {item.category?.replace(/_/g, ' ')}
          {item.rideReference ? ` · Ride ${item.rideReference}` : ''}
        </Text>
        <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
        <Text style={styles.date}>
          {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
          {item.assignedTo ? ` · Assigned to ${item.assignedTo.firstName || 'admin'}` : ''}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <AdminScreenLayout
      title="Dispute Queue"
      subtitle={`${disputes.length} case${disputes.length !== 1 ? 's' : ''}`}
      headerBottom={filterPanel}
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
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  filterChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: `${colors.electricTeal}15`, borderColor: colors.electricTeal },
  filterText: { color: colors.textSecondary, fontSize: FONT_SIZES.small },
  filterTextActive: { color: colors.electricTeal },
  moreFilters: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  moreFiltersText: { color: colors.electricTeal, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.semibold },
  searchRow: { flexDirection: 'row', gap: SPACING.xs, padding: SPACING.md },
  searchInput: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, color: colors.textPrimary,
    backgroundColor: colors.surface, fontSize: FONT_SIZES.small,
  },
  searchBtn: {
    backgroundColor: colors.electricTeal, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, justifyContent: 'center',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { color: colors.textSecondary, marginTop: SPACING.md },
  list: { padding: SPACING.md, paddingBottom: SPACING.xl },
  card: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  filerName: { color: colors.textPrimary, fontWeight: FONT_WEIGHTS.semibold, flex: 1, textTransform: 'capitalize' },
  statusPill: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.sm },
  statusText: { fontSize: 11, fontWeight: FONT_WEIGHTS.bold },
  category: { color: colors.amber, fontSize: FONT_SIZES.small, textTransform: 'capitalize', marginBottom: 4 },
  desc: { color: colors.textSecondary, fontSize: FONT_SIZES.small },
  date: { color: colors.textTertiary, fontSize: 11, marginTop: SPACING.sm },
});
