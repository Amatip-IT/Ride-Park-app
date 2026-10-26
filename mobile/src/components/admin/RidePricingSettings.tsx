import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { adminApi } from '@/api';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SPACING, ThemeColors } from '@/constants/theme';

type Rules = {
  ratePerMilePence: number;
  ratePerMinuteTaxiPence: number;
  minimumFarePence: number;
  vehicleSurchargePence: { small: number; medium: number; large: number };
  customerStopRatePencePerMinute: number;
  driverStopRatePencePerMinute: number;
  version: number;
  updatedAt?: string | null;
};

const FIELDS: Array<{ key: string; label: string; help: string }> = [
  { key: 'minimumFarePence', label: 'Minimum ride fare (£)', help: 'No ride is charged less than this (before waiting charges).' },
  { key: 'small', label: 'Normal car surcharge (£)', help: 'Smallest vehicle — normally £0.' },
  { key: 'medium', label: 'Mini Bus surcharge (£)', help: 'Added once to the same trip.' },
  { key: 'large', label: 'Bus surcharge (£)', help: 'Added once to the same trip.' },
  { key: 'customerStopRatePencePerMinute', label: 'Passenger stop rate (£ per minute)', help: 'Charged per second of a stop the passenger starts.' },
  { key: 'driverStopRatePencePerMinute', label: 'Driver stop rate (£ per minute)', help: 'Normally £0 — driver stops are not charged.' },
  { key: 'ratePerMilePence', label: 'Rate per mile (£)', help: 'Existing distance rate; applies to driver approach + trip.' },
  { key: 'ratePerMinuteTaxiPence', label: 'Taxi rate per minute (£)', help: 'Existing time rate on the passenger journey.' },
];

const toPounds = (pence?: number) => ((pence || 0) / 100).toFixed(2);

function valuesFrom(rules: Rules): Record<string, string> {
  return {
    minimumFarePence: toPounds(rules.minimumFarePence),
    small: toPounds(rules.vehicleSurchargePence.small),
    medium: toPounds(rules.vehicleSurchargePence.medium),
    large: toPounds(rules.vehicleSurchargePence.large),
    customerStopRatePencePerMinute: toPounds(rules.customerStopRatePencePerMinute),
    driverStopRatePencePerMinute: toPounds(rules.driverStopRatePencePerMinute),
    ratePerMilePence: toPounds(rules.ratePerMilePence),
    ratePerMinuteTaxiPence: toPounds(rules.ratePerMinuteTaxiPence),
  };
}

/** Admin editor for central ride pricing. Values are entered in pounds and stored in pence. */
export function RidePricingSettings() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rules, setRules] = useState<Rules | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await adminApi.getRidePricing();
      if (res.data?.success) {
        setRules(res.data.data);
        setValues(valuesFrom(res.data.data));
      }
    } catch {
      Alert.alert('Pricing', 'Could not load ride pricing.');
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const save = () => {
    const pence: Record<string, number> = {};
    for (const field of FIELDS) {
      const raw = (values[field.key] || '').replace('£', '').trim();
      const amount = Number(raw);
      if (raw === '' || !Number.isFinite(amount) || amount < 0) {
        Alert.alert('Check the values', `${field.label} must be £0.00 or more.`);
        return;
      }
      pence[field.key] = Math.round(amount * 100);
    }
    if (pence.ratePerMilePence < 1) {
      Alert.alert('Check the values', 'The rate per mile must be more than £0.');
      return;
    }

    Alert.alert(
      'Update ride pricing?',
      `Minimum fare £${(pence.minimumFarePence / 100).toFixed(2)}, Mini Bus +£${(pence.medium / 100).toFixed(2)}, Bus +£${(pence.large / 100).toFixed(2)}, passenger stops £${(pence.customerStopRatePencePerMinute / 100).toFixed(2)}/min.\n\nNew quotes use these values immediately. Rides already quoted keep their original prices.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            setSaving(true);
            try {
              const res = await adminApi.updateRidePricing({
                minimumFarePence: pence.minimumFarePence,
                customerStopRatePencePerMinute: pence.customerStopRatePencePerMinute,
                driverStopRatePencePerMinute: pence.driverStopRatePencePerMinute,
                ratePerMilePence: pence.ratePerMilePence,
                ratePerMinuteTaxiPence: pence.ratePerMinuteTaxiPence,
                vehicleSurchargePence: { small: pence.small, medium: pence.medium, large: pence.large },
              });
              if (res.data?.success) {
                Alert.alert('Saved', res.data.message || 'Ride pricing updated');
                load();
              } else {
                Alert.alert('Error', res.data?.message || 'Update failed');
              }
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.message || 'Update failed');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  if (!rules) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.electricTeal} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Ride pricing</Text>
      <Text style={styles.desc}>
        Fare = distance (driver to pickup + trip) and taxi time → vehicle surcharge → minimum fare → waiting
        charges. Version {rules.version}
        {rules.updatedAt ? ` · last changed ${new Date(rules.updatedAt).toLocaleString()}` : ''}
      </Text>
      {FIELDS.map((field) => (
        <View key={field.key} style={styles.field}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            style={styles.input}
            value={values[field.key]}
            onChangeText={(text) => setValues((prev) => ({ ...prev, [field.key]: text }))}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textTertiary}
          />
          <Text style={styles.help}>{field.help}</Text>
        </View>
      ))}
      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save ride pricing</Text>}
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.xl,
      marginBottom: SPACING.xl,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: { color: colors.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.xs },
    desc: { color: colors.textSecondary, fontSize: FONT_SIZES.small, lineHeight: 18, marginBottom: SPACING.md },
    field: { marginBottom: SPACING.md },
    label: { color: colors.textPrimary, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.semibold, marginBottom: 4 },
    input: {
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      color: colors.textPrimary,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    help: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
    saveBtn: {
      backgroundColor: colors.electricTeal,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.lg,
      alignItems: 'center',
      marginTop: SPACING.sm,
    },
    saveText: { color: '#FFF', fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold },
  });
