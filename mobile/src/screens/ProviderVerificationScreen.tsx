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
  not_applied: { color: COLORS.softSlate, label: 'Draft', icon: 'document-text-outline' },
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

  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // View states: 'list' | 'create_edit'
  const [viewState, setViewState] = useState<'list' | 'create_edit'>('list');
  
  // Current Form state
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [status, setStatus] = useState<VerificationStatus>('not_applied');
  const [documents, setDocuments] = useState<Record<string, any>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedImages, setSelectedImages] = useState<Record<string, string>>({});
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await providerApi.getVerificationStatus();
      if (res.data?.success) {
        const data = res.data.data;
        if (data.verifications) {
          setVerifications(data.verifications);
        } else {
          setVerifications([]);
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

  const handleCreateNew = () => {
    setCurrentId(null);
    setStatus('not_applied');
    setDocuments({});
    setFormData({});
    setSelectedImages({});
    setRejectionReason(null);
    setViewState('create_edit');
  };

  const handleEdit = (park: any) => {
    setCurrentId(park._id);
    setStatus(park.status || 'not_applied');
    setDocuments(park.documents || {});
    setFormData(park.documents || {});
    setSelectedImages({});
    setRejectionReason(park.rejectionReason || null);
    setViewState('create_edit');
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
      const submitData: Record<string, any> = { ...formData };
      if (currentId) {
        submitData._id = currentId;
      }

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
        setViewState('list');
      } else {
        Alert.alert('Error', response?.data?.message || 'Failed to submit park details');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      </SafeAreaView>
    );
  }

  // List View
  if (viewState === 'list') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>My Parks</Text>
            <Text style={styles.headerSubtext}>Manage your parking spaces</Text>
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {verifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="map-outline" size={60} color={COLORS.softSlate} />
                <Text style={styles.emptyTitle}>No Parks Found</Text>
                <Text style={styles.emptyDesc}>You haven't added any parking spaces yet.</Text>
              </View>
            ) : (
              verifications.map((park) => {
                const sCfg = STATUS_CONFIG[park.status] || STATUS_CONFIG.not_applied;
                const parkName = park.documents?.parkName || park.address || 'Unnamed Park';
                return (
                  <TouchableOpacity 
                    key={park._id} 
                    style={styles.parkCard} 
                    activeOpacity={0.7}
                    onPress={() => handleEdit(park)}
                  >
                    <View style={styles.parkCardHeader}>
                      <Text style={styles.parkName}>{parkName}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: `${sCfg.color}15` }]}>
                        <Ionicons name={sCfg.icon} size={14} color={sCfg.color} style={{ marginRight: 4 }} />
                        <Text style={[styles.statusBadgeText, { color: sCfg.color }]}>{sCfg.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.parkAddress}>{park.address || 'No address provided'}</Text>
                    {park.status === 'rejected' && park.rejectionReason && (
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
                         <Ionicons name="warning" size={14} color={COLORS.coralRed} />
                         <Text style={{ color: COLORS.coralRed, fontSize: 12, marginLeft: 4 }}>Needs attention</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}

            <TouchableOpacity style={styles.addBtn} onPress={handleCreateNew} activeOpacity={0.8}>
              <Ionicons name="add-circle" size={24} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.addBtnText}>Add a New Park</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // Create/Edit View
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
  
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_applied;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerWithBack}>
          <TouchableOpacity onPress={() => setViewState('list')} style={{ paddingRight: SPACING.md }}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.headerTitle, { fontSize: 22 }]}>
              {currentId ? 'Manage Park' : 'Create a Park'}
            </Text>
            <Text style={styles.headerSubtext}>Fill out the space details below</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {currentId && (
            <View style={styles.statusCard}>
              <View style={[styles.statusIcon, { backgroundColor: `${statusCfg.color}20` }]}>
                <Ionicons name={statusCfg.icon} size={32} color={statusCfg.color} />
              </View>
              <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              <Text style={styles.statusDesc}>
                {status === 'pending_admin_review'
                  ? 'Your parking space is being reviewed by our team.'
                  : status === 'approved'
                    ? 'Your parking space is live and visible to users.'
                    : status === 'rejected' ? 'Your submission was rejected. Please review the reason below.'
                    : 'Draft saved. Please submit for review.'}
              </Text>
            </View>
          )}

          {status === 'rejected' && rejectionReason && (
            <View style={styles.rejectionCard}>
              <Ionicons name="warning" size={20} color={COLORS.coralRed} />
              <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                <Text style={styles.rejectionLabel}>Rejection Reason</Text>
                <Text style={styles.rejectionText}>{rejectionReason}</Text>
              </View>
            </View>
          )}

          {(status === 'not_applied' || status === 'rejected' || !currentId) && (
            <>
              {sections.map(section => (
                <View key={section.title}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionDot} />
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                  </View>

                  {section.fields.map(field => {
                    const value = formData[field.key] || documents[field.key];
                    const selectedImage = selectedImages[field.key];

                    if (field.type === 'image') {
                      return (
                        <View key={field.key} style={styles.fieldContainer}>
                          <Text style={styles.label}>
                            {field.label} {field.required && <Text style={styles.requiredAsterisk}>*</Text>}
                          </Text>
                          <TouchableOpacity
                            style={styles.imagePicker}
                            onPress={() => pickImage(field.key)}
                            activeOpacity={0.7}
                          >
                            {selectedImage ? (
                              <Image source={{ uri: selectedImage }} style={styles.selectedImage} />
                            ) : value ? (
                              <Image source={{ uri: value }} style={styles.selectedImage} />
                            ) : (
                              <View style={styles.imagePickerContent}>
                                <Ionicons name="camera-outline" size={32} color={COLORS.electricTeal} />
                                <Text style={styles.imagePickerText}>Tap to add photo</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    }

                    if (field.type === 'select' && field.options) {
                      return (
                        <View key={field.key} style={styles.fieldContainer}>
                          <Text style={styles.label}>
                            {field.label} {field.required && <Text style={styles.requiredAsterisk}>*</Text>}
                          </Text>
                          <View style={styles.optionsContainer}>
                            {field.options.map(option => {
                              const isSelected = value === option;
                              return (
                                <TouchableOpacity
                                  key={option}
                                  style={[styles.optionPill, isSelected && styles.optionPillSelected]}
                                  onPress={() => setFormData({ ...formData, [field.key]: option })}
                                >
                                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                                    {option}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    }

                    return (
                      <View key={field.key} style={styles.fieldContainer}>
                        <Text style={styles.label}>
                          {field.label} {field.required && <Text style={styles.requiredAsterisk}>*</Text>}
                        </Text>
                        <TextInput
                          style={styles.input}
                          value={formData[field.key] !== undefined ? formData[field.key] : value || ''}
                          onChangeText={(text) => setFormData({ ...formData, [field.key]: text })}
                          placeholder={field.placeholder || ''}
                          placeholderTextColor={COLORS.textTertiary}
                          keyboardType={field.keyboardType || 'default'}
                          multiline={field.label.includes('Description') || field.label.includes('Rules')}
                        />
                      </View>
                    );
                  })}
                </View>
              ))}

              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={24} color={COLORS.info} />
                <Text style={styles.infoBoxText}>
                  All submitted details and photos are verified by our team within 24-48 hours. Please ensure images are clear.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Park for Review</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {status === 'approved' && (
            <View style={styles.readOnlyContainer}>
              <View style={styles.infoBox}>
                 <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                 <Text style={styles.infoBoxText}>
                   Your park is live and accepting bookings! You can manage availability on your dashboard.
                 </Text>
              </View>
            </View>
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
  
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerWithBack: {
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center',
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold },
  headerSubtext: { color: COLORS.textSecondary, fontSize: FONT_SIZES.body, marginTop: 4 },
  
  scrollContent: { padding: SPACING.lg, paddingBottom: 40 },

  // List View Styles
  parkCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  parkCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  parkName: { fontSize: 18, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary, flex: 1 },
  parkAddress: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 12, fontWeight: FONT_WEIGHTS.bold },

  addBtn: {
    flexDirection: 'row', backgroundColor: COLORS.electricTeal,
    padding: SPACING.lg, borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center', alignItems: 'center',
    marginTop: SPACING.xl, shadowColor: COLORS.electricTeal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  addBtnText: { color: '#FFF', fontSize: 16, fontWeight: FONT_WEIGHTS.bold },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 20, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary, marginTop: 16 },
  emptyDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8 },

  // Form Styles
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg, marginTop: SPACING.xl },
  sectionDot: { width: 8, height: 24, backgroundColor: COLORS.electricTeal, borderRadius: 4, marginRight: SPACING.md },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
  
  fieldContainer: { marginBottom: SPACING.xl },
  label: { color: COLORS.textPrimary, fontSize: 14, fontWeight: FONT_WEIGHTS.semibold, marginBottom: 8 },
  requiredAsterisk: { color: COLORS.coralRed },
  
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg, paddingVertical: 14, color: COLORS.textPrimary, fontSize: 16,
  },
  
  imagePicker: {
    height: 160, backgroundColor: COLORS.surfaceAlt, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  imagePickerContent: { alignItems: 'center' },
  imagePickerText: { color: COLORS.textSecondary, marginTop: 8, fontSize: 14, fontWeight: FONT_WEIGHTS.medium },
  selectedImage: { width: '100%', height: '100%' },

  optionsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionPill: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  optionPillSelected: { backgroundColor: COLORS.electricTeal, borderColor: COLORS.electricTeal },
  optionText: { color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.medium },
  optionTextSelected: { color: '#FFF', fontWeight: FONT_WEIGHTS.bold },

  infoBox: {
    flexDirection: 'row', backgroundColor: `${COLORS.info}10`, padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg, marginTop: SPACING.xl, marginBottom: SPACING['2xl'], alignItems: 'flex-start',
  },
  infoBoxText: { color: COLORS.info, flex: 1, marginLeft: SPACING.md, fontSize: 13, lineHeight: 20 },

  submitBtn: {
    backgroundColor: COLORS.electricTeal, paddingVertical: 18, borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center', shadowColor: COLORS.electricTeal, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5, marginBottom: 40,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: FONT_WEIGHTS.bold },

  statusCard: { alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.xl, borderWidth: 1, borderColor: COLORS.border },
  statusIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md },
  statusLabel: { fontSize: 22, fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.sm },
  statusDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },

  rejectionCard: { flexDirection: 'row', backgroundColor: '#FEF2F2', borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.xl, borderWidth: 1, borderColor: '#FECACA' },
  rejectionLabel: { color: COLORS.coralRed, fontSize: 14, fontWeight: FONT_WEIGHTS.bold, marginBottom: 2 },
  rejectionText: { color: COLORS.textSecondary, fontSize: 13 },

  readOnlyContainer: { marginTop: SPACING.xl },
});
