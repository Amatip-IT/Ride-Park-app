import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

const getBaseUrl = () => {
  const defaultUrl = 'http://127.0.0.1:5001';
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || defaultUrl;
  
  try {
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return defaultUrl;
  }
};

interface TaxiState {
  socket: Socket | null;
  isConnected: boolean;
  currentUserId: string | null;
  joinedRideIds: string[];
  activeRequest: any | null;
  driverLocation: { lat: number; lng: number; rotation: number } | null;
  
  // Actions
  connect: (userId: string) => void;
  disconnect: () => void;
  joinRide: (requestId: string) => void;
  leaveRide: (requestId: string) => void;
  updateDriverLocation: (
    requestId: string,
    driverId: string,
    lat: number,
    lng: number,
    rotation?: number
  ) => void;
  setActiveRequest: (req: any | null) => void;
}

export const useTaxiStore = create<TaxiState>((set, get) => ({
  socket: null,
  isConnected: false,
  currentUserId: null,
  joinedRideIds: [],
  activeRequest: null,
  driverLocation: null,

  connect: (userId: string) => {
    const existingSocket = get().socket;
    set({ currentUserId: userId });

    if (existingSocket) {
      if (existingSocket.connected) {
        existingSocket.emit('authenticate', { userId });
        get().joinedRideIds.forEach((requestId) => {
          existingSocket.emit('join_ride', { requestId });
        });
      } else {
        existingSocket.connect();
      }
      return;
    }

    const socket = io(`${getBaseUrl()}/taxi`, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('Taxi socket connected:', socket.id);
      set({ isConnected: true });
      const activeUserId = get().currentUserId;
      if (activeUserId) {
        socket.emit('authenticate', { userId: activeUserId });
      }
      get().joinedRideIds.forEach((requestId) => {
        socket.emit('join_ride', { requestId });
      });
    });

    socket.on('disconnect', () => {
      console.log('Taxi socket disconnected');
      set({ isConnected: false });
    });

    socket.on('connect_error', () => {
      set({ isConnected: false });
    });

    socket.on('request_updated', (updatedRequest: any) => {
      const updatedRequestId = updatedRequest?._id?.toString();
      if (updatedRequestId && get().joinedRideIds.includes(updatedRequestId)) {
        console.log('Taxi request received real-time update:', updatedRequest.status);
        set({ activeRequest: updatedRequest });
      }
    });

    socket.on('driver_location_updated', (data: { lat: number; lng: number; rotation: number }) => {
      console.log('Driver location update received in real-time:', data.lat, data.lng);
      set({ driverLocation: data });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({
        socket: null,
        isConnected: false,
        currentUserId: null,
        joinedRideIds: [],
        activeRequest: null,
        driverLocation: null,
      });
    }
  },

  joinRide: (requestId: string) => {
    const { socket } = get();
    if (!get().joinedRideIds.includes(requestId)) {
      set({ joinedRideIds: [...get().joinedRideIds, requestId] });
    }
    if (socket?.connected) {
      socket.emit('join_ride', { requestId });
      console.log(`Joined ride room for request: ${requestId}`);
    }
  },

  leaveRide: (requestId: string) => {
    const { socket } = get();
    set({ joinedRideIds: get().joinedRideIds.filter((id) => id !== requestId) });
    if (socket?.connected) {
      socket.emit('leave_ride', { requestId });
      console.log(`Left ride room for request: ${requestId}`);
    }
  },

  updateDriverLocation: (requestId, driverId, lat, lng, rotation = 0) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('update_location', {
        requestId,
        driverId,
        lat,
        lng,
        rotation,
      });
      // Optionally update own state for optimistic rendering
      set({ driverLocation: { lat, lng, rotation } });
    } else {
      console.warn('Taxi socket not connected, cannot update location');
    }
  },

  setActiveRequest: (req) => set({ activeRequest: req }),
}));
