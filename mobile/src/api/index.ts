import { apiClient } from './client';
import { ApiResponse, AuthResponse, LoginRequest, RegisterRequest, OtpVerificationRequest, IdentitySessionResponse } from '@/types';

const api = apiClient.getInstance();

export const authApi = {
  // Register new user
  register: (data: RegisterRequest) =>
    api.post<ApiResponse<AuthResponse>>('/users/register', data),

  // Login with email and password
  login: (data: LoginRequest) =>
    api.post<ApiResponse<AuthResponse>>('/users/login', data),

  // Send email OTP for verification
  sendEmailOtp: (email: string) =>
    api.post<ApiResponse>('/verification/send-email-otp-verification', { email }),

  // Verify email OTP
  verifyEmailOtp: (data: OtpVerificationRequest) =>
    api.post<ApiResponse>('/verification/verify-email-otp', data),

  // Send phone OTP (Twilio SMS)
  sendPhoneOtp: (phoneNumber: string) =>
    api.post<ApiResponse>('/verification/send-phone-otp', { phoneNumber }),

  // Verify phone OTP
  verifyPhoneOtp: (data: OtpVerificationRequest) =>
    api.post<ApiResponse>('/verification/verify-phone-otp', data),

  // Create Stripe Identity session
  createIdentitySession: (email: string) =>
    api.post<ApiResponse<IdentitySessionResponse>>('/verification/create-identity-session', { email }),

  // Get current user profile
  getProfile: () =>
    api.get<ApiResponse>('/users/profile'),

  // Logout (optional backend call)
  logout: () =>
    api.post<ApiResponse>('/users/logout'),
};

export const parkingApi = {
  // Search parking spaces by postcode
  searchSpaces: (postcode: string, page = 1, limit = 10) =>
    api.get<ApiResponse>(`/parking/search?postcode=${postcode}&page=${page}&limit=${limit}`),

  // Get parking space details
  getSpace: (spaceId: string) =>
    api.get<ApiResponse>(`/parking/spaces/${spaceId}`),

  // Create parking booking
  createBooking: (spaceId: string, data: any) =>
    api.post<ApiResponse>(`/parking/bookings`, { spaceId, ...data }),

  // List user's bookings
  getBookings: () =>
    api.get<ApiResponse>('/parking/bookings'),
};

export const driverApi = {
  // Get available drivers by postcode
  searchDrivers: (postcode: string, page = 1, limit = 10) =>
    api.get<ApiResponse>(`/drivers/search?postcode=${postcode}&page=${page}&limit=${limit}`),

  // Get driver details
  getDriver: (driverId: string) =>
    api.get<ApiResponse>(`/drivers/${driverId}`),

  // Create driver hire booking
  createBooking: (driverId: string, data: any) =>
    api.post<ApiResponse>('/drivers/bookings', { driverId, ...data }),

  // List user's driver bookings
  getBookings: () =>
    api.get<ApiResponse>('/drivers/bookings'),
};

export const taxiApi = {
  // Search taxis by postcode
  searchTaxis: (postcode: string, page = 1, limit = 10) =>
    api.get<ApiResponse>(`/taxis/search?postcode=${postcode}&page=${page}&limit=${limit}`),

  // Request a taxi
  requestTaxi: (pickupPostcode: string, dropoffPostcode: string) =>
    api.post<ApiResponse>('/taxis/request', { pickupPostcode, dropoffPostcode }),

  // Get active taxi ride
  getActiveRide: () =>
    api.get<ApiResponse>('/taxis/active-ride'),

  // Complete ride
  completeRide: (rideId: string, rating: number) =>
    api.post<ApiResponse>(`/taxis/rides/${rideId}/complete`, { rating }),
};
