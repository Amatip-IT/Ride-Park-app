import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import Constants from 'expo-constants';
import { useAuthStore } from '@/store/authStore';

// Always read from Expo config (works in production builds)
const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl || 'https://www.gleezip.com/api';

if (__DEV__) {
  console.log('[API] base URL:', API_BASE_URL);
}

class ApiClient {
  private client: AxiosInstance;

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

    // Response Interceptor - Handle Errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.log('❌ API ERROR:', error.message);

        if (error.response?.status === 401) {
          useAuthStore.getState().logout();
        }

        const isTimeout =
          error.code === 'ECONNABORTED' || error.message?.toLowerCase().includes('timeout');
        const isNetwork =
          error.code === 'ERR_NETWORK' ||
          error.message === 'Network Error' ||
          !error.response;

        let message = (error.response?.data as any)?.message || error.message;
        if (isTimeout || isNetwork) {
          message =
            `Cannot reach the server at ${API_BASE_URL}. ` +
            'On a phone, use your PC IPv4 in mobile/.env (same Wi‑Fi), port 5001, then restart Expo. ' +
            `(${error.code || 'network'})`;
        }

        return Promise.reject({
          message,
          status: error.response?.status,
          code: error.code,
        });
      }
    );
  }

  getInstance(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClient();
