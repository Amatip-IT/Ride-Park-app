import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { adminApi } from '@/api';
import { PresignedDocumentImage } from '@/components/admin/PresignedDocumentImage';

type ParamList = {
  AdminProviderDetail: { provider: any };
};

export function AdminProviderDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'AdminProviderDetail'>>();
  const { provider } = route.params;
  const [processing, setProcessing] = useState(false);

  const fullName = `${provider.firstName || ''} ${provider.lastName || ''}`.trim() || 'Unknown';
  const roleLabel =
    provider.role === 'parking_provider' ? 'Parking Provider' :
    provider.role === 'driver' ? 'Private Driver' :
    provider.role === 'taxi_driver' ? 'Taxi Driver' :
    provider.role || 'Provider';

  const documents = [
    { label: 'Identity Document', url: provider.identityDocumentUrl, icon: 'id-card-outline' },
    { label: 'Proof of Address', url: provider.proofOfAddressUrl, icon: 'home-outline' },
  ];

  const handleApprove = () => {
    Alert.alert(
      'Approve Provider',
      `Are you certain you want to approve ${fullName}'s documents? They will be marked as verified and can begin accepting jobs.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              setProcessing(true);
              const res = await adminApi.approveIdentityVerification(provider._id);
              if (res.data?.success) {
                Alert.alert('Approved!', `${fullName} is now verified.`);
                navigation.goBack();
              } else {
                Alert.alert('Error', res.data?.message || 'Approval failed.');
              }
            } catch (err) {
              Alert.alert('Error', 'Failed to approve provider.');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleReject = () => {
    Alert.alert(
      'Reject Provider',
      `Reject ${fullName}'s documents? They will need to resubmit.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessing(true);
              await adminApi.rejectIdentityVerification(provider._id, 'Documents not satisfactory. Please resubmit.');
              Alert.alert('Rejected', `${fullName}'s verification has been rejected.`);
              navigation.goBack();
            } catch (err) {
              Alert.alert('Error', 'Failed to reject.');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Provider Details</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Provider Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {(provider.firstName?.[0] || '?').toUpperCase()}
              {(provider.lastName?.[0] || '').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.providerName}>{fullName}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{roleLabel}</Text>
          </View>

          <View style={styles.contactSection}>
            <View style={styles.contactRow}>
              <Ionicons name="mail-outline" size={16} color={colors.electricTeal} />
              <Text style={styles.contactText}>{provider.email}</Text>
            </View>
            {provider.phoneNumber && (
              <View style={styles.contactRow}>
                <Ionicons name="call-outline" size={16} color={colors.electricTeal} />
                <Text style={styles.contactText}>{provider.phoneNumber}</Text>
              </View>
            )}
            {provider.idType && (
              <View style={styles.contactRow}>
                <Ionicons name="card-outline" size={16} color={colors.electricTeal} />
                <Text style={styles.contactText}>ID Type: {provider.idType}</Text>
              </View>
            )}
            <View style={styles.contactRow}>
              <Ionicons name="time-outline" size={16} color={colors.textTertiary} />
              <Text style={styles.contactText}>
                Submitted: {provider.createdAt ? new Date(provider.createdAt).toLocaleDateString() : 'N/A'}
              </Text>
            </View>
          </View>
        </View>

        {/* Documents Section */}
        <Text style={styles.sectionTitle}>Uploaded Documents</Text>

        {documents.map((doc, index) => (
          <View key={index} style={styles.docCard}>
            <View style={styles.docHeader}>
              <Ionicons name={doc.icon as any} size={20} color={colors.info} />
              <Text style={styles.docLabel}>{doc.label}</Text>
              {doc.url ? (
                <View style={[styles.statusChip, { backgroundColor: `${colors.success}15` }]}>
                  <Text style={[styles.statusChipText, { color: colors.success }]}>Uploaded</Text>
                </View>
              ) : (
                <View style={[styles.statusChip, { backgroundColor: `${colors.error}15` }]}>
                  <Text style={[styles.statusChipText, { color: colors.error }]}>Missing</Text>
                </View>
              )}
            </View>

            {doc.url ? (
              <PresignedDocumentImage url={doc.url} label={doc.label} height={220} />
            ) : (
              <View style={styles.missingBox}>
                <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
                <Text style={styles.missingText}>This document has not been uploaded yet.</Text>
              </View>
            )}
          </View>
        ))}

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.rejectButton, processing && styles.disabled]}
            disabled={processing}
            onPress={handleReject}
          >
            <Ionicons name="close-circle-outline" size={20} color={colors.error} />
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.approveButton, processing && styles.disabled]}
            disabled={processing}
            onPress={handleApprove}
          >
            {processing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
                <Text style={styles.approveText}>Approve Provider</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: {
    color: colors.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold,
  },
  content: { padding: SPACING.lg, paddingBottom: 40 },

  // Info Card
  infoCard: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl, marginBottom: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: `${colors.electricTeal}18`,
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md,
  },
  avatarText: {
    color: colors.electricTeal, fontSize: 26, fontWeight: FONT_WEIGHTS.bold,
  },
  providerName: {
    color: colors.textPrimary, fontSize: 22, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  roleBadge: {
    backgroundColor: `${colors.electricTeal}15`, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 20, marginBottom: SPACING.lg,
  },
  roleBadgeText: {
    color: colors.electricTeal, fontSize: 13, fontWeight: FONT_WEIGHTS.semibold,
  },
  contactSection: { width: '100%' },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  contactText: {
    color: colors.textSecondary, fontSize: 14,
  },

  // Documents
  sectionTitle: {
    color: colors.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
  },
  docCard: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: colors.border,
  },
  docHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  docLabel: {
    flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold,
  },
  statusChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
  },
  statusChipText: {
    fontSize: 11, fontWeight: FONT_WEIGHTS.bold,
  },
  missingBox: {
    alignItems: 'center', paddingVertical: SPACING.xl,
    backgroundColor: `${colors.error}05`, borderRadius: BORDER_RADIUS.md,
  },
  missingText: {
    color: colors.textSecondary, fontSize: 13, marginTop: SPACING.sm,
  },

  // Actions
  actionsContainer: {
    flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.xl,
  },
  rejectButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, paddingVertical: 14,
    borderRadius: BORDER_RADIUS.lg, borderWidth: 1.5, borderColor: colors.error,
    backgroundColor: `${colors.error}08`,
  },
  rejectText: {
    color: colors.error, fontSize: 15, fontWeight: FONT_WEIGHTS.bold,
  },
  approveButton: {
    flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, paddingVertical: 14,
    borderRadius: BORDER_RADIUS.lg, backgroundColor: colors.success,
    shadowColor: colors.success, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  approveText: {
    color: '#FFF', fontSize: 15, fontWeight: FONT_WEIGHTS.bold,
  },
  disabled: { opacity: 0.5 },
});
