export interface Response {
  success: boolean;
  message: string;
  data?: any;
  token?: string;
  refreshToken?: string;
  requiresOTP?: boolean;
  isVerified?: boolean;
  expiresIn?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    what3words?: string;
    nearestPlace?: string;
    country?: string;
    coordinates?: { lat: number; lng: number };
  };
}
