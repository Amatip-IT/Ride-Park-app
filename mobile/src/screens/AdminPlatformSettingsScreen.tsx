import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  Platform, ActivityIndicator, Alert, TextInput, ScrollView
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { adminApi } from '@/api';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

export function AdminPlatformSettingsScreen() {
  const navigation = useNavigation();
  const [currentFee, setCurrentFee] = useState<number>(10);
  const [newFee, setNewFee] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getPlatformSettings();
      if (res.data?.success && res.data.data) {
        setCurrentFee(res.data.data.platformFeePercentage);
        setNewFee(String(res.data.data.platformFeePercentage));
      }
    } catch (err) {
      console.log('Failed to fetch settings', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchSettings(); }, []));

  const handleUpdateFee = () => {
    const fee = parseFloat(newFee);
    if (isNaN(fee) || fee < 0 || fee > 100) {
      Alert.alert('Error', 'Please enter a valid percentage between 0 and 100');
      return;
    }

    Alert.alert(
      'Confirm Fee Change',
      `Change the platform service fee from ${currentFee}% to ${fee}%?\n\nThis will apply to all future provider earnings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Update', onPress: async () => {
          setSaving(true);
          try {
            const res = await adminApi.updatePlatformFee(fee);
            if (res.data?.success) {
              setCurrentFee(fee);
              Alert.alert('Success', `Platform fee updated to ${fee}%`);
            } else {
              Alert.alert('Error', res.data?.message || 'Failed to update');
            }
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message || 'Update failed');
          } finally {
            setSaving(false);
          }
        }},
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator size="large" color={COLORS.electricTeal} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Platform Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Current Fee Display */}
        <View style={styles.feeCard}>
          <View style={styles.feeIconContainer}>
            <Ionicons name="pricetag-outline" size={28} color={COLORS.electricTeal} />
          </View>
          <Text style={styles.feeLabel}>Current Service Fee</Text>
          <Text style={styles.feeValue}>{currentFee}%</Text>
          <Text style={styles.feeDesc}>
            This percentage is automatically deducted from every provider earning before it's added to their available balance.
          </Text>
        </View>

        {/* Update Fee */}
        <View style={styles.updateCard}>
          <Text style={styles.updateTitle}>Update Service Fee</Text>
          <Text style={styles.updateDesc}>
            Enter the new percentage you want to charge providers. Changes will apply to all future earnings immediately.
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.feeInput}
              placeholder="e.g. 10"
              placeholderTextColor={COLORS.textTertiary}
              value={newFee}
              onChangeText={setNewFee}
              keyboardType="decimal-pad"
            />
            <Text style={styles.percentSign}>%</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleUpdateFee}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.saveBtnText}>Update Fee</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.info} />
          <Text style={styles.infoText}>
            Example: If a provider earns £100 and the fee is 10%, we deduct £10 and the provider receives £90 in their available balance.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: Platform.OS === 'ios' ? 10 : 30, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  scrollContent: { padding: SPACING.xl, paddingBottom: 100 },

  feeCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.xl, borderWidth: 1, borderColor: 'rgba(0,180,160,0.3)' },
  feeIconContainer: { width: 56, height: 56, borderRadius: 28, backgroundColor: `${COLORS.electricTeal}12`, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md },
  feeLabel: { color: COLORS.textSecondary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.medium },
  feeValue: { color: COLORS.electricTeal, fontSize: 48, fontWeight: FONT_WEIGHTS.bold, marginVertical: SPACING.sm },
  feeDesc: { color: COLORS.textTertiary, fontSize: FONT_SIZES.small, textAlign: 'center', lineHeight: 18 },

  updateCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, marginBottom: SPACING.xl, borderWidth: 1, borderColor: COLORS.border },
  updateTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.sm },
  updateDesc: { color: COLORS.textSecondary, fontSize: FONT_SIZES.label, lineHeight: 20, marginBottom: SPACING.xl },

  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  feeInput: { flex: 1, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold, borderWidth: 1, borderColor: COLORS.border, height: 54 },
  percentSign: { color: COLORS.textSecondary, fontSize: 24, fontWeight: FONT_WEIGHTS.bold, marginLeft: SPACING.md },

  saveBtn: { backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md, padding: SPACING.lg, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },

  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, backgroundColor: `${COLORS.info}08`, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.info}20` },
  infoText: { flex: 1, color: COLORS.textSecondary, fontSize: FONT_SIZES.small, lineHeight: 18 },
});
