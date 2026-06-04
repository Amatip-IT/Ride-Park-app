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

export const usersApi = {
  updatePushToken: (pushToken: string) =>
    api.patch<ApiResponse>('/users/profile', { pushToken }),
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

  // Search drivers nearby
  searchDriversNearby: (lat: number, lng: number, page = 1, limit = 20) =>
    api.get<ApiResponse>(`/search/drivers/nearby?lat=${lat}&lng=${lng}&page=${page}&limit=${limit}`),

  // Search taxis by location
  searchTaxis: (query: string, page = 1, limit = 20) =>
    api.get<ApiResponse>(`/search/taxis?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`),

  // Search taxis nearby
  searchTaxisNearby: (lat: number, lng: number, page = 1, limit = 20) =>
    api.get<ApiResponse>(`/search/taxis/nearby?lat=${lat}&lng=${lng}&page=${page}&limit=${limit}`),

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

  // Provider marks a booking as completed (frees the parking spot)
  completeBooking: (id: string) =>
    api.patch<ApiResponse>(`/bookings/${id}/complete`),

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

  // Get all approved parking spaces with live stats
  getMySpaces: () =>
    api.get<ApiResponse>('/provider/my-spaces'),

  // Update a parking space's details (pricing, description, etc.)
  updateSpace: (spaceId: string, updates: Record<string, any>) =>
    api.patch<ApiResponse>(`/provider/spaces/${spaceId}`, updates),

  // Toggle a parking space's availability on/off
  toggleSpaceAvailability: (spaceId: string) =>
    api.patch<ApiResponse>(`/provider/spaces/${spaceId}/toggle-availability`),

  // Submit parking provider verification
  submitParkingVerification: (data: Record<string, any>) =>
    api.post<ApiResponse>('/provider/submit-parking-verification', data),

  // Submit a single driver document (docField = the schema field name, docUrl = S3 URL)
  submitDriverVerification: (data: { docField: string; docUrl: string }) =>
    api.post<ApiResponse>('/provider/submit-driver-verification', data),

  // Submit a single taxi driver document
  submitTaxiVerification: (data: { docField: string; docUrl: string }) =>
    api.post<ApiResponse>('/provider/submit-taxi-verification', data),

  // Toggle online/offline status
  toggleStatus: (status: 'online' | 'offline') =>
    api.post<ApiResponse>('/provider/toggle-status', { status }),

  // Get my driver number
  getMyDriverNumber: () =>
    api.get<ApiResponse>('/provider/my-driver-number'),

  // Upload a document to S3 using native fetch to avoid React Native Axios FormData bugs
  uploadDocument: async (formData: any) => {
    const { useAuthStore } = require('@/store/authStore');
    const token = useAuthStore.getState().token;
    const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';
    
    const response = await fetch(`${API_BASE_URL}/provider/upload-document`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw { response: { data } };
    }
    return { data };
  },
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
  // ── Users Management ──
  getUsers: () =>
    api.get<ApiResponse>('/users'),

  deleteUser: (userId: string) =>
    api.delete<ApiResponse>(`/users/${userId}`),

  // ── Parking Space Verifications ──
  getPendingParkingVerifications: () =>
    api.get<ApiResponse>('/admin/verifications/parking'),

  approveParkingVerification: (id: string) =>
    api.post<ApiResponse>(`/admin/verifications/parking/${id}/approve`),

  rejectParkingVerification: (id: string, reason: string) =>
    api.post<ApiResponse>(`/admin/verifications/parking/${id}/reject`, { reason }),

  // ── Driver / Taxi Document Verifications ──
  getPendingDriverVerifications: () =>
    api.get<ApiResponse>('/admin/verifications/drivers'),

  getDriverVerificationDetail: (recordId: string, providerType: string) =>
    api.get<ApiResponse>(`/admin/verifications/drivers/${recordId}?type=${providerType}`),

  approveDriverVerification: (recordId: string, providerType: string) =>
    api.post<ApiResponse>(`/admin/verifications/drivers/${recordId}/approve`, { providerType }),

  rejectDriverVerification: (recordId: string, providerType: string, reason: string) =>
    api.post<ApiResponse>(`/admin/verifications/drivers/${recordId}/reject`, { providerType, reason }),

  approveDocumentField: (recordId: string, providerType: string, docField: string) =>
    api.post<ApiResponse>(`/admin/verifications/drivers/${recordId}/documents/${docField}/approve`, { providerType }),

  rejectDocumentField: (recordId: string, providerType: string, docField: string, reason: string) =>
    api.post<ApiResponse>(`/admin/verifications/drivers/${recordId}/documents/${docField}/reject`, { providerType, reason }),

  // ── Provider Identity Verifications ──
  getPendingIdentityVerifications: () =>
    api.get<ApiResponse>('/admin/verifications/identity'),

  approveIdentityVerification: (userId: string) =>
    api.post<ApiResponse>(`/admin/verifications/identity/${userId}/approve`),

  rejectIdentityVerification: (userId: string, reason: string) =>
    api.post<ApiResponse>(`/admin/verifications/identity/${userId}/reject`, { reason }),

  // ── Platform Settings ──
  getPlatformSettings: () =>
    api.get<ApiResponse>('/admin/verifications/settings'),

  updatePlatformFee: (percentage: number) =>
    api.post<ApiResponse>('/admin/verifications/settings/fee', { percentage }),

  // ── Payouts (Withdrawals) ──
  getPendingWithdrawals: () =>
    api.get<ApiResponse>('/admin/verifications/withdrawals'),

  approveWithdrawal: (id: string) =>
    api.post<ApiResponse>(`/admin/verifications/withdrawals/${id}/approve`),

  rejectWithdrawal: (id: string, reason: string) =>
    api.post<ApiResponse>(`/admin/verifications/withdrawals/${id}/reject`, { reason }),

  // ── User Account Management ──
  suspendUser: (userId: string, reason: string, durationDays?: number) =>
    api.post<ApiResponse>(`/admin/verifications/users/${userId}/suspend`, { reason, durationDays }),

  unsuspendUser: (userId: string) =>
    api.post<ApiResponse>(`/admin/verifications/users/${userId}/unsuspend`),

  banUser: (userId: string, reason: string) =>
    api.post<ApiResponse>(`/admin/verifications/users/${userId}/ban`, { reason }),

  unbanUser: (userId: string) =>
    api.post<ApiResponse>(`/admin/verifications/users/${userId}/unban`),

  // ── Document Expiry Management ──
  getExpiringDocuments: (alertLevel?: 'all' | '30_day' | '7_day' | 'expired') =>
    api.get<ApiResponse>(`/admin/verifications/documents/expiring${alertLevel ? `?alertLevel=${alertLevel}` : ''}`),

  renewDocument: (recordId: string, providerType: string, docField: string, newExpiryDate: string) =>
    api.post<ApiResponse>(`/admin/verifications/documents/${recordId}/renew`, { providerType, docField, newExpiryDate }),

  // ── Audit Logs ──
  getAuditLogs: (params?: {
    action?: string;
    adminId?: string;
    targetId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.action) query.set('action', params.action);
    if (params?.adminId) query.set('adminId', params.adminId);
    if (params?.targetId) query.set('targetId', params.targetId);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api.get<ApiResponse>(`/admin/verifications/audit-logs${qs ? `?${qs}` : ''}`);
  },

  exportAuditLogs: (params?: { action?: string; from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.action) query.set('action', params.action);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    const qs = query.toString();
    return api.get<ApiResponse>(`/admin/verifications/audit-logs/export${qs ? `?${qs}` : ''}`);
  },

  // ── Driver Search & Bulk Ops ──
  searchDriverVerifications: (params?: {
    q?: string;
    status?: string;
    providerType?: string;
    days?: number;
    sort?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.status) query.set('status', params.status);
    if (params?.providerType) query.set('providerType', params.providerType);
    if (params?.days) query.set('days', String(params.days));
    if (params?.sort) query.set('sort', params.sort);
    const qs = query.toString();
    return api.get<ApiResponse>(`/admin/verifications/drivers/search${qs ? `?${qs}` : ''}`);
  },

  bulkApproveDrivers: (items: Array<{ recordId: string; providerType: string }>) =>
    api.post<ApiResponse>('/admin/verifications/drivers/bulk-approve', { items }),

  bulkRejectDrivers: (items: Array<{ recordId: string; providerType: string }>, reason: string) =>
    api.post<ApiResponse>('/admin/verifications/drivers/bulk-reject', { items, reason }),

  bulkMessageDrivers: (items: Array<{ recordId: string; providerType: string }>, message: string) =>
    api.post<ApiResponse>('/admin/verifications/drivers/bulk-message', { items, message }),

  // ── Admin Messaging ──
  getMessageTemplates: () =>
    api.get<ApiResponse>('/admin/messages/templates'),

  createMessageTemplate: (data: { name: string; category: string; subject: string; body: string }) =>
    api.post<ApiResponse>('/admin/messages/templates', data),

  sendAdminMessage: (data: {
    userId: string;
    message: string;
    subject?: string;
    type?: 'system' | 'email' | 'push' | 'all';
    templateId?: string;
  }) =>
    api.post<ApiResponse>('/admin/messages/send', data),

  getMessageHistory: (userId: string, params?: { q?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api.get<ApiResponse>(`/admin/messages/history/${userId}${qs ? `?${qs}` : ''}`);
  },

  // ── Admin Analytics ──
  getAnalyticsDashboard: (period?: 'week' | 'month' | 'year' | 'all') =>
    api.get<ApiResponse>(`/admin/analytics/dashboard${period ? `?period=${period}` : ''}`),

  getRevenueAnalytics: (period?: 'week' | 'month' | 'year' | 'all') =>
    api.get<ApiResponse>(`/admin/analytics/revenue${period ? `?period=${period}` : ''}`),

  getVerificationAnalytics: (period?: 'week' | 'month' | 'year' | 'all') =>
    api.get<ApiResponse>(`/admin/analytics/verifications${period ? `?period=${period}` : ''}`),

  getUserAnalytics: (period?: 'week' | 'month' | 'year' | 'all') =>
    api.get<ApiResponse>(`/admin/analytics/users${period ? `?period=${period}` : ''}`),

  getQueueHealth: () =>
    api.get<ApiResponse>('/admin/analytics/queue-health'),
};

// ── Disputes API ──
export const disputesApi = {
  fileDispute: (data: {
    category: string;
    description: string;
    complaintAbout?: string;
    evidenceUrls?: string[];
    relatedServiceType?: string;
    relatedServiceId?: string;
    metadata?: Record<string, unknown>;
  }) =>
    api.post<ApiResponse>('/disputes', data),

  getMyDisputes: () =>
    api.get<ApiResponse>('/disputes/my'),

  getDispute: (id: string) =>
    api.get<ApiResponse>(`/disputes/${id}`),

  // Admin
  getAdminDisputes: (params?: { status?: string; category?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.category) query.set('category', params.category);
    if (params?.page) query.set('page', String(params.page));
    const qs = query.toString();
    return api.get<ApiResponse>(`/admin/disputes${qs ? `?${qs}` : ''}`);
  },

  getAdminDispute: (id: string) =>
    api.get<ApiResponse>(`/admin/disputes/${id}`),

  investigateDispute: (id: string, adminNotes?: string) =>
    api.post<ApiResponse>(`/admin/disputes/${id}/investigate`, { adminNotes }),

  resolveDispute: (id: string, data: {
    resolution: string;
    notes?: string;
    adminNotes?: string;
    refundAmount?: number;
    suspendReason?: string;
    providerType?: string;
    recordId?: string;
  }) =>
    api.post<ApiResponse>(`/admin/disputes/${id}/resolve`, data),
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
    passengerId: string;
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

  getReceipt: (rideId: string) =>
    api.get<ApiResponse>(`/rides/${rideId}/receipt`),
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

  // Driver updates status
  updateStatus: (requestId: string, status: string, rideId?: string) =>
    api.patch<ApiResponse>(`/taxi-bookings/${requestId}/status`, { status, rideId }),

  // Passenger cancels
  cancelRequest: (requestId: string) =>
    api.patch<ApiResponse>(`/taxi-bookings/${requestId}/cancel`),

  // Passenger: my ride history
  getMyRequests: () =>
    api.get<ApiResponse>('/taxi-bookings/my-requests'),

  // Get ride request details
  getRequest: (requestId: string) =>
    api.get<ApiResponse>(`/taxi-bookings/${requestId}`),

  getReceipt: (requestId: string) =>
    api.get<ApiResponse>(`/taxi-bookings/${requestId}/receipt`),

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

// ── Wallet API (Provider Earnings & Balance) ──
export const walletApi = {
  getWalletInfo: () =>
    api.get<ApiResponse>('/wallet'),
    
  topUp: (amount: number) =>
    api.post<ApiResponse>('/wallet/top-up', { amount }),

  updateBankDetails: (data: { accountName: string; accountNumber: string; sortCode: string }) =>
    api.post<ApiResponse>('/wallet/bank-details', data),
    
  requestWithdrawal: (amount: number) =>
    api.post<ApiResponse>('/wallet/withdraw', { amount }),
    
  getTransactions: (period?: 'day' | 'week' | 'month') =>
    api.get<ApiResponse>(`/wallet/transactions${period ? `?period=${period}` : ''}`),
};

// ── Notifications API ──
export const notificationsApi = {
  getMyNotifications: () =>
    api.get<ApiResponse>('/notifications'),
    
  markAsRead: (id: string) =>
    api.post<ApiResponse>(`/notifications/${id}/read`),
    
  markAllAsRead: () =>
    api.post<ApiResponse>('/notifications/read-all'),
};
