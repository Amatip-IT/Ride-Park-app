import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BORDER_RADIUS, FONT_WEIGHTS, SPACING, ThemeColors } from '@/constants/theme';
import { FareBreakdown, fareLines, formatPence } from '@/utils/fare';

type Props = {
  fare: FareBreakdown;
  title?: string;
  /** Amount held in the passenger's wallet for this ride, if any. */
  heldPence?: number;
};

export function FareBreakdownCard({ fare, title = 'Fare breakdown', heldPence }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const difference = heldPence != null ? heldPence - fare.totalPence : 0;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {fareLines(fare).map((line) => (
        <View key={line.label} style={styles.row}>
          <Text style={[styles.label, line.muted && styles.muted]}>{line.label}</Text>
          <Text style={[styles.value, line.muted && styles.muted]}>{line.value}</Text>
        </View>
      ))}
      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatPence(fare.totalPence)}</Text>
      </View>
      {heldPence != null && heldPence > 0 && (
        <Text style={styles.note}>
          {formatPence(heldPence)} is held in your wallet.{' '}
          {difference > 0
            ? `${formatPence(difference)} will be returned to your available balance.`
            : difference < 0
              ? `${formatPence(-difference)} more will be taken from your wallet.`
              : ''}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    title: { color: colors.textPrimary, fontSize: 14, fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.xs },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm, paddingVertical: 2 },
    label: { flex: 1, color: colors.textSecondary, fontSize: 12 },
    value: { color: colors.textPrimary, fontSize: 12, fontWeight: FONT_WEIGHTS.semibold },
    muted: { opacity: 0.6 },
    totalRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: SPACING.xs, paddingTop: SPACING.xs },
    totalLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: FONT_WEIGHTS.bold },
    totalValue: { color: colors.textPrimary, fontSize: 14, fontWeight: FONT_WEIGHTS.bold },
    note: { color: colors.textSecondary, fontSize: 12, marginTop: SPACING.xs },
  });
