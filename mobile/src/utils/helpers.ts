/** Extract a user-facing message from axios/API errors */
export const getApiErrorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (err && typeof err === 'object') {
    const withMessage = err as { message?: string; response?: { data?: { message?: string | string[] } } };
    if (typeof withMessage.message === 'string' && withMessage.message.trim()) {
      return withMessage.message;
    }
    const msg = withMessage.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};

// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Phone number validation (UK format)
export const isValidUKPhone = (phone: string): boolean => {
  // UK phone format: +44 or 0, followed by numbers
  const phoneRegex = /^(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}$/;
  return phoneRegex.test(phone);
};

// Postcode validation (UK format)
export const isValidUKPostcode = (postcode: string): boolean => {
  // UK postcode format (simplified)
  const postcodeRegex = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
  return postcodeRegex.test(postcode.trim());
};

// Format postcode to standard format
export const formatPostcode = (postcode: string): string => {
  const cleaned = postcode.toUpperCase().replace(/\s/g, '');
  if (cleaned.length === 6) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
  }
  if (cleaned.length === 7) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4)}`;
  }
  return postcode.toUpperCase();
};

// Format phone number
export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('44')) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith('0')) {
    return `+44${cleaned.slice(1)}`;
  }
  return `+${cleaned}`;
};

// Format currency (GBP)
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
};

// Format date
export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

// Format time
export const formatTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Format distance (miles/km)
export const formatDistance = (meters: number, imperial = false): string => {
  if (imperial) {
    const miles = meters / 1609.34;
    return `${miles.toFixed(1)} mi`;
  }
  const kilometers = meters / 1000;
  return `${kilometers.toFixed(1)} km`;
};

// Calculate rating stars display
export const getRatingStars = (rating: number): number[] => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      stars.push(1); // Full star
    } else if (i - rating < 1 && i > Math.floor(rating)) {
      stars.push(0.5); // Half star
    } else {
      stars.push(0); // Empty star
    }
  }
  return stars;
};

// Truncate text
export const truncateText = (text: string, length: number): string => {
  if (text.length <= length) return text;
  return `${text.substring(0, length)}...`;
};

/** Human-readable booking window for provider/consumer lists */
export const formatBookingDateRange = (
  start?: string | Date | null,
  end?: string | Date | null,
): string | null => {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;

  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  };

  const sameDay = s.toDateString() === e.toDateString();
  if (sameDay) {
    return `${s.toLocaleDateString('en-GB', dateOpts)} · ${s.toLocaleTimeString('en-GB', timeOpts)} – ${e.toLocaleTimeString('en-GB', timeOpts)}`;
  }
  return `${s.toLocaleDateString('en-GB', { ...dateOpts, ...timeOpts })} → ${e.toLocaleDateString('en-GB', { ...dateOpts, ...timeOpts })}`;
};

// Calculate booking duration
export const calculateDuration = (startDate: string, endDate: string): { hours: number; days: number } => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const hours = Math.ceil(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  return { hours, days };
};

// Calculate booking price
export const calculateBookingPrice = (hourlyRate: number, startDate: string, endDate: string): number => {
  const { hours } = calculateDuration(startDate, endDate);
  return hourlyRate * Math.max(hours, 1);
};

import { Alert, Linking, Platform } from 'react-native';

/** Open native maps for navigation to a coordinate or address */
export const openMapsNavigation = (opts: {
  lat?: number;
  lng?: number;
  label?: string;
  address?: string;
}): void => {
  const { lat, lng, label = 'Destination', address } = opts;

  let url: string;
  if (lat != null && lng != null) {
    url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(label)}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    })!;
  } else if (address) {
    url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(address)}`,
      android: `geo:0,0?q=${encodeURIComponent(address)}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
    })!;
  } else {
    Alert.alert('Navigation unavailable', 'No location is available for directions.');
    return;
  }

  Linking.openURL(url).catch(() => {
    Alert.alert('Could not open maps', 'Please try again or copy the address manually.');
  });
};

/** Great-circle distance between two coordinates in miles */
export const haversineDistanceMiles = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Rough trip duration from distance (urban driving ~25 mph average) */
export const estimateDurationMinutes = (distanceMiles: number): number =>
  Math.max(5, Math.round((distanceMiles / 25) * 60));
