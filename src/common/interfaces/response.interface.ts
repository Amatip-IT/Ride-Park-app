export interface Response {
  success: boolean;
  message: string;
  data?: any;
  token?: string;
  refreshToken?: string;
  requiresOTP?: boolean;
  isVerified?: boolean;
  expiresIn?: string;
}
