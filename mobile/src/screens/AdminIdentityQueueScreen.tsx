import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView, Platform, Linking,
  useWindowDimensions,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { adminApi } from '@/api';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAdminDashboardBack } from '@/components/admin/AdminScreenLayout';

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  const display = value?.trim() ? value : '—';
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value} selectable>{display}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    marginBottom: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  label: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  value: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.label,
    lineHeight: 20,
  },
});

export function AdminIdentityQueueScreen() {
  const navigation = useNavigation<any>();
  const goToDashboard = useAdminDashboardBack();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - SPACING.md * 2;

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getPendingIdentityVerifications();
      if (res.data?.success) {
        setRecords(res.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch identity records:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleApprove = (id: string, name: string) => {
    Alert.alert(
      'Approve Identity',
      `Approve ${name}'s identity documents? They will be marked as verified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              setProcessingId(id);
              const res = await adminApi.approveIdentityVerification(id);
              if (res.data?.success) {
                Alert.alert('Success!', res.data.message || 'Identity verified.');
                fetchRecords();
              } else {
                Alert.alert('Error', res.data?.message || 'Something went wrong');
              }
            } catch {
              Alert.alert('Error', 'Failed to approve identity.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = (id: string, name: string) => {
    if (typeof Alert.prompt === 'function') {
      Alert.prompt(
        'Reject Identity',
        `Enter a reason for rejecting ${name}'s documents:`,
        async (reason: string) => {
          if (!reason?.trim()) return;
          try {
            setProcessingId(id);
            await adminApi.rejectIdentityVerification(id, reason);
            Alert.alert('Done', 'Identity verification rejected.');
            fetchRecords();
          } catch {
            Alert.alert('Error', 'Failed to reject.');
          } finally {
            setProcessingId(null);
          }
        },
      );
      return;
    }

    Alert.alert(
      'Reject Identity',
      `Are you sure you want to reject ${name}'s documents?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingId(id);
              await adminApi.rejectIdentityVerification(id, 'Rejected by admin');
              Alert.alert('Done', 'Identity rejected.');
              fetchRecords();
            } catch {
              Alert.alert('Error', 'Failed to reject.');
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const openDocument = async (url: string) => {
    if (!url) return;
    try {
      const res = await adminApi.getPresignedUrl(url);
      const presigned = res.data?.url || url;
      await Linking.openURL(presigned);
    } catch {
      Alert.alert('Error', 'Cannot open document');
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isProcessing = processingId === item._id;
    const isExpanded = expandedIds.has(item._id);
    const fullName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Unknown';
    const roleLabel =
      item.role === 'parking_provider' ? 'Parking Provider' :
      item.role === 'driver' ? 'Chauffeur' :
      item.role === 'taxi_driver' ? 'Taxi Driver' :
      item.role || 'Provider';

    return (
      <View style={[styles.card, { width: cardWidth }]}>
        <TouchableOpacity
          style={styles.cardHeaderTouchable}
          onPress={() => toggleExpanded(item._id)}
          activeOpacity={0.75}
        >
          <View style={styles.cardHeader}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {(item.firstName?.[0] || '?').toUpperCase()}
                {(item.lastName?.[0] || '').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nameText}>{fullName}</Text>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>PENDING</Text>
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={COLORS.textTertiary}
              />
            </View>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="mail-outline" size={15} color={COLORS.textTertiary} />
            <Text style={styles.detailText} numberOfLines={1}>{item.email}</Text>
          </View>
          {!isExpanded && (
            <Text style={styles.expandHint}>Tap to view identity documents and details</Text>
          )}
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedBody}>
            <Text style={styles.sectionTitle}>Provider Details</Text>
            <DetailRow label="Full Name" value={fullName} />
            <DetailRow label="Email" value={item.email} />
            <DetailRow label="Phone" value={item.phoneNumber} />
            <DetailRow label="Role" value={roleLabel} />
            <DetailRow label="ID Type" value={item.idType} />
            <DetailRow
              label="Submitted"
              value={item.createdAt ? new Date(item.createdAt).toLocaleString() : undefined}
            />
            {item.dateOfBirth && <DetailRow label="Date of Birth" value={item.dateOfBirth} />}
            {item.address && <DetailRow label="Address" value={item.address} />}

            <Text style={styles.sectionTitle}>Documents</Text>
            <View style={styles.docsRow}>
              {item.identityDocumentUrl ? (
                <TouchableOpacity style={styles.docButton} onPress={() => openDocument(item.identityDocumentUrl)}>
                  <Ionicons name="document-attach-outline" size={16} color={COLORS.info} />
                  <Text style={styles.docButtonText}>View ID</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.docButton, styles.docMissing]}>
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                  <Text style={[styles.docButtonText, { color: COLORS.error }]}>No ID</Text>
                </View>
              )}

              {item.proofOfAddressUrl ? (
                <TouchableOpacity style={styles.docButton} onPress={() => openDocument(item.proofOfAddressUrl)}>
                  <Ionicons name="home-outline" size={16} color={COLORS.info} />
                  <Text style={styles.docButtonText}>View Address Proof</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.docButton, styles.docMissing]}>
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                  <Text style={[styles.docButtonText, { color: COLORS.error }]}>No Address Proof</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.profileLink}
              onPress={() => navigation.navigate('AdminProviderDetail', { provider: item })}
            >
              <Ionicons name="open-outline" size={16} color={COLORS.electricTeal} />
              <Text style={styles.profileLinkText}>Open full provider profile</Text>
            </TouchableOpacity>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.rejectBtn, isProcessing && styles.btnDisabled]}
                disabled={isProcessing}
                onPress={() => handleReject(item._id, fullName)}
              >
                <Ionicons name="close" size={18} color={COLORS.error} />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.approveBtn, isProcessing && styles.btnDisabled]}
                disabled={isProcessing}
                onPress={() => handleApprove(item._id, fullName)}
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
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={goToDashboard}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Identity Documents</Text>
          <Text style={styles.headerSub}>
            {records.length} pending · expand each card to review before approval
          </Text>
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
          <Text style={styles.emptySub}>No pending identity documents to review.</Text>
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
    paddingHorizontal: SPACING.md,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },
  headerSub: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginTop: 4, lineHeight: 18,
  },
  listContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  loadingText: { color: COLORS.textSecondary, marginTop: SPACING.md },
  emptyTitle: {
    color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold, marginTop: SPACING.md,
  },
  emptySub: { color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },

  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  cardHeaderTouchable: {
    padding: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  expandHint: {
    color: COLORS.electricTeal,
    fontSize: 12,
    marginTop: SPACING.xs,
    fontWeight: FONT_WEIGHTS.medium,
  },
  expandedBody: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
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
    color: COLORS.textSecondary, fontSize: 13, marginLeft: 6, flex: 1,
  },

  docsRow: {
    flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  docButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.info,
    backgroundColor: `${COLORS.info}08`,
  },
  docMissing: {
    borderColor: COLORS.error, backgroundColor: `${COLORS.error}08`,
  },
  docButtonText: {
    color: COLORS.info, fontSize: 12, fontWeight: FONT_WEIGHTS.semibold,
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  profileLinkText: {
    color: COLORS.electricTeal,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },

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
