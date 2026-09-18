import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Platform, SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { chatApi } from '@/api';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { useChatStore } from '@/store/chatStore';

export function ChatListScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuthStore();
  const navigation = useNavigation<NavigationProp<any>>();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { connect, socket } = useChatStore();

  // Connect to socket when coming to the chat screen if not already connected
  useEffect(() => {
    if (user?._id) {
      connect(user._id);
    }
  }, [user]);

  const fetchChats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await chatApi.getMyChats();
      if (response.data?.success) {
        setChats(response.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch chats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchChats();
      
      // If we are listening to new socket messages, we might want to refresh the chat list
      // So let's attach a listener specifically inside this screen if needed,
      // But for simplicity, we pull history on focus.
      if (socket) {
        socket.on('receive_message', fetchChats);
        return () => {
          socket.off('receive_message', fetchChats);
        };
      }
    }, [socket])
  );

  const renderChatItem = ({ item }: { item: any }) => {
    const otherUser = item?.user;
    if (!otherUser?._id) {
      return null;
    }

    const latestMsg = item.latestMessage;
    const isUnread = item.unreadCount > 0;

    const name =
      [otherUser.firstName, otherUser.lastName].filter(Boolean).join(' ').trim() ||
      'Unknown User';
    const dateStr = latestMsg?.createdAt ? new Date(latestMsg.createdAt) : new Date();
    const isToday = new Date().toDateString() === dateStr.toDateString();
    const timeDisplay = isToday
      ? dateStr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : dateStr.toLocaleDateString([], { month: 'short', day: 'numeric' });

    return (
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() =>
          navigation.navigate('Chat', {
            userId: otherUser._id,
            userName: name,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarLetter}>{name.charAt(0)}</Text>
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={[styles.chatName, isUnread && styles.unreadText]}>{name}</Text>
            <Text style={[styles.chatTime, isUnread && styles.unreadTime]}>{timeDisplay}</Text>
          </View>

          <View style={styles.messageRow}>
            {latestMsg?.sender === user?._id && (
              <Ionicons
                name="checkmark-done"
                size={14}
                color={colors.electricTeal}
                style={{ marginRight: 4 }}
              />
            )}
            <Text
              style={[styles.messagePreview, isUnread && styles.unreadText]}
              numberOfLines={1}
            >
              {latestMsg?.content || 'Sent an attachment'}
            </Text>

            {isUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadCount}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('ConsumerApp' as never);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Messages</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.electricTeal} />
          </View>
        ) : chats.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.iconCircle}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.electricTeal} />
            </View>
            <Text style={styles.emptyStateTitle}>No messages yet</Text>
            <Text style={styles.emptyStateSubtext}>
              When you contact a provider or user, the conversation will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(item) => item.user?._id || Math.random().toString()}
            renderItem={renderChatItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => fetchChats(true)} tintColor={colors.electricTeal} />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: FONT_SIZES.hero,
    fontWeight: FONT_WEIGHTS.bold,
  },
  headerSpacer: { width: 40 },
  
  listContent: { paddingVertical: SPACING.md },

  // Chat Card
  chatCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatarCircle: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
    borderWidth: 1, borderColor: colors.border,
  },
  avatarLetter: { color: colors.electricTeal, fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
  chatInfo: { flex: 1 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  chatName: { color: colors.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.medium },
  chatTime: { color: colors.textSecondary, fontSize: 12 },
  
  messageRow: { flexDirection: 'row', alignItems: 'center' },
  messagePreview: { color: colors.textSecondary, fontSize: 14, flex: 1 },
  
  unreadText: { fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary },
  unreadTime: { color: colors.electricTeal, fontWeight: FONT_WEIGHTS.bold },
  
  unreadBadge: {
    backgroundColor: colors.electricTeal, borderRadius: 10,
    minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 8,
    paddingHorizontal: 6,
  },
  unreadCount: { color: '#FFF', fontSize: 10, fontWeight: FONT_WEIGHTS.bold },

  // Empty State
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl, marginTop: 40 },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(0, 180, 160, 0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl,
  },
  emptyStateTitle: {
    color: colors.textPrimary, fontSize: 22, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md, textAlign: 'center',
  },
  emptyStateSubtext: {
    color: colors.textSecondary, fontSize: 16, textAlign: 'center', lineHeight: 24,
  },
});
