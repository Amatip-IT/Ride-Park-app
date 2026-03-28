import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Platform, SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { chatApi } from '@/api';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { useChatStore } from '@/store/chatStore';

export function ChatListScreen() {
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
    const otherUser = item.user;
    const latestMsg = item.latestMessage;
    const isUnread = item.unreadCount > 0;
    
    // Formatting the name
    const name = otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : 'Unknown User';
    // Format date
    const dateStr = latestMsg?.createdAt ? new Date(latestMsg.createdAt) : new Date();
    const isToday = new Date().toDateString() === dateStr.toDateString();
    const timeDisplay = isToday 
      ? dateStr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : dateStr.toLocaleDateString([], { month: 'short', day: 'numeric' });

    return (
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() => navigation.navigate('Chat', {
          userId: otherUser._id,
          userName: name,
        })}
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
              <Ionicons name="checkmark-done" size={14} color={COLORS.electricTeal} style={{ marginRight: 4 }} />
            )}
            <Text 
              style={[styles.messagePreview, isUnread && styles.unreadText]} 
              numberOfLines={1}
            >
              {latestMsg?.content || 'Sent an attachment'}
            </Text>
            
            {isUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadCount}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={COLORS.electricTeal} />
          </View>
        ) : chats.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.iconCircle}>
              <Ionicons name="chatbubbles-outline" size={48} color={COLORS.electricTeal} />
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
              <RefreshControl refreshing={refreshing} onRefresh={() => fetchChats(true)} tintColor={COLORS.electricTeal} />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.deepNavy },
  container: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.steelBlue,
  },
  headerTitle: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.hero, fontWeight: FONT_WEIGHTS.bold },
  
  listContent: { paddingVertical: SPACING.md },

  // Chat Card
  chatCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  avatarCircle: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: COLORS.steelBlue,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  avatarLetter: { color: COLORS.electricTeal, fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
  chatInfo: { flex: 1 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  chatName: { color: COLORS.cloudWhite, fontSize: 16, fontWeight: FONT_WEIGHTS.medium },
  chatTime: { color: COLORS.softSlate, fontSize: 12 },
  
  messageRow: { flexDirection: 'row', alignItems: 'center' },
  messagePreview: { color: COLORS.softSlate, fontSize: 14, flex: 1 },
  
  unreadText: { fontWeight: FONT_WEIGHTS.bold, color: COLORS.cloudWhite },
  unreadTime: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.bold },
  
  unreadBadge: {
    backgroundColor: COLORS.electricTeal, borderRadius: 10,
    minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 8,
    paddingHorizontal: 6,
  },
  unreadCount: { color: COLORS.deepNavy, fontSize: 10, fontWeight: FONT_WEIGHTS.bold },

  // Empty State
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(0, 194, 168, 0.1)',
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl,
  },
  emptyStateTitle: {
    color: COLORS.cloudWhite, fontSize: 22, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md, textAlign: 'center',
  },
  emptyStateSubtext: {
    color: COLORS.softSlate, fontSize: 16, textAlign: 'center', lineHeight: 24,
  },
});
