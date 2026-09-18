import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, Alert, ActivityIndicator,
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { reviewsApi } from '@/api';

interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  subjectName: string;
  subjectId: string;
  bookingId?: string;
  serviceType: 'taxi' | 'driver' | 'parking';
  title?: string;
}

export function RatingModal({
  visible,
  onClose,
  subjectName,
  subjectId,
  bookingId,
  serviceType,
  title = 'Rate Your Experience',
}: RatingModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setRating(0);
      setComment('');
      setSubmitting(false);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a star rating before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await reviewsApi.createReview({
        serviceType,
        serviceId: subjectId,
        bookingId,
        rating,
        comment: comment.trim() || undefined,
      });

      if (res.data?.success) {
        setRating(0);
        setComment('');
        Alert.alert('Thank You!', 'Your review has been submitted.', [
          { text: 'OK', onPress: onClose },
        ]);
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to submit review.');
      }
    } catch (err: any) {
      const message =
        err?.message ||
        err?.response?.data?.message ||
        'Something went wrong. Please try again.';
      Alert.alert('Error', typeof message === 'string' ? message : 'Failed to submit review.');
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
              color={star <= rating ? '#FFD700' : colors.textTertiary}
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

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>How was your experience with {subjectName}?</Text>

          {renderStars()}
          <Text style={styles.ratingLabel}>{getRatingLabel()}</Text>

          <TextInput
            style={styles.commentInput}
            placeholder="Leave a comment (optional)"
            placeholderTextColor={colors.textTertiary}
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
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Review</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={onClose} disabled={submitting}>
            <Text style={styles.skipBtnText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.xl,
    paddingBottom: SPACING['3xl'],
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: SPACING.lg,
  },
  title: {
    color: colors.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary, fontSize: 14, textAlign: 'center',
    marginTop: SPACING.sm, marginBottom: SPACING.lg,
  },
  starsRow: {
    flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm,
  },
  starButton: { padding: 4 },
  ratingLabel: {
    textAlign: 'center', color: colors.amber, fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.sm, marginBottom: SPACING.lg, fontSize: 15,
  },
  commentInput: {
    backgroundColor: colors.surfaceAlt, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: SPACING.md, color: colors.textPrimary, fontSize: 14,
    minHeight: 80, textAlignVertical: 'top', marginBottom: SPACING.lg,
  },
  submitBtn: {
    backgroundColor: colors.electricTeal, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 14, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFF', fontWeight: FONT_WEIGHTS.bold, fontSize: 16 },
  skipBtn: { alignItems: 'center', marginTop: SPACING.md, padding: SPACING.sm },
  skipBtnText: { color: colors.textSecondary, fontSize: 14 },
});
