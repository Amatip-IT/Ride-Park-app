import { useMemo } from 'react';
import { computeLiveEtaMinutes, getRouteEndpoints, LatLng } from '@/utils/routing';
import { useLiveRoute } from '@/hooks/useLiveRoute';

type RideRequestLike = {
  status?: string;
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  driverEtaMinutes?: number;
};

export function useRideRouteAndEta(
  request: RideRequestLike | null | undefined,
  driverLocation: { lat: number; lng: number } | null | undefined,
) {
  const pickup = useMemo<LatLng | null>(() => {
    if (request?.pickupLat == null || request?.pickupLng == null) return null;
    return { lat: request.pickupLat, lng: request.pickupLng };
  }, [request?.pickupLat, request?.pickupLng]);

  const destination = useMemo<LatLng | null>(() => {
    if (request?.destinationLat == null || request?.destinationLng == null) return null;
    return { lat: request.destinationLat, lng: request.destinationLng };
  }, [request?.destinationLat, request?.destinationLng]);

  const driver = useMemo<LatLng | null>(() => {
    if (driverLocation?.lat == null || driverLocation?.lng == null) return null;
    return { lat: driverLocation.lat, lng: driverLocation.lng };
  }, [driverLocation?.lat, driverLocation?.lng]);

  const endpoints = useMemo(
    () => getRouteEndpoints(pickup, destination, driver, request?.status),
    [pickup, destination, driver, request?.status],
  );

  const driverLeg = !!driver && endpoints?.from === driver;
  const {
    coordinates: routeCoordinates,
    remainingMeters,
    etaMinutes: routeEtaMinutes,
  } = useLiveRoute(
    endpoints?.from || null,
    endpoints?.to || null,
    `${request?.status}:${driverLeg ? 'driver' : 'overview'}`,
    driverLeg,
  );

  const liveEtaMinutes = useMemo(() => {
    if (!request) return null;

    const live =
      driver &&
      (request.status === 'accepted' ||
        request.status === 'arrived' ||
        request.status === 'in_progress');

    if (live) {
      if (request.status === 'arrived') return 0;
      if (driverLeg && routeEtaMinutes != null) return routeEtaMinutes;

      const target = request.status === 'in_progress' ? destination : pickup;
      if (target?.lat) {
        return computeLiveEtaMinutes(driver!, target);
      }
    }

    if (request.status === 'accepted' && request.driverEtaMinutes) {
      return request.driverEtaMinutes;
    }

    return null;
  }, [request?.status, request?.driverEtaMinutes, driver, pickup, destination, driverLeg, routeEtaMinutes]);

  const etaLabel = useMemo(() => {
    if (liveEtaMinutes == null) return null;
    if (request?.status === 'arrived') return 'Driver is at the pickup';
    if (request?.status === 'in_progress') {
      return `~${liveEtaMinutes} min to destination`;
    }
    if (request?.status === 'accepted') {
      return `~${liveEtaMinutes} min to pickup`;
    }
    return `~${liveEtaMinutes} min`;
  }, [liveEtaMinutes, request?.status]);

  return { routeCoordinates, liveEtaMinutes, etaLabel, remainingMeters };
}
