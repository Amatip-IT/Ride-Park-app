import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { providerApi } from '@/api';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

type VerificationStatus = 'not_applied' | 'pending_admin_review' | 'approved' | 'rejected';

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  not_applied: { color: COLORS.softSlate, label: 'Not Applied', icon: 'document-outline' },
  pending_auto_check: { color: COLORS.amber, label: 'Under Review', icon: 'time-outline' },
  pending_admin_review: { color: COLORS.amber, label: 'Under Review', icon: 'time-outline' },
  approved: { color: COLORS.success, label: 'Verified', icon: 'checkmark-circle' },
  rejected: { color: COLORS.coralRed, label: 'Rejected', icon: 'close-circle' },
};

// Document item for the checklist
interface DocItem {
  key: string;
  label: string;
  type: 'image' | 'text' | 'select';
  required: boolean;
  options?: string[]; // for select type
}

export function ProviderVerificationScreen() {
  const { user } = useAuthStore();
  const role = user?.role || 'parking_provider';

  const [status, setStatus] = useState<VerificationStatus>('not_applied');
  const [documents, setDocuments] = useState<Record<string, any>>({});
  const [vehicleInfo, setVehicleInfo] = useState<Record<string, any>>({});
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedImages, setSelectedImages] = useState<Record<string, string>>({});

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await providerApi.getVerificationStatus();
      if (res.data?.success) {
        const data = res.data.data;
        setStatus(data.status || 'not_applied');
        setDocuments(data.documents || {});
        setVehicleInfo(data.vehicleInfo || {});
        setRejectionReason(data.rejectionReason || null);
        
        // Pre-fill form data with existing documents for seamless editing
        if (data.documents) {
          setFormData(prev => ({ ...data.documents, ...prev }));
        }
      }
    } catch (err) {
      console.log('Failed to fetch verification status:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [])
  );

  // Define required documents per role
  const getDocumentList = (): DocItem[] => {
    const common: DocItem[] = [
      { key: 'nationalIdUrl', label: 'National ID / Passport', type: 'image', required: true },
      { key: 'proofOfAddressUrl', label: 'Proof of Address', type: 'image', required: true },
      { key: 'proofOfAddressType', label: 'Proof Type', type: 'select', required: true, options: ['Driving License', 'Bank Statement', 'Utility Bill'] },
    ];

    switch (role) {
      case 'parking_provider':
        return [
          { key: 'parkName', label: 'Park Name', type: 'text', required: true },
          { key: 'parkAddress', label: 'Park Address', type: 'text', required: true },
          { key: 'parkPostcode', label: 'Park Postcode', type: 'text', required: true },
          { key: 'parkingType', label: 'Parking Type', type: 'select', required: true, options: ['Short Stay', 'Long Stay', '24 Hours', 'Commuter'] },
          { key: 'totalSpots', label: 'Total Capacity (Number)', type: 'text', required: true },
          { key: 'hourlyRate', label: 'Hourly Rate (£)', type: 'text', required: true },
          { key: 'dailyRate', label: 'Daily Rate (£) (Optional)', type: 'text', required: false },
          { key: 'bookingMethods', label: 'Booking Methods (e.g. Phone, Online)', type: 'text', required: true },
          { key: 'acceptedVehicles', label: 'Accepted Vehicles (e.g. Car, Motorbikes)', type: 'text', required: true },
          { key: 'maxStayDetails', label: 'Max Stay Rules (e.g. Max stay 2 hrs)', type: 'text', required: true },
          { key: 'openingTimes', label: 'Opening Times (e.g. Mon-Sun 24 Hours)', type: 'text', required: true },
          { key: 'chargesDescription', label: 'Charges Structure (Detail)', type: 'text', required: true },
          { key: 'parkPhotoUrl', label: 'Photo of Park', type: 'image', required: true },
          { key: 'cctvPhotoUrl', label: 'CCTV Photo of Park', type: 'image', required: true },
          ...common,
        ];
      case 'driver':
        return [
          { key: 'driverLicenseNumber', label: 'Driver License Number', type: 'text', required: true },
          { key: 'driverLicenseUrl', label: 'Driver License Photo', type: 'image', required: true },
          ...common,
        ];
      case 'taxi_driver':
        return [
          { key: 'driverLicenseNumber', label: 'Driver License Number', type: 'text', required: true },
          { key: 'driverLicenseUrl', label: 'Driver License Photo', type: 'image', required: true },
          { key: 'plateNumber', label: 'Vehicle Plate Number', type: 'text', required: true },
          { key: 'vehicleMake', label: 'Vehicle Make', type: 'text', required: true },
          { key: 'vehicleModel', label: 'Vehicle Model', type: 'text', required: true },
          { key: 'vehicleYear', label: 'Vehicle Year', type: 'text', required: true },
          ...common,
        ];
      default:
        return common;
    }
  };

  const pickImage = async (key: string) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setSelectedImages(prev => ({ ...prev, [key]: result.assets[0].uri }));
    }
  };

  const isDocumentProvided = (key: string): boolean => {
    return !!(documents[key] || formData[key] || selectedImages[key] || vehicleInfo[key]);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Build submission data (text fields + image URIs as URLs for now)
      // In production, images would be uploaded to S3 first via FileUploadService
      const submitData: Record<string, string> = { ...formData };

      // Add selected images as placeholder URLs
      // (In a real production app, you'd upload these to S3 first and use the returned URLs)
      Object.entries(selectedImages).forEach(([key, uri]) => {
        submitData[key] = uri;
      });

      let response;
      switch (role) {
        case 'parking_provider':
          response = await providerApi.submitParkingVerification(submitData);
          break;
        case 'driver':
          response = await providerApi.submitDriverVerification(submitData);
          break;
        case 'taxi_driver':
          response = await providerApi.submitTaxiVerification(submitData);
          break;
      }

      if (response?.data?.success) {
        Alert.alert('Submitted!', response.data.message || 'Your documents have been submitted for review.');
        fetchStatus();
      } else {
        Alert.alert('Error', response?.data?.message || 'Failed to submit documents');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const docList = getDocumentList();
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_applied;

  const roleLabel = role === 'parking_provider'
    ? 'Park Owner'
    : role === 'driver' ? 'Driver' : 'Taxi Driver';

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Verification</Text>
          <Text style={styles.headerSubtext}>{roleLabel} Documents</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Status Card */}
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, { backgroundColor: `${statusCfg.color}20` }]}>
              <Ionicons name={statusCfg.icon} size={32} color={statusCfg.color} />
            </View>
            <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            <Text style={styles.statusDesc}>
              {status === 'not_applied'
                ? 'Submit your documents below to get verified and start accepting bookings.'
                : status === 'pending_admin_review'
                  ? 'Your documents are being reviewed. We\'ll notify you once approved.'
                  : status === 'approved'
                    ? 'You are verified and can accept bookings.'
                    : 'Your application was rejected. Please review and resubmit.'}
            </Text>
          </View>

          {/* Rejection reason */}
          {status === 'rejected' && rejectionReason && (
            <View style={styles.rejectionCard}>
              <Ionicons name="warning" size={20} color={COLORS.coralRed} />
              <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                <Text style={styles.rejectionLabel}>Rejection Reason</Text>
                <Text style={styles.rejectionText}>{rejectionReason}</Text>
              </View>
            </View>
          )}

          {/* Document Checklist / Form */}
          {(status === 'not_applied' || status === 'rejected') && (
            <>
              <Text style={styles.sectionTitle}>Required Documents</Text>

              {docList.map((doc) => {
                const isProvided = isDocumentProvided(doc.key);

                return (
                  <View key={doc.key} style={styles.docItem}>
                    <View style={styles.docHeader}>
                      <Ionicons
                        name={isProvided ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={isProvided ? COLORS.success : COLORS.softSlate}
                      />
                      <Text style={styles.docLabel}>{doc.label}</Text>
                      {doc.required && <Text style={styles.requiredBadge}>Required</Text>}
                    </View>

                    {doc.type === 'text' && (
                      <TextInput
                        style={styles.textInput}
                        placeholder={`Enter ${doc.label.toLowerCase()}`}
                        placeholderTextColor={COLORS.softSlate}
                        value={formData[doc.key] || vehicleInfo[doc.key] || ''}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, [doc.key]: text }))}
                      />
                    )}

                    {doc.type === 'image' && (
                      <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(doc.key)}>
                        <Ionicons
                          name={selectedImages[doc.key] || documents[doc.key] ? 'checkmark-circle' : 'cloud-upload-outline'}
                          size={20}
                          color={selectedImages[doc.key] || documents[doc.key] ? COLORS.success : COLORS.electricTeal}
                        />
                        <Text style={styles.uploadBtnText}>
                          {selectedImages[doc.key] ? 'Image Selected ✓' : documents[doc.key] ? 'Uploaded ✓' : 'Choose File'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {doc.type === 'select' && doc.options && (
                      <View style={styles.selectRow}>
                        {doc.options.map((option) => {
                          const optionValue = doc.key === 'proofOfAddressType' ? option.toLowerCase().replace(/ /g, '_') : option;
                          const isSelected = (formData[doc.key] || documents[doc.key]) === optionValue;
                          return (
                            <TouchableOpacity
                              key={option}
                              style={[styles.selectOption, isSelected && styles.selectOptionActive]}
                              onPress={() => setFormData(prev => ({ ...prev, [doc.key]: optionValue }))}
                            >
                              <Text style={[styles.selectOptionText, isSelected && styles.selectOptionTextActive]}>
                                {option}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.deepNavy} />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark" size={20} color={COLORS.deepNavy} style={{ marginRight: 8 }} />
                    <Text style={styles.submitBtnText}>Submit for Verification</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Show submitted docs when pending/approved */}
          {(status === 'pending_admin_review' || status === 'approved') && (
            <>
              <Text style={styles.sectionTitle}>Submitted Documents</Text>
              {docList.map((doc) => {
                const value = documents[doc.key] || vehicleInfo[doc.key];
                return (
                  <View key={doc.key} style={styles.submittedDoc}>
                    <Ionicons
                      name={value ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={value ? COLORS.success : COLORS.softSlate}
                    />
                    <Text style={styles.submittedDocLabel}>{doc.label}</Text>
                    <Text style={styles.submittedDocValue} numberOfLines={1}>
                      {doc.type === 'image'
                        ? (value ? 'Uploaded' : 'Not provided')
                        : (value || 'Not provided')}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.deepNavy },
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  headerTitle: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold },
  headerSubtext: { color: COLORS.electricTeal, fontSize: FONT_SIZES.label, marginTop: 4 },

  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },

  // Status Card
  statusCard: {
    backgroundColor: COLORS.steelBlue, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg,
  },
  statusIcon: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md,
  },
  statusLabel: { fontSize: 20, fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.sm },
  statusDesc: { color: COLORS.softSlate, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Rejection
  rejectionCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(231, 76, 60, 0.1)', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: 'rgba(231, 76, 60, 0.3)',
  },
  rejectionLabel: { color: COLORS.coralRed, fontSize: 12, fontWeight: FONT_WEIGHTS.semibold },
  rejectionText: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.label, marginTop: 2 },

  // Section
  sectionTitle: {
    color: COLORS.cloudWhite, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.md, marginTop: SPACING.sm,
  },

  // Document Items
  docItem: {
    backgroundColor: COLORS.steelBlue, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.sm,
  },
  docHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm, gap: SPACING.sm,
  },
  docLabel: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium, flex: 1 },
  requiredBadge: {
    color: COLORS.amber, fontSize: 10, fontWeight: FONT_WEIGHTS.bold,
    backgroundColor: 'rgba(243, 156, 18, 0.15)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: COLORS.cloudWhite, fontSize: FONT_SIZES.label,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md, borderWidth: 1, borderColor: COLORS.electricTeal,
    borderRadius: BORDER_RADIUS.md, borderStyle: 'dashed',
  },
  uploadBtnText: { color: COLORS.electricTeal, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium },

  // Select
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  selectOption: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  selectOptionActive: { borderColor: COLORS.electricTeal, backgroundColor: 'rgba(0, 194, 168, 0.15)' },
  selectOptionText: { color: COLORS.softSlate, fontSize: FONT_SIZES.small },
  selectOptionTextActive: { color: COLORS.electricTeal },

  // Submit
  submitBtn: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xl,
  },
  submitBtnText: { color: COLORS.deepNavy, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },

  // Submitted docs list
  submittedDoc: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  submittedDocLabel: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.label, flex: 1 },
  submittedDocValue: { color: COLORS.softSlate, fontSize: FONT_SIZES.small, maxWidth: '40%' },
});
