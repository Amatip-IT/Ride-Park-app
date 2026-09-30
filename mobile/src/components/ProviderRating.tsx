import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_WEIGHTS } from '@/constants/theme';

type Props = {
  averageRating?: number;
  totalReviews?: number;
  starColor: string;
  textColor: string;
  size?: number;
};

export function ProviderRating({
  averageRating = 0,
  totalReviews = 0,
  starColor,
  textColor,
  size = 14,
}: Props) {
  const hasReviews = totalReviews > 0;
  const rating = hasReviews ? averageRating : 0;

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => {
        const name = !hasReviews
          ? 'star-outline'
          : rating >= star
            ? 'star'
            : rating >= star - 0.5
              ? 'star-half'
              : 'star-outline';
        return (
          <Ionicons
            key={star}
            name={name}
            size={size}
            color={hasReviews ? starColor : textColor}
          />
        );
      })}
      <Text style={[styles.label, { color: textColor, fontSize: size - 1 }]}>
        {hasReviews ? `${rating.toFixed(1)} (${totalReviews})` : 'No reviews yet'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  label: { marginLeft: 6, fontWeight: FONT_WEIGHTS.medium },
});
