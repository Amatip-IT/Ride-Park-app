import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Platform, Modal, TextInput } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { adminApi } from '@/api';
import { Ionicons } from '@expo/vector-icons';

export function AdminVerificationQueueScreen() {
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{id: string; name: string} | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchVerifications();
  }, []);

  const fetchVerifications = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getPendingParkingVerifications();
      if (res.data?.success) {
        setVerifications(res.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  const handeApprove = async (id: string, name: string) => {
    Alert.alert(
      "Approve Parking Provider",
      `Are you sure you want to approve ${name}'s parking application? This will create their live searching Parking Space.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          style: "default",
          onPress: async () => {
            try {
              setProcessingId(id);
              const res = await adminApi.approveParkingVerification(id);
              if (res.data?.success) {
                Alert.alert("Success!", "Provider approved and Parking Space created successfully.");
                fetchVerifications();
              } else {
                Alert.alert("Error", res.data?.message || "Something went wrong");
              }
            } catch (err) {
              Alert.alert("Error", "Failed to process approval.");
            } finally {
              setProcessingId(null);
            }
          }
        }
      ]
    );
  };

  const handleReject = (id: string, name: string) => {
    setRejectModal({ id, name });
    setRejectionReason('');
  };

  const submitRejection = async () => {
    if (!rejectModal || !rejectionReason.trim()) {
      Alert.alert('Error', 'Please provide a rejection reason');
      return;
    }

    try {
      setProcessingId(rejectModal.id);
      const res = await adminApi.rejectParkingVerification(rejectModal.id, rejectionReason);
      if (res.data?.success) {
        Alert.alert('Done', 'Parking provider has been rejected and notified via email and push notification.');
        setRejectModal(null);
        fetchVerifications();
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to reject');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to reject parking provider.');
    } finally {
      setProcessingId(null);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isProcessing = processingId === item._id;
    const userName = `${item.user?.firstName || ''} ${item.user?.lastName || ''}`.trim();
    const parkName = item.documents?.parkName || 'No Park Name Provided';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.title}>{parkName}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>PENDING</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="person-outline" size={16} color={COLORS.softSlate} />
          <Text style={styles.detailText}>{userName} ({item.user?.email})</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={16} color={COLORS.softSlate} />
          <Text style={styles.detailText}>{item.address || 'Address missing'} | {item.postcode || 'No Postcode'}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.rejectBtn, isProcessing && styles.btnDisabled]}
            disabled={isProcessing}
            onPress={() => handleReject(item._id, userName)}
          >
            <Ionicons name="close" size={18} color={COLORS.error} />
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.approveBtn, isProcessing && styles.btnDisabled]}
            disabled={isProcessing}
            onPress={() => handeApprove(item._id, userName)}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={COLORS.cloudWhite} />
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
        <Text style={styles.headerTitle}>Verification Queue</Text>
      </View>
      
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
          <Text style={styles.loadingText}>Fetching pending applications...</Text>
        </View>
      ) : verifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="checkmark-circle-outline" size={64} color={COLORS.success} />
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptySub}>There are no pending applications.</Text>
        </View>
      ) : (
        <FlatList
          data={verifications}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Rejection Reason Modal */}
      <Modal visible={!!rejectModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rejection Reason</Text>
              <TouchableOpacity onPress={() => setRejectModal(null)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Provide detailed feedback for {rejectModal?.name}
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="e.g., Poor property photos, insufficient parking spaces, location issues..."
              placeholderTextColor={COLORS.textTertiary}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setRejectModal(null)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, !rejectionReason.trim() && styles.submitBtnDisabled]}
                onPress={submitRejection}
                disabled={!rejectionReason.trim()}
              >
                <Text style={styles.submitBtnText}>Send Rejection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
  },
  listContainer: {
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    flex: 1,
  },
  statusBadge: {
    backgroundColor: 'rgba(243, 156, 18, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: COLORS.amber,
    fontSize: 10,
    fontWeight: 'bold',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginLeft: 6,
  },
  approveBtn: {
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  approveBtnText: {
    color: '#FFF',
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.md,
  },
  emptySub: {
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // Action row
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error,
    backgroundColor: `${COLORS.error}08`,
  },
  rejectBtnText: {
    color: COLORS.error,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 13,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.xl,
    paddingBottom: 40,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.label,
    marginBottom: SPACING.lg,
  },
  reasonInput: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: SPACING.xl,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: `${COLORS.textTertiary}15`,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: FONT_SIZES.label,
  },
  submitBtn: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.error,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFF',
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: FONT_SIZES.label,
  },
});
