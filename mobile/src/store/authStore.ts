import { create } from 'zustand';
import { User, UserRole } from '@/types';
import { secureStorage } from '@/utils/secureStorage';
import { authService } from '@/api/authService';

interface AuthStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setIsOnboarded: (onboarded: boolean) => void;
  setError: (error: string | null) => void;
  login: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreToken: () => Promise<void>;
}

const AUTH_USER_KEY = 'authUser';

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  isOnboarded: false,
  error: null,

  setUser: (user: User | null) => set({ user, isAuthenticated: !!user }),
  setToken: (token: string | null) => set({ token }),
  setIsLoading: (loading: boolean) => set({ isLoading: loading }),
  setIsOnboarded: (onboarded: boolean) => set({ isOnboarded: onboarded }),
  setError: (error: string | null) => set({ error }),

  login: async (user: User, token: string) => {
    try {
      await secureStorage.setItem('authToken', token);
      await secureStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
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
      await secureStorage.removeItem(AUTH_USER_KEY);
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
    set({ isLoading: true, error: null });

    try {
      const token = await secureStorage.getItem('authToken');
      const onboarded = await secureStorage.getItem('onboarded');
      const cachedUserJson = await secureStorage.getItem(AUTH_USER_KEY);

      if (onboarded === 'true') {
        set({ isOnboarded: true });
      }

      if (!token) {
        set({ isLoading: false });
        return;
      }

      set({ token });

      if (cachedUserJson) {
        try {
          const cachedUser = JSON.parse(cachedUserJson) as User;
          set({ user: cachedUser, isAuthenticated: true });
        } catch {
          // Ignore invalid cache
        }
      }

      const profile = await authService.getProfile();
      if (profile.success && profile.data) {
        const user = profile.data as User;
        await secureStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        set({
          user,
          token,
          isAuthenticated: true,
          error: null,
        });
      } else {
        await secureStorage.removeItem('authToken');
        await secureStorage.removeItem(AUTH_USER_KEY);
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      }
    } catch (error) {
      const hasSession = get().isAuthenticated;
      if (!hasSession) {
        await secureStorage.removeItem('authToken');
        await secureStorage.removeItem(AUTH_USER_KEY);
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: 'Failed to restore authentication',
        });
      }
    } finally {
      set({ isLoading: false });
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
