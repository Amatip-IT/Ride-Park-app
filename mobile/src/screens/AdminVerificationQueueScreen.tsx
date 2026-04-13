import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, Platform } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { adminApi } from '@/api';
import { Ionicons } from '@expo/vector-icons';

export function AdminVerificationQueueScreen() {
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

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

        <TouchableOpacity 
          style={[styles.approveBtn, isProcessing && styles.btnDisabled]}
          disabled={isProcessing}
          onPress={() => handeApprove(item._id, userName)}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={COLORS.cloudWhite} />
          ) : (
            <Text style={styles.approveBtnText}>Approve Provider</Text>
          )}
        </TouchableOpacity>
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
});
