import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Platform, SafeAreaView, ActivityIndicator, TextInput, KeyboardAvoidingView, Keyboard
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { chatApi } from '@/api';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { useChatStore } from '@/store/chatStore';

type ChatParams = {
  Chat: { userId: string; userName: string; bookingId?: string };
};

export function ChatScreen() {
  const { user } = useAuthStore();
  const route = useRoute<RouteProp<ChatParams, 'Chat'>>();
  const navigation = useNavigation();
  const { userId: otherUserId, userName, bookingId } = route.params;

  const { connect, sendMessage, markAsRead, activeChatMessages, setActiveChatMessages } = useChatStore();
  
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (user?._id) {
      // Ensure we're connected to sockets
      connect(user._id);
      
      // Load history
      fetchHistory();
      
      // Mark as read
      markAsRead(user._id, otherUserId);
    }
    
    return () => {
      // Clean up active chat when leaving
      setActiveChatMessages([]);
    };
  }, [user?._id, otherUserId]);

  // Mark as read when new messages arrive while screen is focused
  useEffect(() => {
    if (activeChatMessages.length > 0 && user?._id) {
      const lastMsg = activeChatMessages[activeChatMessages.length - 1];
      if (lastMsg.sender === otherUserId && !lastMsg.isRead) {
        markAsRead(user._id, otherUserId);
      }
    }
  }, [activeChatMessages]);

  const fetchHistory = async () => {
    try {
      const response = await chatApi.getConversation(otherUserId, bookingId);
      if (response.data?.success) {
        setActiveChatMessages(response.data.data || []);
      }
    } catch (err) {
      console.log('Failed to fetch chat history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || !user?._id) return;
    
    sendMessage(user._id, otherUserId, inputText.trim(), bookingId);
    setInputText('');
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMine = item.sender === user?._id || item.sender?._id === user?._id;
    const time = item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    
    return (
      <View style={[styles.messageWrapper, isMine ? styles.myMessageWrapper : styles.theirMessageWrapper]}>
        <View style={[styles.messageBubble, isMine ? styles.myBubble : styles.theirBubble]}>
          <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText]}>
            {item.content}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isMine ? styles.myMessageTime : styles.theirMessageTime]}>
              {time}
            </Text>
            {isMine && (
              <Ionicons 
                name={item.isRead ? "checkmark-done" : "checkmark"} 
                size={14} 
                color={item.isRead ? COLORS.electricTeal : 'rgba(255,255,255,0.5)'} 
                style={{ marginLeft: 4 }}
              />
            )}
            {item.isOptimistic && (
              <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={COLORS.cloudWhite} />
          </TouchableOpacity>
          
          <View style={styles.headerTitleContainer}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>{userName.charAt(0)}</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>{userName}</Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Messages */}
        <View style={styles.messagesContainer}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.electricTeal} />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={activeChatMessages}
              keyExtractor={(item, index) => item._id || index.toString()}
              renderItem={renderMessage}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateTitle}>Start the conversation</Text>
                  <Text style={styles.emptyStateSubtext}>Send a message to {userName}.</Text>
                </View>
              }
            />
          )}
        </View>

        {/* Input area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={COLORS.softSlate}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity 
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]} 
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={20} color={inputText.trim() ? COLORS.deepNavy : COLORS.softSlate} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.deepNavy },
  container: { flex: 1 },
  
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.steelBlue,
    backgroundColor: COLORS.deepNavy,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' },
  avatarCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.steelBlue,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm,
  },
  avatarLetter: { color: COLORS.electricTeal, fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  headerTitle: { color: COLORS.cloudWhite, fontSize: 16, fontWeight: FONT_WEIGHTS.bold },

  // Messages Area
  messagesContainer: { flex: 1, backgroundColor: COLORS.deepNavy },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  
  messageWrapper: { marginBottom: SPACING.md, flexDirection: 'row' },
  myMessageWrapper: { justifyContent: 'flex-end' },
  theirMessageWrapper: { justifyContent: 'flex-start' },
  
  messageBubble: { 
    maxWidth: '80%', padding: 12, borderRadius: 16,
  },
  myBubble: { 
    backgroundColor: COLORS.electricTeal, 
    borderBottomRightRadius: 4,
  },
  theirBubble: { 
    backgroundColor: COLORS.steelBlue,
    borderBottomLeftRadius: 4,
  },
  
  messageText: { fontSize: 15, lineHeight: 22 },
  myMessageText: { color: COLORS.deepNavy },
  theirMessageText: { color: COLORS.cloudWhite },
  
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  messageTime: { fontSize: 11 },
  myMessageTime: { color: 'rgba(0,0,0,0.5)' },
  theirMessageTime: { color: COLORS.softSlate },
  
  // Input
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, paddingBottom: Platform.OS === 'ios' ? SPACING.xl : SPACING.md,
    backgroundColor: COLORS.steelBlue,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  textInput: {
    flex: 1, backgroundColor: COLORS.deepNavy, borderRadius: 20,
    paddingHorizontal: SPACING.lg, paddingTop: 12, paddingBottom: 12,
    color: COLORS.cloudWhite, fontSize: 15,
    minHeight: 44, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.electricTeal,
    justifyContent: 'center', alignItems: 'center', marginLeft: SPACING.sm,
  },
  sendBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.1)' },

  // Empty State
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyStateTitle: {
    color: COLORS.cloudWhite, fontSize: 18, fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  emptyStateSubtext: { color: COLORS.softSlate, fontSize: 14 },
});
