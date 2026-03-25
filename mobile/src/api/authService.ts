import { apiClient } from './client';
import { ApiResponse, AuthResponse, User, RegisterRequest, LoginRequest } from '@/types';

class AuthService {
  private api = apiClient.getInstance();

  private extractErrorMessage(error: any, fallback: string): string {
    if (error?.message) return error.message;
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    return fallback;
  }

  /**
   * Register a new user
   */
  async register(userData: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await this.api.post('/users/register', userData);
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: this.extractErrorMessage(error, 'Registration failed'),
      };
    }
  }

  /**
   * Login user with email and password
   */
  async login(credentials: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await this.api.post('/users/login', credentials);
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: this.extractErrorMessage(error, 'Login failed'),
      };
    }
  }

  /**
   * Send OTP to phone number for verification
   */
  async sendPhoneOtp(phoneNumber: string): Promise<ApiResponse<{ expiresIn: string }>> {
    try {
      const response = await this.api.post('/verification/send-phone-otp', { phoneNumber });
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: this.extractErrorMessage(error, 'Failed to send OTP'),
      };
    }
  }

  /**
   * Verify phone OTP
   */
  async verifyPhoneOtp(
    phoneNumber: string,
    otp: string,
  ): Promise<ApiResponse<{ isVerified: boolean }>> {
    try {
      const response = await this.api.post('/verification/verify-phone-otp', { phoneNumber, otp });
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: this.extractErrorMessage(error, 'OTP verification failed'),
      };
    }
  }

  /**
   * Check phone verification status
   */
  async checkPhoneStatus(phoneNumber: string): Promise<ApiResponse<{ isVerified: boolean }>> {
    try {
      const response = await this.api.get(`/verification/phone-status?phoneNumber=${phoneNumber}`);
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: this.extractErrorMessage(error, 'Failed to check status'),
      };
    }
  }

  /**
   * Send OTP to email for verification
   */
  async sendEmailOtp(email: string): Promise<ApiResponse<{ expiresIn: string }>> {
    try {
      const response = await this.api.post('/verification/send-email-otp-verification', { email });
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: this.extractErrorMessage(error, 'Failed to send OTP'),
      };
    }
  }

  /**
   * Verify email OTP
   */
  async verifyEmailOtp(email: string, otp: string): Promise<ApiResponse<{ isVerified: boolean }>> {
    try {
      const response = await this.api.post('/verification/verify-email-otp-verification', { email, otp });
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: this.extractErrorMessage(error, 'OTP verification failed'),
      };
    }
  }

  /**
   * Resend OTP for login
   */
  async resendLoginOtp(email: string): Promise<ApiResponse<{ expiresIn: string }>> {
    try {
      const response = await this.api.post('/verification/resend-email-otp-login', { email });
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: this.extractErrorMessage(error, 'Failed to resend OTP'),
      };
    }
  }

  /**
   * Check email verification status
   */
  async checkEmailStatus(email: string): Promise<ApiResponse<{ isVerified: boolean }>> {
    try {
      const response = await this.api.get(`/verification/email-status?email=${email}`);
      return response.data;
    } catch (error) {
      return {
        success: false,
        message: this.extractErrorMessage(error, 'Failed to check status'),
      };
    }
  }
}

export const authService = new AuthService();
