import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, TextInput, Image,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { providerApi } from '@/api';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

type VerificationStatus = 'not_applied' | 'pending_admin_review' | 'approved' | 'rejected';

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  not_applied: { color: COLORS.softSlate, label: 'Not Submitted', icon: 'add-circle-outline' },
  pending_auto_check: { color: COLORS.amber, label: 'Under Review', icon: 'time-outline' },
  pending_admin_review: { color: COLORS.amber, label: 'Under Review', icon: 'time-outline' },
  approved: { color: COLORS.success, label: 'Verified & Listed', icon: 'checkmark-circle' },
  rejected: { color: COLORS.coralRed, label: 'Rejected', icon: 'close-circle' },
};

interface DocItem {
  key: string;
  label: string;
  type: 'image' | 'text' | 'select';
  required: boolean;
  options?: string[];
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  section?: string;
}

// Define parking space fields — identity docs are now handled at registration
const PARKING_FIELDS: DocItem[] = [
  // Park Details
  { key: 'parkName', label: 'Park Name', type: 'text', required: true, section: 'Park Details', placeholder: 'e.g. City Centre Parking' },
  { key: 'parkAddress', label: 'Park Address', type: 'text', required: true, section: 'Park Details', placeholder: 'Full address of the parking space' },
  { key: 'parkPostcode', label: 'Park Postcode', type: 'text', required: true, section: 'Park Details', placeholder: 'e.g. SW1A 1AA' },
  { key: 'description', label: 'Description', type: 'text', required: false, section: 'Park Details', placeholder: 'Describe your parking space...' },
  { key: 'parkingType', label: 'Parking Type', type: 'select', required: true, section: 'Park Details', options: ['Short Stay', 'Long Stay', '24 Hours', 'Commuter'] },

  // Capacity & Pricing
  { key: 'totalSpots', label: 'Total Capacity (Number of Spots)', type: 'text', required: true, section: 'Capacity & Pricing', placeholder: 'e.g. 10', keyboardType: 'numeric' },
  { key: 'hourlyRate', label: 'Hourly Rate (£)', type: 'text', required: true, section: 'Capacity & Pricing', placeholder: 'e.g. 3.50', keyboardType: 'numeric' },
  { key: 'dailyRate', label: 'Daily Rate (£) — Optional', type: 'text', required: false, section: 'Capacity & Pricing', placeholder: 'e.g. 15.00', keyboardType: 'numeric' },
  { key: 'chargesDescription', label: 'Charges Structure', type: 'text', required: true, section: 'Capacity & Pricing', placeholder: 'Describe your pricing in detail' },

  // Availability & Rules
  { key: 'bookingMethods', label: 'Booking Methods', type: 'text', required: true, section: 'Availability & Rules', placeholder: 'e.g. Phone, Online / App' },
  { key: 'acceptedVehicles', label: 'Accepted Vehicles', type: 'text', required: true, section: 'Availability & Rules', placeholder: 'e.g. Car, Motorbikes, Vans' },
  { key: 'maxStayDetails', label: 'Max Stay Rules', type: 'text', required: true, section: 'Availability & Rules', placeholder: 'e.g. Maximum stay 4 hours' },
  { key: 'openingTimes', label: 'Opening Times', type: 'text', required: true, section: 'Availability & Rules', placeholder: 'e.g. Mon-Sun 24 Hours' },

  // Media
  { key: 'parkPhotoUrl', label: 'Photos of the Parking Space', type: 'image', required: true, section: 'Photos & Security' },
  { key: 'cctvPhotoUrl', label: 'CCTV / Security Camera Photo', type: 'image', required: true, section: 'Photos & Security' },
];

export function ProviderVerificationScreen() {
  const { user } = useAuthStore();
  const role = user?.role || 'parking_provider';

  const [status, setStatus] = useState<VerificationStatus>('not_applied');
  const [documents, setDocuments] = useState<Record<string, any>>({});
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
    return !!(documents[key] || formData[key] || selectedImages[key]);
  };

  const handleSubmit = async () => {
    // Validate required fields
    const missing = PARKING_FIELDS.filter(f => f.required && !isDocumentProvided(f.key));
    if (missing.length > 0) {
      Alert.alert('Missing Fields', `Please fill in: ${missing.map(f => f.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const submitData: Record<string, string> = { ...formData };

      // Add selected images
      Object.entries(selectedImages).forEach(([key, uri]) => {
        submitData[key] = uri;
      });

      const response = await providerApi.submitParkingVerification(submitData);

      if (response?.data?.success) {
        Alert.alert(
          'Park Submitted! 🎉',
          'Your parking space details have been submitted for admin review. You will be notified once your space is approved and listed.',
        );
        fetchStatus();
      } else {
        Alert.alert('Error', response?.data?.message || 'Failed to submit park details');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_applied;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      </SafeAreaView>
    );
  }

  // Group fields by section for better organization
  const sections: { title: string; fields: DocItem[] }[] = [];
  PARKING_FIELDS.forEach(field => {
    const sectionTitle = field.section || 'Other';
    let section = sections.find(s => s.title === sectionTitle);
    if (!section) {
      section = { title: sectionTitle, fields: [] };
      sections.push(section);
    }
    section.fields.push(field);
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Create a Park</Text>
          <Text style={styles.headerSubtext}>
            {role === 'parking_provider' ? 'Submit your parking space for approval' : 'Manage your space'}
          </Text>
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
                ? 'Fill in the details below to create your parking space. Once submitted, an admin will review and approve it.'
                : status === 'pending_admin_review'
                  ? 'Your parking space is being reviewed by our team. We\'ll notify you once it\'s approved and listed.'
                  : status === 'approved'
                    ? 'Your parking space is live and visible to users. You can now accept bookings!'
                    : 'Your submission was rejected. Please review the reason below and resubmit.'}
            </Text>
          </View>

          {/* Identity Verification Status Badge */}
          {(user as any)?.identityStatus && (
            <View style={[styles.identityBadge, {
              borderColor: (user as any).identityStatus === 'verified' ? COLORS.success : 
                           (user as any).identityStatus === 'pending' ? COLORS.amber : COLORS.softSlate,
            }]}>
              <Ionicons
                name={(user as any).identityStatus === 'verified' ? 'shield-checkmark' : 'shield-outline'}
                size={20}
                color={(user as any).identityStatus === 'verified' ? COLORS.success :
                       (user as any).identityStatus === 'pending' ? COLORS.amber : COLORS.softSlate}
              />
              <Text style={styles.identityBadgeText}>
                Identity: {(user as any).identityStatus === 'verified' ? 'Verified ✓' :
                           (user as any).identityStatus === 'pending' ? 'Under Review' : 'Not Verified'}
              </Text>
            </View>
          )}

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

          {/* Park Creation Form */}
          {(status === 'not_applied' || status === 'rejected') && (
            <>
              {sections.map(section => (
                <View key={section.title}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionDot} />
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                  </View>

                  {section.fields.map((doc) => {
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
                            placeholder={doc.placeholder || `Enter ${doc.label.toLowerCase()}`}
                            placeholderTextColor={COLORS.softSlate}
                            value={formData[doc.key] || ''}
                            onChangeText={(text) => setFormData(prev => ({ ...prev, [doc.key]: text }))}
                            keyboardType={doc.keyboardType || 'default'}
                          />
                        )}

                        {doc.type === 'image' && (
                          <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage(doc.key)}>
                            {selectedImages[doc.key] ? (
                              <View style={styles.uploadPreviewRow}>
                                <Image source={{ uri: selectedImages[doc.key] }} style={styles.uploadPreview} />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.uploadLabelDone}>{doc.label}</Text>
                                  <Text style={styles.uploadStatusDone}>Photo uploaded ✓</Text>
                                </View>
                                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                              </View>
                            ) : documents[doc.key] ? (
                              <View style={styles.uploadPreviewRow}>
                                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                                <Text style={styles.uploadLabelDone}> Previously Uploaded ✓</Text>
                              </View>
                            ) : (
                              <View style={styles.uploadPlaceholderRow}>
                                <View style={styles.uploadIconContainer}>
                                  <Ionicons name="camera-outline" size={28} color={COLORS.electricTeal} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.uploadLabelText}>Upload {doc.label}</Text>
                                  <Text style={styles.uploadHintText}>Tap to choose from gallery</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={COLORS.softSlate} />
                              </View>
                            )}
                          </TouchableOpacity>
                        )}

                        {doc.type === 'select' && doc.options && (
                          <View style={styles.selectRow}>
                            {doc.options.map((option) => {
                              const isSelected = formData[doc.key] === option;
                              return (
                                <TouchableOpacity
                                  key={option}
                                  style={[styles.selectOption, isSelected && styles.selectOptionActive]}
                                  onPress={() => setFormData(prev => ({ ...prev, [doc.key]: option }))}
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
                </View>
              ))}

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
                    <Ionicons name="cloud-upload" size={20} color={COLORS.deepNavy} style={{ marginRight: 8 }} />
                    <Text style={styles.submitBtnText}>Submit Park for Approval</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Show submitted docs when pending/approved */}
          {(status === 'pending_admin_review' || status === 'approved') && (
            <>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionDot} />
                <Text style={styles.sectionTitle}>Submitted Details</Text>
              </View>
              {PARKING_FIELDS.map((doc) => {
                const value = documents[doc.key];
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
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold },
  headerSubtext: { color: COLORS.electricTeal, fontSize: FONT_SIZES.label, marginTop: 4 },

  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },

  // Status Card
  statusCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  statusIcon: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md,
  },
  statusLabel: { fontSize: 20, fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.sm },
  statusDesc: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Identity Badge
  identityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  identityBadgeText: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium,
  },

  // Rejection
  rejectionCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FEF2F2', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: '#FECACA',
  },
  rejectionLabel: { color: COLORS.coralRed, fontSize: 12, fontWeight: FONT_WEIGHTS.semibold },
  rejectionText: { color: COLORS.textPrimary, fontSize: FONT_SIZES.label, marginTop: 2 },

  // Section Headers
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.md, marginTop: SPACING.lg,
  },
  sectionDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.electricTeal,
  },
  sectionTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // Document Items
  docItem: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  docHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm, gap: SPACING.sm,
  },
  docLabel: { color: COLORS.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium, flex: 1 },
  requiredBadge: {
    color: COLORS.amber, fontSize: 10, fontWeight: FONT_WEIGHTS.bold,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  textInput: {
    backgroundColor: COLORS.surfaceAlt, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: COLORS.textPrimary, fontSize: FONT_SIZES.label,
    borderWidth: 1, borderColor: COLORS.border,
  },

  // Upload
  uploadBtn: {
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
    backgroundColor: COLORS.surface,
  },
  uploadPlaceholderRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
  },
  uploadIconContainer: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: `${COLORS.electricTeal}15`,
    justifyContent: 'center', alignItems: 'center',
  },
  uploadLabelText: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium,
  },
  uploadHintText: {
    color: COLORS.textTertiary, fontSize: FONT_SIZES.small, marginTop: 2,
  },
  uploadPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
  },
  uploadPreview: {
    width: 48, height: 48, borderRadius: 8,
  },
  uploadLabelDone: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium,
  },
  uploadStatusDone: {
    color: COLORS.success, fontSize: FONT_SIZES.small, marginTop: 2,
  },

  // Select
  selectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  selectOption: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  selectOptionActive: { borderColor: COLORS.electricTeal, backgroundColor: `${COLORS.electricTeal}12` },
  selectOptionText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  selectOptionTextActive: { color: COLORS.electricTeal },

  // Submit
  submitBtn: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', marginTop: SPACING.xl,
  },
  submitBtnText: { color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },

  // Submitted docs list
  submittedDoc: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  submittedDocLabel: { color: COLORS.textPrimary, fontSize: FONT_SIZES.label, flex: 1 },
  submittedDocValue: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, maxWidth: '40%' },
});
