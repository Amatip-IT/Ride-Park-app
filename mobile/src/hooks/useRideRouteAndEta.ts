import { useState, useEffect, useMemo } from 'react';
import {
  computeLiveEtaMinutes,
  fetchDrivingRoute,
  getRouteEndpoints,
  LatLng,
} from '@/utils/routing';

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
  const [routeCoordinates, setRouteCoordinates] = useState<LatLng[]>([]);

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

  const routeEndpoints = useMemo(
    () => getRouteEndpoints(pickup, destination, driver, request?.status),
    [pickup, destination, driver, request?.status],
  );

  useEffect(() => {
    let cancelled = false;

    const loadRoute = async () => {
      if (!routeEndpoints) {
        setRouteCoordinates([]);
        return;
      }

      const coords = await fetchDrivingRoute(routeEndpoints.from, routeEndpoints.to);
      if (!cancelled) {
        setRouteCoordinates(coords);
      }
    };

    loadRoute();
    return () => {
      cancelled = true;
    };
  }, [
    routeEndpoints?.from.lat,
    routeEndpoints?.from.lng,
    routeEndpoints?.to.lat,
    routeEndpoints?.to.lng,
  ]);

  const liveEtaMinutes = useMemo(() => {
    if (!request) return null;

    if (
      driver &&
      (request.status === 'accepted' ||
        request.status === 'arrived' ||
        request.status === 'in_progress')
    ) {
      const target =
        request.status === 'in_progress' ? destination : pickup;
      if (target?.lat) {
        return computeLiveEtaMinutes(driver, target);
      }
    }

    if (request.status === 'accepted' && request.driverEtaMinutes) {
      return request.driverEtaMinutes;
    }

    return null;
  }, [
    request?.status,
    request?.driverEtaMinutes,
    driver,
    pickup,
    destination,
  ]);

  const etaLabel = useMemo(() => {
    if (liveEtaMinutes == null) return null;
    if (request?.status === 'in_progress') {
      return `~${liveEtaMinutes} min to destination`;
    }
    if (request?.status === 'accepted' || request?.status === 'arrived') {
      return `~${liveEtaMinutes} min to pickup`;
    }
    return `~${liveEtaMinutes} min`;
  }, [liveEtaMinutes, request?.status]);

  return { routeCoordinates, liveEtaMinutes, etaLabel };
}
