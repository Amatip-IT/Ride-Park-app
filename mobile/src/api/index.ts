import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';

const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || 'https://www.gleezip.com/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await api.post('/users/refresh-token', { refreshToken });
          const { accessToken } = response.data;
          await AsyncStorage.setItem('authToken', accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        await AsyncStorage.removeItem('authToken');
        await AsyncStorage.removeItem('refreshToken');
        // Navigate to login
      }
    }
    return Promise.reject(error);
  }
);

// ============================================================
// PROVIDER API - FIXED with documentType support
// ============================================================
export const providerApi = {
  // ============================================================
  // uploadDocument - NOW includes documentType validation
  // ============================================================
  uploadDocument: async (formData: FormData) => {
    // Ensure documentType is present
    const documentType = formData.get('documentType');
    if (!documentType) {
      throw new Error('documentType is required. Please select a document type.');
    }

    // Ensure file is present
    const file = formData.get('file');
    if (!file) {
      throw new Error('File is required. Please select a file to upload.');
    }

    const response = await api.post('/provider/upload-document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  uploadFile: async (formData: FormData) => {
    // For general file uploads (profile pics, etc.)
    const file = formData.get('file');
    if (!file) {
      throw new Error('File is required. Please select a file to upload.');
    }

    const response = await api.post('/users/upload-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getVerificationStatus: async () => {
    const response = await api.get('/provider/verification-status');
    return response.data;
  },

  submitParkingVerification: async (data: any) => {
    const response = await api.post('/provider/submit-parking-verification', data);
    return response.data;
  },

  submitDriverVerification: async (data: { docField: string; docUrl: string }) => {
    const response = await api.post('/provider/submit-driver-verification', data);
    return response.data;
  },

  submitTaxiVerification: async (data: { docField: string; docUrl: string; plateNumber?: string; vehicleMake?: string; vehicleModel?: string; vehicleYear?: string }) => {
    const response = await api.post('/provider/submit-taxi-verification', data);
    return response.data;
  },

  toggleStatus: async (data: { status: 'online' | 'offline'; lat?: number; lng?: number }) => {
    const response = await api.post('/provider/toggle-status', data);
    return response.data;
  },

  updateLocation: async (data: { lat: number; lng: number }) => {
    const response = await api.post('/provider/location', data);
    return response.data;
  },

  getMyDriverNumber: async () => {
    const response = await api.get('/provider/my-driver-number');
    return response.data;
  },

  getDocuments: async () => {
    const response = await api.get('/provider/documents');
    return response.data;
  },
};

export default api;
