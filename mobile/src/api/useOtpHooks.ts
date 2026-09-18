import { useState, useRef, useEffect } from 'react';
import { authService } from '@/api/authService';

const OTP_EXPIRY_SECONDS = 600;
const RESEND_COOLDOWN_SECONDS = 60;

const parseWaitSeconds = (message?: string, retryAfter?: number): number => {
  if (typeof retryAfter === 'number' && retryAfter > 0) {
    return Math.ceil(retryAfter);
  }
  const match = message?.match(/wait (\d+) seconds/i);
  return match ? Number(match[1]) : 0;
};

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
  resendCooldown: number;
}

const formatClock = (totalSeconds: number): string => {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const seconds = Math.max(0, totalSeconds) % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const useEmailOtp = () => {
  const [state, setState] = useState<UseEmailOtpState>({
    loading: false,
    error: null,
    expiresIn: null,
    remainingTime: 0,
    resendCooldown: 0,
  });

  const [otpAttempts, setOtpAttempts] = useState(0);
  const expiryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearExpiryTimer = () => {
    if (expiryIntervalRef.current) {
      clearInterval(expiryIntervalRef.current);
      expiryIntervalRef.current = null;
    }
  };

  const clearResendTimer = () => {
    if (resendIntervalRef.current) {
      clearInterval(resendIntervalRef.current);
      resendIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearExpiryTimer();
      clearResendTimer();
    };
  }, []);

  const startResendCooldown = (seconds: number) => {
    clearResendTimer();
    let remaining = Math.max(0, seconds);
    setState((prev) => ({ ...prev, resendCooldown: remaining }));
    if (remaining <= 0) return;

    resendIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setState((prev) => ({ ...prev, resendCooldown: Math.max(0, remaining) }));
      if (remaining <= 0) {
        clearResendTimer();
      }
    }, 1000);
  };

  const startCountdown = () => {
    clearExpiryTimer();
    let seconds = OTP_EXPIRY_SECONDS;
    expiryIntervalRef.current = setInterval(() => {
      seconds -= 1;
      setState((prev) => ({
        ...prev,
        remainingTime: seconds,
      }));

      if (seconds <= 0) {
        clearExpiryTimer();
        setState((prev) => ({
          ...prev,
          error: 'OTP expired. Please request a new one.',
          expiresIn: null,
        }));
      }
    }, 1000);
  };

  const applySuccessfulSend = (expiresIn?: string, retryAfter?: number) => {
    setOtpAttempts(0);
    setState({
      loading: false,
      error: null,
      expiresIn: expiresIn || '10 minutes',
      remainingTime: OTP_EXPIRY_SECONDS,
      resendCooldown: retryAfter || RESEND_COOLDOWN_SECONDS,
    });
    startCountdown();
    startResendCooldown(retryAfter || RESEND_COOLDOWN_SECONDS);
  };

  const applyFailedSend = (errorMsg: string, retryAfter?: number) => {
    const cooldown = parseWaitSeconds(errorMsg, retryAfter);
    setState((prev) => ({
      ...prev,
      loading: false,
      error: errorMsg,
      resendCooldown: cooldown || prev.resendCooldown,
    }));
    if (cooldown > 0) {
      startResendCooldown(cooldown);
    }
  };

  /**
   * Send OTP to email
   */
  const sendOtp = async (email: string): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const response = await authService.sendEmailOtp(email);

      if (!response.success) {
        applyFailedSend(
          response.message || 'Failed to send OTP',
          response.retryAfter,
        );
        return false;
      }

      applySuccessfulSend(
        response.expiresIn || response.data?.expiresIn,
        response.retryAfter || RESEND_COOLDOWN_SECONDS,
      );
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      applyFailedSend(errorMsg, (err as { retryAfter?: number })?.retryAfter);
      return false;
    }
  };

  /**
   * Send Login OTP to email
   */
  const sendLoginOtp = async (email: string): Promise<boolean> => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const response = await authService.resendLoginOtp(email);

      if (!response.success) {
        applyFailedSend(
          response.message || 'Failed to send login OTP',
          response.retryAfter,
        );
        return false;
      }

      applySuccessfulSend(
        response.expiresIn || response.data?.expiresIn,
        response.retryAfter || RESEND_COOLDOWN_SECONDS,
      );
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      applyFailedSend(errorMsg, (err as { retryAfter?: number })?.retryAfter);
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
        setState((prev) => ({
          ...prev,
          loading: false,
          error: 'Maximum OTP attempts exceeded. Please request a new OTP.',
        }));
        return false;
      }

      const response = await authService.verifyEmailOtp(email, otp);

      if (!response.success) {
        setOtpAttempts(otpAttempts + 1);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: response.message || 'Invalid OTP',
        }));
        return false;
      }

      clearExpiryTimer();
      clearResendTimer();
      setState({
        loading: false,
        error: null,
        expiresIn: null,
        remainingTime: 0,
        resendCooldown: 0,
      });
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to verify OTP';
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMsg,
      }));
      return false;
    }
  };

  const formatTime = (): string => formatClock(state.remainingTime);

  const formatResendTime = (): string => formatClock(state.resendCooldown);

  /**
   * Resend OTP with rate limiting
   */
  const resendOtp = async (email: string): Promise<boolean> => {
    if (state.resendCooldown > 0) return false;
    return sendOtp(email);
  };

  const beginCooldown = (retryAfter = RESEND_COOLDOWN_SECONDS) => {
    setState((prev) => ({
      ...prev,
      error: null,
      expiresIn: prev.expiresIn || '10 minutes',
      remainingTime: prev.remainingTime || OTP_EXPIRY_SECONDS,
      resendCooldown: retryAfter,
    }));
    if (!expiryIntervalRef.current) {
      startCountdown();
    }
    startResendCooldown(retryAfter);
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
    formatResendTime,
    beginCooldown,
    clearError,
    otpAttempts,
  };
};
