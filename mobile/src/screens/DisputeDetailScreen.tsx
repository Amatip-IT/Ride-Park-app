import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Image, Linking,
} from 'react-native';
import { disputesApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

const RESOLUTION_LABELS: Record<string, string> = {
  override_driver_approval: 'Driver Approved',
  override_provider_approval: 'Provider Approved',
  issue_refund: 'Refund Issued',
  suspend_user: 'User Suspended',
  close_no_action: 'Closed (No Action)',
  other: 'Resolved',
};

export function DisputeDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const disputeId = route.params?.disputeId as string;
  const [dispute, setDispute] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await disputesApi.getDispute(disputeId);
        if (res.data?.success) setDispute(res.data.data);
      } catch (err) {
        console.log('Failed to load dispute:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [disputeId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.electricTeal} />
      </View>
    );
  }

  if (!dispute) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Dispute not found</Text>
      </View>
    );
  }

  const about = dispute.complaintAbout;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispute Details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.statusValue}>{dispute.status}</Text>
        </View>

        <Text style={styles.sectionLabel}>Category</Text>
        <Text style={styles.bodyText}>{dispute.category?.replace(/_/g, ' ')}</Text>

        <Text style={styles.sectionLabel}>Description</Text>
        <Text style={styles.bodyText}>{dispute.description}</Text>

        {dispute.evidenceUrls?.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Evidence</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {dispute.evidenceUrls.map((url: string, index: number) => (
                <TouchableOpacity key={`${url}-${index}`} onPress={() => Linking.openURL(url)}>
                  <Image source={{ uri: url }} style={styles.evidenceImage} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {about && (
          <>
            <Text style={styles.sectionLabel}>Complaint About</Text>
            <Text style={styles.bodyText}>{about.firstName} {about.lastName}</Text>
          </>
        )}

        {dispute.resolution && (
          <>
            <Text style={styles.sectionLabel}>Resolution</Text>
            <Text style={[styles.bodyText, { color: COLORS.success }]}>
              {RESOLUTION_LABELS[dispute.resolution] || dispute.resolution}
            </Text>
            {dispute.resolutionNotes && (
              <Text style={styles.notesText}>{dispute.resolutionNotes}</Text>
            )}
          </>
        )}

        <Text style={styles.dateText}>
          Filed {dispute.createdAt ? new Date(dispute.createdAt).toLocaleString() : ''}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: COLORS.error },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold },
  scroll: { padding: SPACING.lg },
  statusRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  statusLabel: { color: COLORS.textSecondary },
  statusValue: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.bold, textTransform: 'capitalize' },
  sectionLabel: { color: COLORS.textTertiary, fontSize: FONT_SIZES.small, marginBottom: SPACING.xs, marginTop: SPACING.md },
  bodyText: { color: COLORS.textPrimary, lineHeight: 22 },
  evidenceImage: {
    width: 100,
    height: 100,
    borderRadius: BORDER_RADIUS.md,
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notesText: { color: COLORS.textSecondary, marginTop: SPACING.sm, fontStyle: 'italic' },
  dateText: { color: COLORS.textTertiary, fontSize: FONT_SIZES.small, marginTop: SPACING.xl },
});
