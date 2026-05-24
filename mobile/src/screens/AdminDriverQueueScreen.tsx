import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView, Platform, Linking,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { adminApi } from '@/api';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

// Human-readable labels for each doc field
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

const ALL_DOC_FIELDS = Object.keys(DOC_LABELS);

export function AdminDriverQueueScreen() {
  const navigation = useNavigation<any>();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getPendingDriverVerifications();
      if (res.data?.success) {
        setRecords(res.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch driver verifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (id: string, providerType: string, name: string) => {
    Alert.alert(
      'Approve Driver',
      `Are you sure you want to approve ${name}? They will be able to accept rides.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              setProcessingId(id);
              const res = await adminApi.approveDriverVerification(id, providerType);
              if (res.data?.success) {
                Alert.alert('Success!', res.data.message || 'Driver approved.');
                fetchRecords();
              } else {
                Alert.alert('Error', res.data?.message || 'Something went wrong');
              }
            } catch (err) {
              Alert.alert('Error', 'Failed to approve driver.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = (id: string, providerType: string, name: string) => {
    Alert.alert(
      'Reject Driver',
      `Are you sure you want to reject ${name}'s documents?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingId(id);
              await adminApi.rejectDriverVerification(id, providerType, 'Documents did not meet requirements');
              Alert.alert('Done', 'Verification rejected.');
              fetchRecords();
            } catch (err) {
              Alert.alert('Error', 'Failed to reject.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const openDocument = (url: string) => {
    if (url) Linking.openURL(url).catch(() => Alert.alert('Error', 'Cannot open document'));
  };

  const renderItem = ({ item }: { item: any }) => {
    const isProcessing = processingId === item._id;
    const userData = item.user || {};
    const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown';
    const providerType = item.providerType || 'driver';
    const roleLabel = providerType === 'taxi_driver' ? 'Taxi Driver' : 'Chauffeur';

    // Count uploaded documents
    const uploadedDocs = ALL_DOC_FIELDS.filter(f => item[f]);
    const totalDocs = ALL_DOC_FIELDS.length;

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {(userData.firstName?.[0] || '?').toUpperCase()}
              {(userData.lastName?.[0] || '').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nameText}>{fullName}</Text>
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>PENDING</Text>
          </View>
        </View>

        {/* Contact */}
        <View style={styles.detailRow}>
          <Ionicons name="mail-outline" size={15} color={COLORS.textTertiary} />
          <Text style={styles.detailText}>{userData.email || 'No email'}</Text>
        </View>
        {userData.phoneNumber && (
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={15} color={COLORS.textTertiary} />
            <Text style={styles.detailText}>{userData.phoneNumber}</Text>
          </View>
        )}

        {/* Document progress */}
        <View style={styles.progressRow}>
          <Ionicons name="documents-outline" size={16} color={COLORS.electricTeal} />
          <Text style={styles.progressText}>
            {uploadedDocs.length} of {totalDocs} documents uploaded
          </Text>
        </View>

        {/* Document grid */}
        <View style={styles.docsGrid}>
          {ALL_DOC_FIELDS.map(field => {
            const hasDoc = !!item[field];
            const docStatus = item.documentStatuses?.[field] || 'not_submitted';
            const label = DOC_LABELS[field] || field;

            return (
              <TouchableOpacity
                key={field}
                style={[
                  styles.docChip,
                  hasDoc ? styles.docChipUploaded : styles.docChipMissing,
                ]}
                disabled={!hasDoc}
                onPress={() => hasDoc && openDocument(item[field])}
              >
                <Ionicons
                  name={hasDoc ? 'document-attach' : 'close-circle-outline'}
                  size={14}
                  color={hasDoc ? COLORS.info : COLORS.textTertiary}
                />
                <Text
                  style={[
                    styles.docChipText,
                    { color: hasDoc ? COLORS.info : COLORS.textTertiary },
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Date */}
        <Text style={styles.dateText}>
          Last updated: {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : 'N/A'}
        </Text>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.rejectBtn, isProcessing && styles.btnDisabled]}
            disabled={isProcessing}
            onPress={() => handleReject(item._id, providerType, fullName)}
          >
            <Ionicons name="close" size={18} color={COLORS.error} />
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.approveBtn, isProcessing && styles.btnDisabled]}
            disabled={isProcessing}
            onPress={() => handleApprove(item._id, providerType, fullName)}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#FFF" />
                <Text style={styles.approveBtnText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Driver Verifications</Text>
          <Text style={styles.headerSub}>{records.length} pending review{records.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
          <Text style={styles.loadingText}>Loading submissions...</Text>
        </View>
      ) : records.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="checkmark-done-circle-outline" size={64} color={COLORS.success} />
          <Text style={styles.emptyTitle}>All Clear!</Text>
          <Text style={styles.emptySub}>No pending driver verifications to review.</Text>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  headerTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },
  headerSub: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2,
  },
  listContainer: { padding: SPACING.lg },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary, marginTop: SPACING.md },
  emptyTitle: {
    color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold, marginTop: SPACING.md,
  },
  emptySub: { color: COLORS.textSecondary, marginTop: 4 },

  // Card
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md,
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: `${COLORS.electricTeal}18`,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  avatarText: {
    color: COLORS.electricTeal, fontSize: 16, fontWeight: FONT_WEIGHTS.bold,
  },
  nameText: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold,
  },
  roleText: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 1,
  },
  pendingBadge: {
    backgroundColor: `${COLORS.amber}18`, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  pendingBadgeText: {
    color: COLORS.amber, fontSize: 10, fontWeight: 'bold',
  },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 5,
  },
  detailText: {
    color: COLORS.textSecondary, fontSize: 13, marginLeft: 6,
  },

  // Progress
  progressRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm, marginBottom: SPACING.sm,
  },
  progressText: {
    color: COLORS.electricTeal, fontSize: 13, fontWeight: FONT_WEIGHTS.medium, marginLeft: 6,
  },

  // Documents grid
  docsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.sm,
  },
  docChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: BORDER_RADIUS.sm, borderWidth: 1,
  },
  docChipUploaded: {
    borderColor: COLORS.info, backgroundColor: `${COLORS.info}08`,
  },
  docChipMissing: {
    borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt,
  },
  docChipText: {
    fontSize: 11, fontWeight: FONT_WEIGHTS.medium, maxWidth: 100,
  },

  dateText: {
    color: COLORS.textTertiary, fontSize: 11, marginBottom: SPACING.sm,
  },

  // Actions
  actionRow: {
    flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs,
  },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.error,
    backgroundColor: `${COLORS.error}08`,
  },
  rejectBtnText: {
    color: COLORS.error, fontWeight: FONT_WEIGHTS.semibold, fontSize: 13,
  },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.success,
  },
  approveBtnText: {
    color: '#FFF', fontWeight: FONT_WEIGHTS.bold, fontSize: 13,
  },
  btnDisabled: { opacity: 0.5 },
});
