import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { Constants } from 'expo-constants'; // fallback for EXPO_PUBLIC_API_URL if needed

// We extract just the base URL for the socket connection (removing /api or /v1 paths)
const getBaseUrl = () => {
  const defaultUrl = 'http://127.0.0.1:5000';
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || defaultUrl;
  
  try {
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}`;
  } catch (e) {
    return defaultUrl;
  }
};

interface ChatState {
  socket: Socket | null;
  isConnected: boolean;
  activeChatMessages: any[];
  unreadTotal: number;
  
  // Actions
  connect: (userId: string) => void;
  disconnect: () => void;
  sendMessage: (senderId: string, recipientId: string, content: string, bookingId?: string) => void;
  markAsRead: (userId: string, senderId: string) => void;
  setActiveChatMessages: (messages: any[]) => void;
  addMessageToActiveChat: (message: any) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  socket: null,
  isConnected: false,
  activeChatMessages: [],
  unreadTotal: 0,
  connect: (userId: string) => {
    let isConfigured = false;
    
    if (get().socket) {
      // If we already have a socket instance, just connect it if disconnected
      if (!get().socket!.connected) {
        get().socket!.connect();
      }
      isConfigured = true;
    }

    const socket = get().socket || io(`${getBaseUrl()}/chat`, {
      transports: ['websocket'],
      autoConnect: true,
    });

    if (!isConfigured) {
      socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        set({ isConnected: true });
        socket.emit('authenticate', { userId });
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
        set({ isConnected: false });
      });

      socket.on('receive_message', (message: any) => {
        set((state) => {
          // Prevent exact ID duplicates
          if (state.activeChatMessages.some(m => m._id === message._id)) return state;
          
          // Replace matching optimistic messages
          const cleanQueue = state.activeChatMessages.filter(
             m => !(m.isOptimistic && m.content === message.content && m.sender === message.sender)
          );
          return { activeChatMessages: [...cleanQueue, message] };
        });
      });

      socket.on('message_sent', (message: any) => {
        set((state) => {
          // Replace the optimistic temp message with the real one from server
          return {
            activeChatMessages: state.activeChatMessages.map(msg => 
              (msg.isOptimistic && msg.content === message.content && msg.sender === message.sender) 
                ? message 
                : msg
            )
          };
        });
      });
    }

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  sendMessage: (senderId, recipientId, content, bookingId) => {
    const { socket } = get();
    if (socket?.connected) {
      // Create a temporary message for optimistic UI updates
      const tempId = `temp_${Date.now()}`;
      const tempMessage = {
        _id: tempId,
        sender: senderId,
        recipient: recipientId,
        bookingId,
        content,
        createdAt: new Date().toISOString(),
        isOptimistic: true, // Custom flag to show a sending state
      };
      
      set(state => ({ activeChatMessages: [...state.activeChatMessages, tempMessage] }));
      
      socket.emit('send_message', { senderId, recipientId, bookingId, content });
    } else {
      console.warn('Cannot send message: socket not connected');
    }
  },

  markAsRead: (userId, senderId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('mark_read', { userId, senderId });
    }
  },

  setActiveChatMessages: (messages) => set({ activeChatMessages: messages }),
  
  addMessageToActiveChat: (message) => set((state) => ({ 
    activeChatMessages: [...state.activeChatMessages, message]
  })),
}));
