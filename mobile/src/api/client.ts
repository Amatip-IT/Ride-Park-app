import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';
import { secureStorage } from '../utils/secureStorage';

// Prefer the Expo public environment variable for flexibility across
// development, staging, and production.
//
// Fall back to Expo config (`extra.apiUrl`) for projects that inject
// configuration through app.config.ts / app.json.
//
// Finally fall back to the production API so release builds still have
// a valid endpoint even if configuration is missing.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'https://www.gleezip.com/api';

// Introduced by the incoming branch to support silent JWT refresh.
const REFRESH_TOKEN_KEY = 'refreshToken';

if (__DEV__) {
  console.log('[API] base URL:', API_BASE_URL);
}

class ApiClient {
  private client: AxiosInstance;
  private isLoggingOut = false;

  // Prevent multiple simultaneous refresh requests. If several API calls
  // receive a 401 at once, they all wait for the same refresh operation.
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    console.log('🚀 API BASE URL:', API_BASE_URL); // Debug log

    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request Interceptor - Add JWT Token
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const { token } = useAuthStore.getState();

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // ✅ Debug request URL
        console.log('📡 REQUEST:', `${config.baseURL}${config.url}`);

        return config;
      },
      (error: AxiosError) => Promise.reject(error)
    );

    // Response Interceptor - Handle Errors + silent token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };

        const status = error.response?.status;

        if (
          status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/users/refresh-token') &&
          !originalRequest.url?.includes('/users/login')
        ) {
          originalRequest._retry = true;

          try {
            const newToken = await this.refreshAccessToken();

            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return this.client(originalRequest);
            }
          } catch {
            // Fall through to logout below
          }
        }

        if (status === 401 && !this.isLoggingOut) {
          this.isLoggingOut = true;

          // Defer logout so in-flight UI (alerts, modals) can finish without crashing
          setTimeout(() => {
            useAuthStore
              .getState()
              .logout()
              .finally(() => {
                this.isLoggingOut = false;
              });
          }, 250);
        }

        const isTimeout =
          error.code === 'ECONNABORTED' ||
          error.message?.toLowerCase().includes('timeout');

        const isNetwork =
          error.code === 'ERR_NETWORK' ||
          error.message === 'Network Error' ||
          !error.response;

        let message =
          (error.response?.data as any)?.message || error.message;

        if (Array.isArray(message)) {
          message = message.join(', ');
        }

        if (status === 401) {
          message = 'Your session has expired. Please sign in again.';
        } else if (isTimeout || isNetwork) {
          message =
            'You appear to be offline or the service is temporarily unavailable. Check your connection and try again.';

          if (__DEV__) {
            message += ` API: ${API_BASE_URL} (${error.code || 'network'}).`;
          }
        }

        return Promise.reject({
          message,
          status,
          code: error.code,
        });
      }
    );
  }

  private async refreshAccessToken(): Promise<string | null> {
    // Reuse an existing refresh request if one is already running.
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;

    this.refreshPromise = (async () => {
      try {
        const refreshToken = await secureStorage.getItem(REFRESH_TOKEN_KEY);

        if (!refreshToken) {
          return null;
        }

        const { data } = await axios.post(
          `${API_BASE_URL}/users/refresh-token`,
          {
            refreshToken,
          }
        );

        if (!data?.success || !data?.token) {
          return null;
        }

        await secureStorage.setItem('authToken', data.token);

        // Some backends rotate refresh tokens. Persist the new one if returned.
        if (data.refreshToken) {
          await secureStorage.setItem(
            REFRESH_TOKEN_KEY,
            data.refreshToken
          );
        }

        useAuthStore.getState().setToken(data.token);

        return data.token as string;
      } catch {
        return null;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  getInstance(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClient();
