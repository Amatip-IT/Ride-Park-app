/** Statuses where the consumer may cancel a parking/chauffeur booking */
export const CANCELLABLE_BOOKING_STATUSES = ['pending', 'accepted'] as const;

/** Statuses where the passenger may cancel a taxi request (not after trip starts) */
export const CANCELLABLE_RIDE_STATUSES = ['searching', 'accepted', 'arrived'] as const;

export function canCancelBooking(status: string): boolean {
  return (CANCELLABLE_BOOKING_STATUSES as readonly string[]).includes(status);
}

export function canCancelRide(status: string): boolean {
  return (CANCELLABLE_RIDE_STATUSES as readonly string[]).includes(status);
}

export function getCancelBookingMessage(
  status: string,
  _quotedPrice?: number,
): string {
  if (status === 'accepted') {
    return 'The provider has reserved this service for you. Are you sure you want to cancel?';
  }
  return 'Are you sure you want to cancel this booking?';
}

export function getCancelRideMessage(status: string): string {
  if (status === 'arrived') {
    return 'Your driver has arrived. Cancel now only if you no longer need this ride.';
  }
  if (status === 'accepted') {
    return 'Your driver is on the way. Are you sure you want to cancel this ride?';
  }
  return 'Are you sure you want to cancel this ride request?';
}
