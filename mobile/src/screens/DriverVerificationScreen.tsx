import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, SafeAreaView,
  ActivityIndicator
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';

// Maps the UI doc ID to the backend schema field name
const DOC_TO_FIELD: Record<string, string> = {
  nat_insurance: 'natInsuranceUrl',
  vat_cert: 'vatCertUrl',
  dvla_licence: 'dvlaLicenceUrl',
  bank_statement: 'bankStatementUrl',
  dvla_check_code: 'dvlaCheckCodeUrl',
  phv_driver_licence: 'phvDriverLicenceUrl',
  profile_photo: 'profilePhotoUrl',
  phvl: 'phvlUrl',
  v5c: 'v5cUrl',
  insurance: 'insuranceUrl',
  vehicle_inspection: 'vehicleInspectionUrl',
};

const DRIVER_DOCS = [
  { id: 'nat_insurance', title: 'National Insurance', optional: true },
  { id: 'vat_cert', title: 'VAT Certificate', optional: true },
  { id: 'dvla_licence', title: 'DVLA plastic driving licence', optional: false },
  { id: 'bank_statement', title: 'Bank statement', optional: false },
  { id: 'dvla_check_code', title: 'DVLA electronic counterpart check code', optional: false },
  { id: 'phv_driver_licence', title: 'Private Hire Driver Licence (Paper and Badge)', optional: false },
  { id: 'profile_photo', title: 'Profile photo', optional: false },
];

const VEHICLE_DOCS = [
  { id: 'phvl', title: 'Private hire vehicle licence (PHVL)', optional: false },
  { id: 'v5c', title: 'V5C Vehicle Logbook (2nd Page) or New Keeper Slip', optional: false },
  { id: 'insurance', title: 'Insurance Certificate', optional: false },
  { id: 'vehicle_inspection', title: 'UK vehicle inspection', optional: false },
];

export function DriverVerificationScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  
  const [docStatuses, setDocStatuses] = useState<Record<string, { status: string; expiry?: Date }>>({});
  const [loading, setLoading] = useState(true);
  const [overallStatus, setOverallStatus] = useState<string>('not_applied');

  useFocusEffect(
    useCallback(() => {
      const fetchStatus = async () => {
        setLoading(true);
        try {
          const { providerApi } = await import('@/api');
          const res = await providerApi.getVerificationStatus();
          if (res.data?.success) {
            const data = res.data.data;
            const backendStatus = data?.status || 'not_applied';
            setOverallStatus(backendStatus);
            
            const docs = data?.documents || {};
            const perDocStatuses = data?.documentStatuses || {};

            const newStatuses: Record<string, { status: string }> = {};
            
            // Map each document field to its UI doc ID with per-document status
            Object.entries(DOC_TO_FIELD).forEach(([uiId, fieldName]) => {
              if (docs[fieldName]) {
                // Document URL exists — check its individual status
                const docStatus = perDocStatuses[fieldName];
                if (docStatus === 'verified') {
                  newStatuses[uiId] = { status: 'Verified' };
                } else if (docStatus === 'rejected') {
                  newStatuses[uiId] = { status: 'Rejected' };
                } else if (docStatus === 'uploaded') {
                  newStatuses[uiId] = { status: 'Uploaded, Await Review' };
                } else {
                  // Fallback to overall status
                  if (backendStatus === 'approved') {
                    newStatuses[uiId] = { status: 'Verified' };
                  } else if (backendStatus === 'rejected') {
                    newStatuses[uiId] = { status: 'Rejected' };
                  } else {
                    newStatuses[uiId] = { status: 'Uploaded, Await Review' };
                  }
                }
              }
            });

            setDocStatuses(newStatuses);
          }
        } catch (err) {
          console.warn('Failed to fetch verification status', err);
        } finally {
          setLoading(false);
        }
      };

      fetchStatus();
    }, [])
  );

  const getStatusColor = (status: string | undefined, optional: boolean) => {
    if (status === 'Verified') return COLORS.success;
    if (status === 'Uploaded, Await Review' || status === 'Uploaded') return COLORS.amber;
    if (status === 'Rejected' || status === 'Expired') return COLORS.error;
    if (optional) return COLORS.textSecondary;
    return COLORS.textTertiary; // Not submitted — neutral grey
  };

  const getStatusText = (status: string | undefined, optional: boolean) => {
    if (status) return status;
    if (optional) return 'Optional';
    return 'Not Submitted';
  };

  const renderDocItem = (item: typeof DRIVER_DOCS[0]) => {
    const docData = docStatuses[item.id];
    const statusText = getStatusText(docData?.status, item.optional);
    const statusColor = getStatusColor(docData?.status, item.optional);

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.docItem}
        onPress={() => navigation.navigate('DocumentUpload', {
          docId: item.id,
          docTitle: item.title,
          docStatus: statusText,
        })}
        activeOpacity={0.7}
      >
        <View style={styles.docInfo}>
          <Text style={styles.docTitle}>{item.title}</Text>
          <Text style={[styles.docStatus, { color: statusColor }]}>{statusText}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verification</Text>
        <TouchableOpacity style={styles.helpBtn} onPress={() => navigation.navigate('LegalDocument', { documentType: 'help' })}>
          <Text style={styles.helpText}>Help</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Overall status banner */}
        {overallStatus === 'approved' && (
          <View style={[styles.alertBox, { backgroundColor: '#F0FFF4', borderColor: COLORS.success }]}>
            <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
            <Text style={[styles.alertText, { color: COLORS.success }]}>
              Your documents have been verified! You are approved to accept rides.
            </Text>
          </View>
        )}
        {(overallStatus === 'pending_admin_review' || overallStatus === 'pending_auto_check') && (
          <View style={[styles.alertBox, { backgroundColor: '#FFFBEB', borderColor: COLORS.amber }]}>
            <Ionicons name="time" size={24} color={COLORS.amber} />
            <Text style={[styles.alertText, { color: '#92400E' }]}>
              Your documents have been submitted and are under review. You will be notified once approved.
            </Text>
          </View>
        )}
        {overallStatus === 'rejected' && (
          <View style={[styles.alertBox, { backgroundColor: '#FEF2F2', borderColor: COLORS.error }]}>
            <Ionicons name="warning" size={24} color={COLORS.error} />
            <Text style={[styles.alertText, { color: COLORS.error }]}>
              Your documents were rejected. Please review and resubmit.
            </Text>
          </View>
        )}
        {overallStatus === 'not_applied' && (
          <View style={styles.alertBox}>
            <Ionicons name="information-circle" size={24} color={COLORS.info} />
            <Text style={styles.alertText}>
              Documents expire every 6 months. You will be notified 1 month before expiry to upload new ones.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Driver requirements</Text>
        <View style={styles.listContainer}>
          {DRIVER_DOCS.map(renderDocItem)}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: SPACING.xl }]}>
          {user?.taxiType || 'Vehicle'} requirements
        </Text>
        <View style={styles.listContainer}>
          {VEHICLE_DOCS.map(renderDocItem)}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.background,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: {
    color: COLORS.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold, flex: 1, textAlign: 'center',
  },
  helpBtn: {
    backgroundColor: '#F1F5F9', paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: 20,
  },
  helpText: { color: COLORS.textPrimary, fontSize: 13, fontWeight: FONT_WEIGHTS.medium },
  content: { padding: SPACING.lg, paddingBottom: 60 },
  alertBox: {
    flexDirection: 'row', backgroundColor: '#F0F9FF', padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: '#BAE6FD',
    marginBottom: SPACING.xl, alignItems: 'flex-start'
  },
  alertText: {
    flex: 1, color: '#0369A1', fontSize: 13, marginLeft: SPACING.sm, lineHeight: 18,
  },
  sectionTitle: {
    color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
  },
  listContainer: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  docItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  docInfo: { flex: 1, marginRight: SPACING.sm },
  docTitle: { color: COLORS.textPrimary, fontSize: 15, marginBottom: 4 },
  docStatus: { fontSize: 13, fontWeight: FONT_WEIGHTS.medium },
});
