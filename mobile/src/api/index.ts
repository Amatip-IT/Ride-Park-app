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

export const searchApi = {
  // Search parking spaces by location query (postcode, town name, etc.)
  searchParking: (query: string, page = 1, limit = 20) =>
    api.get<ApiResponse>(`/search/parking?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`),

  // Search parking spaces near GPS coordinates (uses what3words on backend)
  searchParkingNearby: (lat: number, lng: number, page = 1, limit = 20) =>
    api.get<ApiResponse>(`/search/parking/nearby?lat=${lat}&lng=${lng}&page=${page}&limit=${limit}`),

  // Search drivers by location
  searchDrivers: (query: string, page = 1, limit = 20) =>
    api.get<ApiResponse>(`/search/drivers?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`),

  // Search taxis by location
  searchTaxis: (query: string, page = 1, limit = 20) =>
    api.get<ApiResponse>(`/search/taxis?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`),

  // Get parking space details
  getParkingDetail: (id: string) =>
    api.get<ApiResponse>(`/search/parking/${id}`),
};

export const bookingsApi = {
  // Create a booking request (consumer → provider)
  createRequest: (data: Record<string, any>) =>
    api.post<ApiResponse>('/bookings', data),

  // Get current user's bookings (consumer view)
  getMyBookings: (status?: string) =>
    api.get<ApiResponse>(`/bookings/my${status ? `?status=${status}` : ''}`),

  // Get incoming requests (provider view)
  getProviderRequests: (status?: string) =>
    api.get<ApiResponse>(`/bookings/provider${status ? `?status=${status}` : ''}`),

  // Provider responds to a request (accept or reject)
  respondToRequest: (id: string, action: 'accept' | 'reject', responseMessage?: string) =>
    api.patch<ApiResponse>(`/bookings/${id}/respond`, { action, responseMessage }),

  // Consumer cancels a booking
  cancelBooking: (id: string) =>
    api.patch<ApiResponse>(`/bookings/${id}/cancel`),
};

export const driverApi = {
  // Get driver details
  getDriver: (driverId: string) =>
    api.get<ApiResponse>(`/drivers/${driverId}`),
};

export const taxiApi = {
  // Request a taxi
  requestTaxi: (pickupLocation: string, dropoffLocation: string) =>
    api.post<ApiResponse>('/taxis/request', { pickupLocation, dropoffLocation }),

  // Get active taxi ride
  getActiveRide: () =>
    api.get<ApiResponse>('/taxis/active-ride'),

  // Complete ride
  completeRide: (rideId: string, rating: number) =>
    api.post<ApiResponse>(`/taxis/rides/${rideId}/complete`, { rating }),
};

export const providerApi = {
  // Get current provider's verification status
  getVerificationStatus: () =>
    api.get<ApiResponse>('/provider/verification-status'),

  // Get provider earnings
  getEarnings: () =>
    api.get<ApiResponse>('/provider/earnings'),

  // Submit parking provider verification
  submitParkingVerification: (data: Record<string, any>) =>
    api.post<ApiResponse>('/provider/submit-parking-verification', data),

  // Submit driver verification
  submitDriverVerification: (data: {
    driverLicenseUrl?: string;
    driverLicenseNumber?: string;
    nationalIdUrl?: string;
    proofOfAddressUrl?: string;
    proofOfAddressType?: string;
  }) =>
    api.post<ApiResponse>('/provider/submit-driver-verification', data),

  // Submit taxi driver verification
  submitTaxiVerification: (data: {
    driverLicenseUrl?: string;
    driverLicenseNumber?: string;
    plateNumber?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    nationalIdUrl?: string;
    proofOfAddressUrl?: string;
    proofOfAddressType?: string;
  }) =>
    api.post<ApiResponse>('/provider/submit-taxi-verification', data),

  // Toggle online/offline status
  toggleStatus: (status: 'online' | 'offline') =>
    api.post<ApiResponse>('/provider/toggle-status', { status }),

  // Get my driver number
  getMyDriverNumber: () =>
    api.get<ApiResponse>('/provider/my-driver-number'),
};

export const chatApi = {
  // Get recent chats list
  getMyChats: () =>
    api.get<ApiResponse>('/chat/my-chats'),

  // Get full conversation with a specific user
  getConversation: (otherUserId: string, bookingId?: string) =>
    api.get<ApiResponse>(`/chat/conversation/${otherUserId}${bookingId ? `?bookingId=${bookingId}` : ''}`),
};

export const adminApi = {
  // ── Parking Space Verifications ──
  getPendingParkingVerifications: () =>
    api.get<ApiResponse>('/admin/verifications/parking'),

  approveParkingVerification: (id: string) =>
    api.post<ApiResponse>(`/admin/verifications/parking/${id}/approve`),

  rejectParkingVerification: (id: string, reason: string) =>
    api.post<ApiResponse>(`/admin/verifications/parking/${id}/reject`, { reason }),

  // ── Provider Identity Verifications ──
  getPendingIdentityVerifications: () =>
    api.get<ApiResponse>('/admin/verifications/identity'),

  approveIdentityVerification: (userId: string) =>
    api.post<ApiResponse>(`/admin/verifications/identity/${userId}/approve`),

  rejectIdentityVerification: (userId: string, reason: string) =>
    api.post<ApiResponse>(`/admin/verifications/identity/${userId}/reject`, { reason }),
};

// ── Reviews API ──
export const reviewsApi = {
  createReview: (data: {
    serviceType: string;
    serviceId: string;
    bookingId?: string;
    rating: number;
    comment?: string;
  }) =>
    api.post<ApiResponse>('/reviews', data),

  getReviews: (serviceType: string, serviceId: string, page = 1) =>
    api.get<ApiResponse>(`/reviews/${serviceType}/${serviceId}?page=${page}`),
};

// ── Rides API ──
export const ridesApi = {
  getEstimate: (serviceType: 'driver' | 'taxi', distanceMiles: number, durationMinutes: number) =>
    api.post<ApiResponse>('/rides/estimate', { serviceType, distanceMiles, durationMinutes }),

  startRide: (data: {
    driverId: string;
    serviceType: 'driver' | 'taxi';
    bookingId?: string;
    pickup?: { address?: string; lat?: number; lng?: number };
    dropoff?: { address?: string; lat?: number; lng?: number };
  }) =>
    api.post<ApiResponse>('/rides/start', data),

  completeRide: (rideId: string, distanceMiles: number, durationMinutes: number) =>
    api.post<ApiResponse>(`/rides/${rideId}/complete`, { distanceMiles, durationMinutes }),

  getRide: (rideId: string) =>
    api.get<ApiResponse>(`/rides/${rideId}`),
};

// ── Taxi Bookings API (ride requests) ──
export const taxiBookingsApi = {
  // Passenger creates a ride request
  createRequest: (data: Record<string, any>) =>
    api.post<ApiResponse>('/taxi-bookings/request', data),

  // Driver: get available ride requests
  getAvailable: (postcode?: string) =>
    api.get<ApiResponse>(`/taxi-bookings/available${postcode ? `?postcode=${postcode}` : ''}`),

  // Driver: get their personal active accepted rides
  getDriverActive: () =>
    api.get<ApiResponse>('/taxi-bookings/driver/active'),

  // Driver accepts a request
  acceptRequest: (requestId: string, data: {
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    plateNumber?: string;
    etaMinutes: number;
  }) =>
    api.post<ApiResponse>(`/taxi-bookings/${requestId}/accept`, data),

  // Passenger cancels
  cancelRequest: (requestId: string) =>
    api.patch<ApiResponse>(`/taxi-bookings/${requestId}/cancel`),

  // Passenger: my ride history
  getMyRequests: () =>
    api.get<ApiResponse>('/taxi-bookings/my-requests'),

  // Get ride request details
  getRequest: (requestId: string) =>
    api.get<ApiResponse>(`/taxi-bookings/${requestId}`),

  // Admin: all active requests
  getAdminActive: () =>
    api.get<ApiResponse>('/taxi-bookings/admin/active'),
};

// ── Payments API (Wallet) ──
export const paymentsApi = {
  createSetupIntent: () =>
    api.post<ApiResponse>('/payments/setup-intent'),
    
  getPaymentMethods: () =>
    api.get<ApiResponse>('/payments/methods'),
};
