import { create } from 'zustand';
import { BookingRequest } from '@/types';
import { secureStorage } from '@/utils/secureStorage';

const DARK_MODE_KEY = 'darkMode';

interface BookingStore {
  currentBooking: BookingRequest | null;
  bookings: BookingRequest[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentBooking: (booking: BookingRequest | null) => void;
  setBookings: (bookings: BookingRequest[]) => void;
  addBooking: (booking: BookingRequest) => void;
  updateBooking: (bookingId: string, updates: Partial<BookingRequest>) => void;
  removeBooking: (bookingId: string) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useBookingStore = create<BookingStore>((set) => ({
  currentBooking: null,
  bookings: [],
  isLoading: false,
  error: null,

  setCurrentBooking: (booking: BookingRequest | null) => set({ currentBooking: booking }),
  setBookings: (bookings: BookingRequest[]) => set({ bookings }),

  addBooking: (booking: BookingRequest) =>
    set((state: BookingStore) => ({
      bookings: [booking, ...state.bookings],
    })),

  updateBooking: (bookingId: string, updates: Partial<BookingRequest>) =>
    set((state: BookingStore) => ({
      bookings: state.bookings.map((b) =>
        b._id === bookingId ? { ...b, ...updates } : b
      ),
    })),

  removeBooking: (bookingId: string) =>
    set((state: BookingStore) => ({
      bookings: state.bookings.filter((b) => b._id !== bookingId),
    })),

  setIsLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),
}));

// Verification Flow Store
interface VerificationStore {
  currentStep: number;
  totalSteps: number;
  completedSteps: string[];
  verificationData: Record<string, unknown>;

  // Actions
  setCurrentStep: (step: number) => void;
  moveToNextStep: () => void;
  moveToPreviousStep: () => void;
  completeStep: (stepName: string) => void;
  setVerificationData: (key: string, value: unknown) => void;
  resetFlow: () => void;
}

export const useVerificationStore = create<VerificationStore>((set) => ({
  currentStep: 1,
  totalSteps: 6, // Email → Phone → Identity → DVLA → MOT → Documents
  completedSteps: [],
  verificationData: {},

  setCurrentStep: (step: number) => set({ currentStep: step }),

  moveToNextStep: () =>
    set((state: VerificationStore) => ({
      currentStep: Math.min(state.currentStep + 1, state.totalSteps),
    })),

  moveToPreviousStep: () =>
    set((state: VerificationStore) => ({
      currentStep: Math.max(state.currentStep - 1, 1),
    })),

  completeStep: (stepName: string) =>
    set((state: VerificationStore) => ({
      completedSteps: [...new Set([...state.completedSteps, stepName])],
    })),

  setVerificationData: (key: string, value: unknown) =>
    set((state: VerificationStore) => ({
      verificationData: { ...state.verificationData, [key]: value },
    })),

  resetFlow: () =>
    set({
      currentStep: 1,
      completedSteps: [],
      verificationData: {},
    }),
}));

// UI State Store (theme, loading, etc.)
interface UIStore {
  isDarkMode: boolean;
  isLoading: boolean;
  toastMessage: string | null;
  toastType: 'success' | 'error' | 'info' | 'warning' | null;

  // Actions
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
  hydrateDarkMode: () => Promise<void>;
  setIsLoading: (loading: boolean) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  clearToast: () => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  isDarkMode: false,
  isLoading: false,
  toastMessage: null,
  toastType: null,

  toggleDarkMode: () => {
    const next = !get().isDarkMode;
    set({ isDarkMode: next });
    secureStorage.setItem(DARK_MODE_KEY, next ? 'true' : 'false').catch(() => {});
  },

  setDarkMode: (value: boolean) => {
    set({ isDarkMode: value });
    secureStorage.setItem(DARK_MODE_KEY, value ? 'true' : 'false').catch(() => {});
  },

  hydrateDarkMode: async () => {
    try {
      const stored = await secureStorage.getItem(DARK_MODE_KEY);
      if (stored === 'true') set({ isDarkMode: true });
      if (stored === 'false') set({ isDarkMode: false });
    } catch {
      // ignore
    }
  },

  setIsLoading: (loading: boolean) => set({ isLoading: loading }),

  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') =>
    set({ toastMessage: message, toastType: type }),

  clearToast: () => set({ toastMessage: null, toastType: null }),
}));
