import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Platform, Modal, TextInput, Alert,
} from 'react-native';
import { adminApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const DOC_LABELS: Record<string, string> = {
  natInsuranceUrl: 'National Insurance',
  vatCertUrl: 'VAT Certificate',
  dvlaLicenceUrl: 'DVLA Driving Licence',
  bankStatementUrl: 'Bank Statement',
  dvlaCheckCodeUrl: 'DVLA Check Code',
  phvDriverLicenceUrl: 'PHV Driver Licence',
  profilePhotoUrl: 'Profile Photo',
  phvlUrl: 'PHV Licence (PHVL)',
  v5cUrl: 'V5C Logbook',
  insuranceUrl: 'Insurance Certificate',
  vehicleInspectionUrl: 'Vehicle Inspection',
};

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: '30_day', label: '30 Days' },
  { id: '7_day', label: '7 Days' },
  { id: 'expired', label: 'Expired' },
];

const ALERT_COLORS: Record<string, string> = {
  '30_day': COLORS.amber,
  '7_day': COLORS.error,
  expired: COLORS.error,
};

type ExpiringRecord = {
  _id: string;
  providerType: string;
  user: { firstName?: string; lastName?: string; email?: string };
  expiringDocuments: Array<{
    docField: string;
    expiryDate: string;
    daysRemaining: number;
    alertLevel: string;
  }>;
  canAcceptRides?: boolean;
};

type RenewModal = {
  recordId: string;
  providerType: string;
  docField: string;
  driverName: string;
} | null;

export function AdminExpiringDocumentsScreen() {
  const navigation = useNavigation<any>();
  const [records, setRecords] = useState<ExpiringRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [renewModal, setRenewModal] = useState<RenewModal>(null);
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRecords = async (filter = activeFilter) => {
    try {
      const res = await adminApi.getExpiringDocuments(
        filter === 'all' ? 'all' : (filter as '30_day' | '7_day' | 'expired'),
      );
      if (res.data?.success) {
        setRecords(res.data.data?.all || []);
      }
    } catch (err) {
      console.log('Failed to fetch expiring documents:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [activeFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecords();
  };

  const handleRenew = async () => {
    if (!renewModal || !newExpiryDate.trim()) {
      Alert.alert('Date Required', 'Enter a new expiry date (YYYY-MM-DD).');
      return;
    }

    const parsed = new Date(newExpiryDate);
    if (isNaN(parsed.getTime())) {
      Alert.alert('Invalid Date', 'Use format YYYY-MM-DD, e.g. 2027-12-31');
      return;
    }

    try {
      setProcessing(true);
      const res = await adminApi.renewDocument(
        renewModal.recordId,
        renewModal.providerType,
        renewModal.docField,
        parsed.toISOString(),
      );
      if (res.data?.success) {
        Alert.alert('Renewed', 'Document expiry updated and driver notified.');
        setRenewModal(null);
        setNewExpiryDate('');
        fetchRecords();
      } else {
        Alert.alert('Error', res.data?.message || 'Renewal failed');
      }
    } catch {
      Alert.alert('Error', 'Failed to renew document');
    } finally {
      setProcessing(false);
    }
  };

  const renderRecord = ({ item }: { item: ExpiringRecord }) => {
    const name = item.user
      ? `${item.user.firstName || ''} ${item.user.lastName || ''}`.trim()
      : 'Unknown Driver';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>{name}</Text>
            <Text style={styles.driverEmail}>{item.user?.email}</Text>
            <Text style={styles.providerType}>
              {item.providerType === 'taxi_driver' ? 'Taxi Driver' : 'Chauffeur'}
            </Text>
          </View>
          {!item.canAcceptRides && (
            <View style={styles.disabledBadge}>
              <Text style={styles.disabledBadgeText}>Rides Off</Text>
            </View>
          )}
        </View>

        {item.expiringDocuments.map((doc) => {
          const color = ALERT_COLORS[doc.alertLevel] || COLORS.textSecondary;
          return (
            <View key={doc.docField} style={styles.docRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docName}>{DOC_LABELS[doc.docField] || doc.docField}</Text>
                <Text style={styles.docMeta}>
                  {doc.daysRemaining < 0
                    ? `Expired ${Math.abs(doc.daysRemaining)} day(s) ago`
                    : `Expires in ${doc.daysRemaining} day(s)`}
                  {' · '}
                  {new Date(doc.expiryDate).toLocaleDateString('en-GB')}
                </Text>
              </View>
              <View style={[styles.alertPill, { backgroundColor: `${color}20` }]}>
                <Text style={[styles.alertPillText, { color }]}>
                  {doc.alertLevel === 'expired' ? 'Expired' : doc.alertLevel === '7_day' ? 'Urgent' : 'Soon'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.renewBtn}
                onPress={() => {
                  setRenewModal({
                    recordId: item._id,
                    providerType: item.providerType,
                    docField: doc.docField,
                    driverName: name,
                  });
                  setNewExpiryDate('');
                }}
              >
                <Text style={styles.renewBtnText}>Renew</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Expiring Documents</Text>
          <Text style={styles.headerSubtitle}>{records.length} driver(s) need attention</Text>
        </View>
      </View>

      <View style={styles.tabsRow}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.filterTab, activeFilter === tab.id && styles.filterTabActive]}
            onPress={() => { setLoading(true); setActiveFilter(tab.id); }}
          >
            <Text style={[styles.filterTabText, activeFilter === tab.id && styles.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item._id}
          renderItem={renderRecord}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.electricTeal} />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="document-text-outline" size={48} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>No expiring documents in this category.</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!renewModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Approve Renewal</Text>
            <Text style={styles.modalSubtitle}>
              {renewModal?.driverName} — {DOC_LABELS[renewModal?.docField || ''] || renewModal?.docField}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="New expiry date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.textTertiary}
              value={newExpiryDate}
              onChangeText={setNewExpiryDate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setRenewModal(null); setNewExpiryDate(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleRenew} disabled={processing}>
                {processing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Approve</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.xl, paddingTop: Platform.OS === 'ios' ? 60 : 40,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  headerSubtitle: { fontSize: FONT_SIZES.body, color: COLORS.textSecondary, marginTop: 4 },
  tabsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm,
    padding: SPACING.md, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  filterTab: {
    paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  filterTabActive: { backgroundColor: COLORS.electricTeal, borderColor: COLORS.electricTeal },
  filterTabText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.medium },
  filterTabTextActive: { color: '#FFF' },
  listContent: { padding: SPACING.md },
  card: {
    backgroundColor: '#FFF', borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.md },
  driverName: { fontSize: 16, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  driverEmail: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  providerType: { fontSize: 12, color: COLORS.textTertiary, marginTop: 2 },
  disabledBadge: {
    backgroundColor: `${COLORS.error}15`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  disabledBadgeText: { fontSize: 11, color: COLORS.error, fontWeight: FONT_WEIGHTS.bold },
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  docName: { fontSize: 14, fontWeight: FONT_WEIGHTS.medium, color: COLORS.textPrimary },
  docMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  alertPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  alertPillText: { fontSize: 11, fontWeight: FONT_WEIGHTS.bold },
  renewBtn: {
    paddingHorizontal: SPACING.sm, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.electricTeal,
  },
  renewBtnText: { color: '#FFF', fontSize: 12, fontWeight: FONT_WEIGHTS.bold },
  centered: { alignItems: 'center', padding: SPACING.xl, marginTop: 40 },
  emptyText: { marginTop: SPACING.md, fontSize: 15, color: COLORS.textSecondary, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.xl, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  modalSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: SPACING.lg },
  modalInput: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, color: COLORS.textPrimary, fontSize: 14,
  },
  modalActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg },
  modalCancel: {
    flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  modalCancelText: { color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.bold },
  modalConfirm: {
    flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.electricTeal, alignItems: 'center',
  },
  modalConfirmText: { color: '#FFF', fontWeight: FONT_WEIGHTS.bold },
});
