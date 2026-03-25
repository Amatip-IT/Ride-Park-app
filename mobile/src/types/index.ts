// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  expiresIn?: string;
}

// User Types
export type UserRole = 'user' | 'admin' | 'driver' | 'taxi_driver' | 'parking_provider';

export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  isVerified: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationStatus {
  email: boolean;
  phone: boolean;
  identity: boolean;
  taxi: boolean;
  parking: boolean;
}

// Auth Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneNumber: string;
  password: string;
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface OtpVerificationRequest {
  email?: string;
  phoneNumber?: string;
  otp: string;
}

// Verification Types
export interface IdentitySessionRequest {
  email: string;
}

export interface IdentitySessionResponse {
  clientSecret: string;
  sessionId: string;
}

// Parking Types
export interface ParkingSpace {
  _id: string;
  providerId: string;
  name: string;
  description: string;
  postcode: string;
  hourlyRate: number;
  dailyRate: number;
  photos: string[];
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BookingRequest {
  _id: string;
  userId: string;
  serviceType: 'parking' | 'driver' | 'taxi';
  serviceId: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

// Driver Types
export interface Driver {
  _id: string;
  userId: string;
  dvlaVerified: boolean;
  hourlyRate: number;
  bio: string;
  experience: string;
  isOnline: boolean;
}

// Taxi Driver Types
export interface TaxiDriver {
  _id: string;
  userId: string;
  vehicleRegistration: string;
  vehicleMake: string;
  vehicleModel: string;
  motVerified: boolean;
  dvlaVerified: boolean;
  baseFare: number;
  perMileRate: number;
  zone: string;
  isOnline: boolean;
}

// Error Types
export interface ApiError {
  message: string;
  status: number;
  code?: string;
}
