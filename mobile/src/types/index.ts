// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  expiresIn?: string;
  url?: string;
}

// User Types
export type UserRole =
  | 'user'
  | 'admin'
  | 'driver'
  | 'taxi_driver'
  | 'parking_provider';

export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  postCode?: string;
  address?: {
    county?: string;
    town?: string;
    country?: string;
  };
  taxiType?: string;
  termsAccepted?: boolean;
  profileImageUrl?: string;
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
  otp?: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneNumber: string;
  password: string;
  role: UserRole;
  postCode?: string;
  address?: {
    street?: string;
    county?: string;
    town?: string;
    country?: string;
  };
  idType?: 'driver_license' | 'national_identity_card' | 'passport';
  taxiType?: 'Normal car' | 'Mini Bus' | 'Bus';
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  plateNumber?: string;
  termsAccepted: boolean;
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

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'charged'
  | 'payment_failed';
export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'awaiting_payment'
  | 'completed';
export type TaxiRequestStatus =
  | 'searching'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'awaiting_payment'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface UserSummary {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
}

export interface RideRecord {
  _id: string;
  status:
    | 'pending'
    | 'in_progress'
    | 'awaiting_payment'
    | 'completed'
    | 'cancelled';
  paymentStatus: PaymentStatus;
  paymentIntentId?: string;
  passengerConfirmedAt?: string;
  totalCost?: number;
  passenger?: string | UserSummary;
  driver?: string | UserSummary;
}

export interface BookingRequest {
  _id: string;
  requester?: string | UserSummary;
  provider?: string | UserSummary;
  serviceType: 'parking' | 'driver' | 'taxi';
  serviceId?: string;
  serviceName?: string;
  startDate?: string;
  endDate?: string;
  quotedPrice?: number;
  pricingUnit?: string;
  responseMessage?: string;
  passengerConfirmedAt?: string;
  paymentStatus: PaymentStatus;
  paymentIntentId?: string;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaxiRideRequest {
  _id: string;
  status: TaxiRequestStatus;
  passenger?: string | UserSummary;
  acceptedDriver?: string | UserSummary;
  ride?: string | RideRecord;
  passengerConfirmedAt?: string;
  estimatedCost?: number;
  pickupAddress?: string;
  pickupPostcode?: string;
  destinationAddress?: string;
  destinationPostcode?: string;
  driverVehicle?: {
    make?: string;
    model?: string;
    color?: string;
    plateNumber?: string;
  };
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
