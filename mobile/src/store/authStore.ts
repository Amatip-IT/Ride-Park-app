import { create } from 'zustand';
import { User, UserRole } from '@/types';
import { secureStorage } from '@/utils/secureStorage';

interface AuthStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  login: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreToken: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isLoading: false,
  isAuthenticated: false,
  error: null,

  setUser: (user: User | null) => set({ user, isAuthenticated: !!user }),
  setToken: (token: string | null) => set({ token }),
  setIsLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),

  login: async (user: User, token: string) => {
    try {
      // Store token securely
      await secureStorage.setItem('authToken', token);
      set({
        user,
        token,
        isAuthenticated: true,
        error: null,
      });
    } catch (error) {
      set({ error: 'Failed to save authentication token' });
    }
  },

  logout: async () => {
    try {
      await secureStorage.removeItem('authToken');
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        error: null,
      });
    } catch (error) {
      set({ error: 'Failed to logout' });
    }
  },

  restoreToken: async () => {
    try {
      const token = await secureStorage.getItem('authToken');
      if (token) {
        set({ token });
        // In a real app, validate token with backend here
      }
    } catch (error) {
      set({ error: 'Failed to restore authentication' });
    }
  },
}));

// Separate store for user role and verification status
interface RoleStore {
  userRole: UserRole | null;
  setUserRole: (role: UserRole) => void;
  isProviderFlow: boolean;
  setIsProviderFlow: (isProvider: boolean) => void;
}

export const useRoleStore = create<RoleStore>((set) => ({
  userRole: 'user',
  setUserRole: (role: UserRole) => set({ userRole: role }),
  isProviderFlow: false,
  setIsProviderFlow: (isProvider: boolean) => set({ isProviderFlow: isProvider }),
}));
