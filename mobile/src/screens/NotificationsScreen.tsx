import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, Platform, RefreshControl,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

import { notificationsApi } from '@/api';

interface Notification {
  _id: string;
  title: string;
  body: string;
  type: 'ride' | 'booking' | 'payment' | 'system' | 'promo';
  read: boolean;
  createdAt: string;
}

const ICON_MAP: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  ride: { icon: 'car-sport', color: COLORS.info },
  booking: { icon: 'calendar', color: COLORS.electricTeal },
  payment: { icon: 'card', color: COLORS.success },
  system: { icon: 'settings', color: COLORS.amber },
  promo: { icon: 'megaphone', color: '#9B59B6' },
};

export function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await notificationsApi.getMyNotifications();
      if (res.data?.success) {
        setNotifications(res.data.data);
      }
    } catch (err) {
      console.log('Error fetching notifications:', err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.log('Error marking all as read:', err);
    }
  };

  const timeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const { icon, color } = ICON_MAP[item.type] || ICON_MAP.system;

    return (
      <TouchableOpacity
        style={[styles.card, !item.read && styles.cardUnread]}
        activeOpacity={0.7}
        onPress={async () => {
          if (!item.read) {
            setNotifications(prev => prev.map(n => n._id === item._id ? { ...n, read: true } : n));
            try {
              await notificationsApi.markAsRead(item._id);
            } catch (err) {
              console.log('Error marking as read:', err);
            }
          }
        }}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, !item.read && styles.cardTitleUnread]}>{item.title}</Text>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
          <Text style={styles.cardTime}>{timeAgo(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAllRead}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={64} color={COLORS.textTertiary} />
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptyText}>You're all caught up! We'll notify you about ride updates, bookings, and payments.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.electricTeal} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold },
  markAllRead: { color: COLORS.electricTeal, fontSize: 13, fontWeight: FONT_WEIGHTS.semibold },

  listContainer: { padding: SPACING.lg },

  emptyContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    color: COLORS.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.bold,
    marginTop: SPACING.lg,
  },
  emptyText: {
    color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginTop: SPACING.sm,
    lineHeight: 20,
  },

  card: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  cardUnread: {
    backgroundColor: `${COLORS.electricTeal}06`,
    borderColor: `${COLORS.electricTeal}30`,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  cardContent: { flex: 1 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  cardTitle: {
    flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold,
  },
  cardTitleUnread: { fontWeight: FONT_WEIGHTS.bold },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.electricTeal,
  },
  cardBody: {
    color: COLORS.textSecondary, fontSize: 13, marginTop: 3, lineHeight: 18,
  },
  cardTime: {
    color: COLORS.textTertiary, fontSize: 11, marginTop: 4,
  },
});
