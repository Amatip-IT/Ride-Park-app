import { useState } from 'react';
import { authService } from '@/api/authService';
import { useAuthStore } from '@/store/authStore';

interface UsePhoneOtpState {
  loading: boolean;
  error: string | null;
  expiresIn: string | null;
  remainingTime: number; // seconds
}

export const usePhoneOtp = () => {
  const [state, setState] = useState<UsePhoneOtpState>({
    loading: false,
    error: null,
    expiresIn: null,
    remainingTime: 0,
  });

  const [otpAttempts, setOtpAttempts] = useState(0);

  /**
   * Send OTP to phone number
   */
  const sendOtp = async (phoneNumber: string): Promise<boolean> => {
    try {
      setState({ loading: true, error: null, expiresIn: null, remainingTime: 0 });

      const response = await authService.sendPhoneOtp(phoneNumber);

      if (!response.success) {
        setState({
          loading: false,
          error: response.message || 'Failed to send OTP',
          expiresIn: null,
          remainingTime: 0,
        });
        return false;
      }

      setState({
        loading: false,
        error: null,
        expiresIn: response.data?.expiresIn || '10 minutes',
        remainingTime: 600, // 10 minutes in seconds
      });

      // Start countdown timer
      startCountdown();
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      setState({
        loading: false,
        error: errorMsg,
        expiresIn: null,
        remainingTime: 0,
      });
      return false;
    }
  };

  /**
   * Verify OTP code
   */
  const verifyOtp = async (phoneNumber: string, otp: string): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, loading: true }));

      // Limit OTP attempts to 3
      if (otpAttempts >= 3) {
        setState({
          loading: false,
          error: 'Maximum OTP attempts exceeded. Please request a new OTP.',
          expiresIn: state.expiresIn,
          remainingTime: state.remainingTime,
        });
        return false;
      }

      const response = await authService.verifyPhoneOtp(phoneNumber, otp);

      if (!response.success) {
        setOtpAttempts(otpAttempts + 1);
        setState({
          loading: false,
          error: response.message || 'Invalid OTP',
          expiresIn: state.expiresIn,
          remainingTime: state.remainingTime,
        });
        return false;
      }

      setState({
        loading: false,
        error: null,
        expiresIn: null,
        remainingTime: 0,
      });
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to verify OTP';
      setState({
        loading: false,
        error: errorMsg,
        expiresIn: state.expiresIn,
        remainingTime: state.remainingTime,
      });
      return false;
    }
  };

  /**
   * Start countdown timer for OTP expiry
   */
  const startCountdown = () => {
    let seconds = 600; // 10 minutes
    const interval = setInterval(() => {
      seconds -= 1;
      setState((prev) => ({
        ...prev,
        remainingTime: seconds,
      }));

      if (seconds <= 0) {
        clearInterval(interval);
        setState((prev) => ({
          ...prev,
          error: 'OTP expired. Please request a new one.',
          expiresIn: null,
        }));
      }
    }, 1000);
  };

  /**
   * Format remaining time as MM:SS
   */
  const formatTime = (): string => {
    const minutes = Math.floor(state.remainingTime / 60);
    const seconds = state.remainingTime % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  /**
   * Clear error message
   */
  const clearError = () => {
    setState((prev) => ({ ...prev, error: null }));
  };

  return {
    ...state,
    sendOtp,
    verifyOtp,
    formatTime,
    clearError,
    otpAttempts,
  };
};

interface UseEmailOtpState {
  loading: boolean;
  error: string | null;
  expiresIn: string | null;
  remainingTime: number;
}

export const useEmailOtp = () => {
  const [state, setState] = useState<UseEmailOtpState>({
    loading: false,
    error: null,
    expiresIn: null,
    remainingTime: 0,
  });

  const [otpAttempts, setOtpAttempts] = useState(0);

  /**
   * Send OTP to email
   */
  const sendOtp = async (email: string): Promise<boolean> => {
    try {
      setState({ loading: true, error: null, expiresIn: null, remainingTime: 0 });

      const response = await authService.sendEmailOtp(email);

      if (!response.success) {
        setState({
          loading: false,
          error: response.message || 'Failed to send OTP',
          expiresIn: null,
          remainingTime: 0,
        });
        return false;
      }

      setState({
        loading: false,
        error: null,
        expiresIn: response.data?.expiresIn || '10 minutes',
        remainingTime: 600,
      });

      startCountdown();
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      setState({
        loading: false,
        error: errorMsg,
        expiresIn: null,
        remainingTime: 0,
      });
      return false;
    }
  };

  /**
   * Send Login OTP to email
   */
  const sendLoginOtp = async (email: string): Promise<boolean> => {
    try {
      setState({ loading: true, error: null, expiresIn: null, remainingTime: 0 });

      const response = await authService.resendLoginOtp(email);

      if (!response.success) {
        setState({
          loading: false,
          error: response.message || 'Failed to send login OTP',
          expiresIn: null,
          remainingTime: 0,
        });
        return false;
      }

      setState({
        loading: false,
        error: null,
        expiresIn: response.data?.expiresIn || '10 minutes',
        remainingTime: 600,
      });

      startCountdown();
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      setState({
        loading: false,
        error: errorMsg,
        expiresIn: null,
        remainingTime: 0,
      });
      return false;
    }
  };

  /**
   * Verify email OTP
   */
  const verifyOtp = async (email: string, otp: string): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, loading: true }));

      if (otpAttempts >= 3) {
        setState({
          loading: false,
          error: 'Maximum OTP attempts exceeded. Please request a new OTP.',
          expiresIn: state.expiresIn,
          remainingTime: state.remainingTime,
        });
        return false;
      }

      const response = await authService.verifyEmailOtp(email, otp);

      if (!response.success) {
        setOtpAttempts(otpAttempts + 1);
        setState({
          loading: false,
          error: response.message || 'Invalid OTP',
          expiresIn: state.expiresIn,
          remainingTime: state.remainingTime,
        });
        return false;
      }

      setState({
        loading: false,
        error: null,
        expiresIn: null,
        remainingTime: 0,
      });
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to verify OTP';
      setState({
        loading: false,
        error: errorMsg,
        expiresIn: state.expiresIn,
        remainingTime: state.remainingTime,
      });
      return false;
    }
  };

  /**
   * Start countdown timer
   */
  const startCountdown = () => {
    let seconds = 600;
    const interval = setInterval(() => {
      seconds -= 1;
      setState((prev) => ({
        ...prev,
        remainingTime: seconds,
      }));

      if (seconds <= 0) {
        clearInterval(interval);
        setState((prev) => ({
          ...prev,
          error: 'OTP expired. Please request a new one.',
          expiresIn: null,
        }));
      }
    }, 1000);
  };

  /**
   * Format remaining time as MM:SS
   */
  const formatTime = (): string => {
    const minutes = Math.floor(state.remainingTime / 60);
    const seconds = state.remainingTime % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  /**
   * Resend OTP with rate limiting
   */
  const resendOtp = async (email: string): Promise<boolean> => {
    return sendOtp(email);
  };

  const clearError = () => {
    setState((prev) => ({ ...prev, error: null }));
  };

  return {
    ...state,
    sendOtp,
    sendLoginOtp,
    verifyOtp,
    resendOtp,
    formatTime,
    clearError,
    otpAttempts,
  };
};
