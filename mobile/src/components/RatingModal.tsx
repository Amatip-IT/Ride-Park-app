import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { reviewsApi } from '@/api';

interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  driverName: string;
  driverId: string;
  bookingId?: string;
  serviceType: 'taxi' | 'driver';
}

export function RatingModal({
  visible,
  onClose,
  driverName,
  driverId,
  bookingId,
  serviceType,
}: RatingModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a star rating before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await reviewsApi.createReview({
        serviceType,
        serviceId: driverId,
        bookingId,
        rating,
        comment: comment.trim() || undefined,
      });

      if (res.data?.success) {
        Alert.alert('Thank You!', 'Your review has been submitted.', [
          { text: 'OK', onPress: onClose },
        ]);
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to submit review.');
      }
    } catch (err: any) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStars = () => {
    return (
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => setRating(star)}
            activeOpacity={0.7}
            style={styles.starButton}
          >
            <Ionicons
              name={star <= rating ? 'star' : 'star-outline'}
              size={40}
              color={star <= rating ? '#FFD700' : COLORS.textTertiary}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const getRatingLabel = () => {
    switch (rating) {
      case 1: return 'Poor';
      case 2: return 'Fair';
      case 3: return 'Good';
      case 4: return 'Great';
      case 5: return 'Excellent!';
      default: return 'Tap a star to rate';
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.handle} />

          <Text style={styles.title}>Rate Your Ride</Text>
          <Text style={styles.subtitle}>How was your experience with {driverName}?</Text>

          {renderStars()}
          <Text style={styles.ratingLabel}>{getRatingLabel()}</Text>

          <TextInput
            style={styles.commentInput}
            placeholder="Leave a comment (optional)"
            placeholderTextColor={COLORS.textTertiary}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.submitBtn, rating === 0 && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || rating === 0}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Review</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={onClose}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: SPACING.xl, paddingBottom: 40,
    alignItems: 'center',
  },
  handle: {
    width: 40, height: 5, borderRadius: 3,
    backgroundColor: COLORS.border, marginBottom: SPACING.xl,
  },
  title: {
    color: COLORS.textPrimary, fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.xs,
  },
  subtitle: {
    color: COLORS.textSecondary, fontSize: 14, marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row', gap: 8, marginBottom: SPACING.sm,
  },
  starButton: { padding: 4 },
  ratingLabel: {
    color: COLORS.electricTeal, fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.xl,
  },
  commentInput: {
    width: '100%', minHeight: 80,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, paddingTop: SPACING.md,
    color: COLORS.textPrimary, fontSize: 14,
    textAlignVertical: 'top', marginBottom: SPACING.xl,
  },
  submitBtn: {
    width: '100%', paddingVertical: 16,
    borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.electricTeal,
    alignItems: 'center',
    shadowColor: COLORS.electricTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnDisabled: {
    backgroundColor: COLORS.textTertiary, shadowOpacity: 0,
  },
  submitBtnText: {
    color: '#FFF', fontSize: 16, fontWeight: FONT_WEIGHTS.bold,
  },
  skipBtn: {
    paddingVertical: SPACING.md, marginTop: SPACING.sm,
  },
  skipBtnText: {
    color: COLORS.textSecondary, fontSize: 14, fontWeight: FONT_WEIGHTS.medium,
  },
});
