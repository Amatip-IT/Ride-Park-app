import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView, Platform, Linking, Image,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { adminApi } from '@/api';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export function AdminIdentityQueueScreen() {
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
            } catch (err) {
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
    Alert.prompt
      ? Alert.prompt(
          'Reject Identity',
          `Enter a reason for rejecting ${name}'s documents:`,
          async (reason: string) => {
            if (!reason?.trim()) return;
            try {
              setProcessingId(id);
              await adminApi.rejectIdentityVerification(id, reason);
              Alert.alert('Done', 'Identity verification rejected.');
              fetchRecords();
            } catch (err) {
              Alert.alert('Error', 'Failed to reject.');
            } finally {
              setProcessingId(null);
            }
          },
        )
      : Alert.alert(
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
    const fullName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Unknown';
    const roleLabel =
      item.role === 'parking_provider' ? 'Parking Provider' :
      item.role === 'driver' ? 'Chauffeur' :
      item.role === 'taxi_driver' ? 'Taxi Driver' :
      item.role || 'Provider';

    return (
      <TouchableOpacity 
        style={styles.card}
        onPress={() => navigation.navigate('AdminProviderDetail', { provider: item })}
        activeOpacity={0.7}
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
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>PENDING</Text>
          </View>
        </View>

        {/* Contact */}
        <View style={styles.detailRow}>
          <Ionicons name="mail-outline" size={15} color={COLORS.textTertiary} />
          <Text style={styles.detailText}>{item.email}</Text>
        </View>
        {item.phoneNumber && (
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={15} color={COLORS.textTertiary} />
            <Text style={styles.detailText}>{item.phoneNumber}</Text>
          </View>
        )}

        {/* ID Type */}
        {item.idType && (
          <View style={styles.detailRow}>
            <Ionicons name="card-outline" size={15} color={COLORS.textTertiary} />
            <Text style={styles.detailText}>ID Type: {item.idType}</Text>
          </View>
        )}

        {/* Document links */}
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

        {/* Date submitted */}
        <Text style={styles.dateText}>
          Submitted: {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}
        </Text>

        {/* Action buttons */}
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
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Identity Documents</Text>
        <Text style={styles.headerSub}>{records.length} pending review{records.length !== 1 ? 's' : ''}</Text>
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
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
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

  // Documents
  docsRow: {
    flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, marginBottom: SPACING.sm,
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
