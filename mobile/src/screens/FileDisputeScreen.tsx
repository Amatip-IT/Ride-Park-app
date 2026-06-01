import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Alert, Platform, ActivityIndicator,
} from 'react-native';
import { disputesApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

const CATEGORIES = [
  { id: 'unfair_rejection', label: 'Unfair Rejection' },
  { id: 'payment_issue', label: 'Payment Issue' },
  { id: 'misconduct', label: 'Misconduct' },
  { id: 'service_quality', label: 'Service Quality' },
  { id: 'verification', label: 'Verification' },
  { id: 'other', label: 'Other' },
];

export function FileDisputeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const prefill = route.params || {};

  const [category, setCategory] = useState(prefill.category || 'verification');
  const [description, setDescription] = useState(prefill.description || '');
  const [complaintAbout, setComplaintAbout] = useState(prefill.complaintAbout || '');
  const [relatedServiceType, setRelatedServiceType] = useState(prefill.relatedServiceType || '');
  const [relatedServiceId, setRelatedServiceId] = useState(prefill.relatedServiceId || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Description Required', 'Please describe what happened.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await disputesApi.fileDispute({
        category,
        description: description.trim(),
        complaintAbout: complaintAbout.trim() || undefined,
        relatedServiceType: relatedServiceType.trim() || undefined,
        relatedServiceId: relatedServiceId.trim() || undefined,
        metadata: prefill.metadata,
      });
      if (res.data?.success) {
        Alert.alert('Submitted', res.data.message || 'Dispute filed successfully', [
          { text: 'OK', onPress: () => navigation.replace('Disputes') },
        ]);
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to submit dispute');
      }
    } catch {
      Alert.alert('Error', 'Failed to submit dispute');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>File a Dispute</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, category === c.id && styles.chipActive]}
              onPress={() => setCategory(c.id)}
            >
              <Text style={[styles.chipText, category === c.id && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>What happened?</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the issue in detail..."
          placeholderTextColor={COLORS.textTertiary}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>User ID to complain about (optional)</Text>
        <TextInput
          style={styles.input}
          value={complaintAbout}
          onChangeText={setComplaintAbout}
          placeholder="Leave blank if not about a specific user"
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Related booking/ride ID (optional)</Text>
        <TextInput
          style={styles.input}
          value={relatedServiceId}
          onChangeText={setRelatedServiceId}
          placeholder="e.g. ride or booking ID"
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Dispute</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold },
  scroll: { padding: SPACING.lg, paddingBottom: 40 },
  label: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginBottom: SPACING.sm, marginTop: SPACING.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.md },
  chip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: `${COLORS.electricTeal}15`, borderColor: COLORS.electricTeal },
  chipText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  chipTextActive: { color: COLORS.electricTeal },
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: COLORS.textPrimary,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md,
  },
  textArea: { minHeight: 120 },
  submitBtn: {
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, alignItems: 'center', marginTop: SPACING.lg,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#FFF', fontWeight: FONT_WEIGHTS.semibold, fontSize: FONT_SIZES.body },
});
