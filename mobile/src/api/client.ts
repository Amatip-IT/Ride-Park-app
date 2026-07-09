import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { secureStorage } from '@/utils/secureStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';
const REFRESH_TOKEN_KEY = 'refreshToken';

if (__DEV__) {
  console.log('[API] base URL:', API_BASE_URL);
}

class ApiClient {
  private client: AxiosInstance;
  private isLoggingOut = false;
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
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
        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );

    // Response Interceptor - Handle Errors + silent token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
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
            useAuthStore.getState().logout().finally(() => {
              this.isLoggingOut = false;
            });
          }, 250);
        }

        const isTimeout =
          error.code === 'ECONNABORTED' || error.message?.toLowerCase().includes('timeout');
        const isNetwork =
          error.code === 'ERR_NETWORK' ||
          error.message === 'Network Error' ||
          !error.response;

        let message = (error.response?.data as any)?.message || error.message;
        if (Array.isArray(message)) {
          message = message.join(', ');
        }
        if (status === 401) {
          message = 'Your session has expired. Please sign in again.';
        } else if (isTimeout || isNetwork) {
          message =
            `Cannot reach the server at ${API_BASE_URL}. ` +
            'On a phone, use your PC IPv4 in mobile/.env (same Wi‑Fi), port 5001, then restart Expo. ' +
            `(${error.code || 'network'})`;
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
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const refreshToken = await secureStorage.getItem(REFRESH_TOKEN_KEY);
        if (!refreshToken) return null;

        const { data } = await axios.post(`${API_BASE_URL}/users/refresh-token`, {
          refreshToken,
        });

        if (!data?.success || !data?.token) return null;

        await secureStorage.setItem('authToken', data.token);
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
