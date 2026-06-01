import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator,
  RefreshControl, Platform,
} from 'react-native';
import { disputesApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

const STATUS_COLORS: Record<string, string> = {
  open: COLORS.amber,
  investigating: COLORS.info,
  resolved: COLORS.success,
  closed: COLORS.textTertiary,
};

const CATEGORY_LABELS: Record<string, string> = {
  unfair_rejection: 'Unfair Rejection',
  payment_issue: 'Payment Issue',
  misconduct: 'Misconduct',
  service_quality: 'Service Quality',
  verification: 'Verification',
  other: 'Other',
};

type Dispute = {
  _id: string;
  category: string;
  description: string;
  status: string;
  resolution?: string;
  resolutionNotes?: string;
  createdAt?: string;
  complaintAbout?: { firstName?: string; lastName?: string };
};

export function DisputesScreen() {
  const navigation = useNavigation<any>();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDisputes = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await disputesApi.getMyDisputes();
      if (res.data?.success) setDisputes(res.data.data || []);
    } catch (err) {
      console.log('Failed to fetch disputes:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchDisputes(); }, []));

  const renderItem = ({ item }: { item: Dispute }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('DisputeDetail', { disputeId: item._id })}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.categoryText}>{CATEGORY_LABELS[item.category] || item.category}</Text>
        <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[item.status] || COLORS.textTertiary}20` }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || COLORS.textTertiary }]}>
            {item.status}
          </Text>
        </View>
      </View>
      <Text style={styles.descText} numberOfLines={2}>{item.description}</Text>
      <Text style={styles.dateText}>
        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>My Disputes</Text>
          <Text style={styles.headerSub}>Track complaints and resolutions</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('FileDispute')}>
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.electricTeal} /></View>
      ) : disputes.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={64} color={COLORS.textTertiary} />
          <Text style={styles.emptyTitle}>No disputes yet</Text>
          <Text style={styles.emptySub}>File a complaint if something went wrong.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('FileDispute')}>
            <Text style={styles.primaryBtnText}>File a Dispute</Text>
          </TouchableOpacity>
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
  addBtn: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.full,
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold },
  headerSub: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold, marginTop: SPACING.md },
  emptySub: { color: COLORS.textSecondary, marginTop: SPACING.sm, textAlign: 'center' },
  primaryBtn: {
    marginTop: SPACING.lg, backgroundColor: COLORS.electricTeal,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md,
  },
  primaryBtnText: { color: '#FFF', fontWeight: FONT_WEIGHTS.semibold },
  list: { padding: SPACING.lg },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  categoryText: { color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.semibold, flex: 1 },
  statusPill: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.sm },
  statusText: { fontSize: 11, fontWeight: FONT_WEIGHTS.bold, textTransform: 'capitalize' },
  descText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginBottom: SPACING.xs },
  dateText: { color: COLORS.textTertiary, fontSize: 11 },
});
