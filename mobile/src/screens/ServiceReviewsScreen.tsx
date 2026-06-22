import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { reviewsApi } from '@/api';
import { useThemeColors } from '@/hooks/useThemeColors';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { getApiErrorMessage } from '@/utils/helpers';

type RouteParams = {
  ServiceReviews: {
    serviceType: 'parking' | 'driver' | 'taxi';
    serviceId: string;
    serviceName?: string;
  };
};

type ReviewItem = {
  _id: string;
  rating: number;
  comment?: string;
  createdAt: string;
  reviewer?: { firstName?: string; lastName?: string };
};

function StarRow({ rating, color }: { rating: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={n <= rating ? 'star' : 'star-outline'}
          size={14}
          color={color}
        />
      ))}
    </View>
  );
}

export function ServiceReviewsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'ServiceReviews'>>();
  const { serviceType, serviceId, serviceName } = route.params;
  const colors = useThemeColors();

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(
    async (pageNum = 1, append = false) => {
      try {
        setError(null);
        const res = await reviewsApi.getReviews(serviceType, serviceId, pageNum);
        if (res.data?.success && res.data.data) {
          const payload = res.data.data;
          setReviews((prev) =>
            append ? [...prev, ...(payload.reviews || [])] : payload.reviews || [],
          );
          setAverageRating(payload.averageRating ?? 0);
          setTotalReviews(payload.totalReviews ?? 0);
          setPage(pageNum);
          setTotalPages((res.data as any).meta?.totalPages ?? 1);
        }
      } catch (err) {
        setError(getApiErrorMessage(err, 'Could not load reviews'));
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [serviceType, serviceId],
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchReviews(1, false);
    }, [fetchReviews]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchReviews(1, false);
  };

  const loadMore = () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    fetchReviews(page + 1, true);
  };

  const styles = createStyles(colors);

  const renderItem = ({ item }: { item: ReviewItem }) => {
    const name = item.reviewer?.firstName
      ? `${item.reviewer.firstName} ${item.reviewer.lastName || ''}`.trim()
      : 'Anonymous';
    const date = item.createdAt
      ? new Date(item.createdAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '';

    return (
      <View style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <Text style={styles.reviewerName}>{name}</Text>
          <Text style={styles.reviewDate}>{date}</Text>
        </View>
        <StarRow rating={item.rating} color={colors.amber} />
        {item.comment ? <Text style={styles.reviewComment}>{item.comment}</Text> : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Reviews
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.serviceName}>{serviceName || 'Service'}</Text>
        <View style={styles.summaryRow}>
          <Ionicons name="star" size={28} color={colors.amber} />
          <Text style={styles.avgRating}>{averageRating.toFixed(1)}</Text>
          <Text style={styles.reviewCount}>
            {totalReviews} review{totalReviews !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.electricTeal} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.electricTeal} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="chatbubble-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No reviews yet</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: SPACING.lg }} color={colors.electricTeal} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
      paddingBottom: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { padding: SPACING.xs },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      color: colors.textPrimary,
      fontSize: FONT_SIZES.section,
      fontWeight: FONT_WEIGHTS.bold,
    },
    summaryCard: {
      margin: SPACING.lg,
      padding: SPACING.lg,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    serviceName: {
      color: colors.textSecondary,
      fontSize: FONT_SIZES.small,
      marginBottom: SPACING.sm,
    },
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    avgRating: {
      color: colors.textPrimary,
      fontSize: 32,
      fontWeight: FONT_WEIGHTS.bold,
    },
    reviewCount: { color: colors.textSecondary, fontSize: FONT_SIZES.label },
    list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING['2xl'] },
    reviewCard: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    reviewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: SPACING.sm,
    },
    reviewerName: {
      color: colors.textPrimary,
      fontWeight: FONT_WEIGHTS.semibold,
      fontSize: FONT_SIZES.label,
    },
    reviewDate: { color: colors.textTertiary, fontSize: FONT_SIZES.small },
    reviewComment: {
      color: colors.textSecondary,
      fontSize: FONT_SIZES.label,
      marginTop: SPACING.sm,
      lineHeight: 20,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
      gap: SPACING.md,
    },
    emptyText: { color: colors.textSecondary, fontSize: FONT_SIZES.body },
    errorText: { color: colors.textSecondary, textAlign: 'center' },
  });
}
