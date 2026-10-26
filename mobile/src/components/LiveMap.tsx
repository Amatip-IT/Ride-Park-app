import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  type MapRef,
  NativeUserLocation,
  ViewAnnotation,
} from '@maplibre/maplibre-react-native';
import { fetchDrivingRoute, LatLng } from '@/utils/routing';
import { AnimatedCarMarker } from '@/components/AnimatedCarMarker';

export type MapCoordinate = LatLng;

type Padding = { top: number; bottom: number; left: number; right: number };

export interface LiveMapProps {
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  driverLat?: number;
  driverLng?: number;
  driverRotation?: number;
  /** Single-location pin (e.g. parking space) */
  locationLat?: number;
  locationLng?: number;
  /** Driving route polyline (ordered lat/lng points). Fetched automatically when omitted. */
  routeCoordinates?: MapCoordinate[];
  /** Increment to re-fit the map to the current route / markers. */
  focusToken?: number;
  /** Keep the car in view as it moves, until the user pans the map themselves. */
  followDriver?: boolean;
  /** Show the device's own blue location dot. */
  showsUserLocation?: boolean;
  /** Makes the parking pin draggable (and tap-to-place); called with the new spot. */
  onLocationChange?: (point: MapCoordinate) => void;
  /** Static preview: no panning/zooming (e.g. inside a scrolling card). */
  interactive?: boolean;
  /** Space covered by overlays (bottom sheet, header) so fitting keeps markers visible. */
  overlayPadding?: Partial<Padding>;
}

const AWS_LOCATION_KEY = process.env.EXPO_PUBLIC_AWS_LOCATION_KEY;
const AWS_REGION = process.env.EXPO_PUBLIC_AWS_REGION || 'us-east-1';
const LONDON = { lat: 51.5072, lng: -0.1276 };
const PIN_ZOOM = 16;

/** Amazon Location "Standard" style; OpenStreetMap raster only as a key-less dev fallback. */
const MAP_STYLE = AWS_LOCATION_KEY
  ? `https://maps.geo.${AWS_REGION}.amazonaws.com/v2/styles/Standard/descriptor?key=${AWS_LOCATION_KEY}&color-scheme=Light`
  : {
      version: 8 as const,
      sources: {
        osm: {
          type: 'raster' as const,
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
          maxzoom: 19,
        },
      },
      layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
    };

function isPoint(lat?: number, lng?: number): boolean {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !!lat && !!lng;
}

function boundsOf(points: LatLng[]): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  return [west, south, east, north];
}

export function LiveMap({
  pickupLat,
  pickupLng,
  destinationLat,
  destinationLng,
  driverLat,
  driverLng,
  driverRotation,
  locationLat,
  locationLng,
  routeCoordinates,
  focusToken = 0,
  followDriver = false,
  showsUserLocation = false,
  onLocationChange,
  interactive = true,
  overlayPadding,
}: LiveMapProps) {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [fetchedRoute, setFetchedRoute] = useState<LatLng[]>([]);
  const userMovedMapRef = useRef(false);
  const pinMovedByUserRef = useRef(false);
  const lastFollowCheckRef = useRef(0);

  const pickup = isPoint(pickupLat, pickupLng) ? { lat: pickupLat!, lng: pickupLng! } : null;
  const destination = isPoint(destinationLat, destinationLng)
    ? { lat: destinationLat!, lng: destinationLng! }
    : null;
  const driver = isPoint(driverLat, driverLng) ? { lat: driverLat!, lng: driverLng! } : null;
  const location = isPoint(locationLat, locationLng)
    ? { lat: locationLat!, lng: locationLng! }
    : null;

  const padding = useMemo<Padding>(
    () => ({
      top: 60 + (overlayPadding?.top || 0),
      bottom: 60 + (overlayPadding?.bottom || 0),
      left: 40 + (overlayPadding?.left || 0),
      right: 40 + (overlayPadding?.right || 0),
    }),
    [overlayPadding?.top, overlayPadding?.bottom, overlayPadding?.left, overlayPadding?.right],
  );

  // Fetch a road route only when the caller didn't supply one
  const callerSuppliesRoute = routeCoordinates !== undefined;
  useEffect(() => {
    if (callerSuppliesRoute || !pickup || !destination) {
      setFetchedRoute([]);
      return;
    }
    let cancelled = false;
    fetchDrivingRoute(pickup, destination).then((coords) => {
      if (!cancelled) setFetchedRoute(coords);
    });
    return () => {
      cancelled = true;
    };
  }, [callerSuppliesRoute, pickupLat, pickupLng, destinationLat, destinationLng]);

  const route = (callerSuppliesRoute ? routeCoordinates : fetchedRoute) || [];

  const routeGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: 'FeatureCollection',
      features:
        route.length >= 2
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: route.map((p) => [p.lng, p.lat]) },
              },
            ]
          : [],
    }),
    [route],
  );

  const fitPoints = useCallback(
    (points: LatLng[], duration = 700) => {
      const camera = cameraRef.current;
      if (!camera || points.length === 0) return;
      if (points.length === 1) {
        camera.easeTo({ center: [points[0].lng, points[0].lat], zoom: PIN_ZOOM, padding, duration });
        return;
      }
      camera.fitBounds(boundsOf(points), { padding, duration, easing: 'ease' });
    },
    [padding],
  );

  const fitAll = useCallback(() => {
    fitPoints([
      ...(route.length >= 2 ? route : []),
      ...[pickup, destination, driver, location].filter((p): p is LatLng => !!p),
    ]);
  }, [fitPoints, route, pickupLat, pickupLng, destinationLat, destinationLng, driverLat, driverLng, locationLat, locationLng]);

  // Re-fit when the journey's shape changes (new endpoints, route arrives), not on every car tick
  const shapeKey = [
    pickupLat, pickupLng, destinationLat, destinationLng, locationLat, locationLng,
    route.length >= 2 ? 'route' : 'no-route',
    driver ? 'driver' : 'no-driver',
  ].join('|');

  useEffect(() => {
    if (!mapReady) return;
    if (pinMovedByUserRef.current) {
      // Keep the provider's zoom while they fine-tune the pin
      pinMovedByUserRef.current = false;
      return;
    }
    userMovedMapRef.current = false;
    fitAll();
  }, [mapReady, shapeKey]);

  useEffect(() => {
    if (!mapReady || !focusToken) return;
    userMovedMapRef.current = false;
    fitAll();
  }, [focusToken]);

  // Follow the car: only move the camera when it nears the edge of the view
  useEffect(() => {
    if (!followDriver || !driver || !mapReady || userMovedMapRef.current) return;
    const now = Date.now();
    if (now - lastFollowCheckRef.current < 2000) return;
    lastFollowCheckRef.current = now;

    mapRef.current
      ?.getBounds()
      .then(([west, south, east, north]) => {
        const latSpan = north - south;
        const lngSpan = east - west;
        const margin = 0.2;
        const inside =
          driver.lat < north - latSpan * margin &&
          driver.lat > south + latSpan * margin &&
          driver.lng < east - lngSpan * margin &&
          driver.lng > west + lngSpan * margin;
        if (!inside) {
          const target = route.length >= 2 ? route[route.length - 1] : destination || pickup;
          fitPoints([driver, ...(target ? [target] : [])], 900);
        }
      })
      .catch(() => {});
  }, [followDriver, driverLat, driverLng, mapReady]);

  const handlePinMove = useCallback(
    (lng: number, lat: number) => {
      pinMovedByUserRef.current = true;
      onLocationChange?.({ lat, lng });
    },
    [onLocationChange],
  );

  const initialCenter = driver || location || pickup || destination || LONDON;

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        doubleTapHoldZoom={interactive}
        // North-up keeps the car icon's rotation equal to its compass heading
        touchRotate={false}
        touchPitch={false}
        compass={false}
        logo
        logoPosition={{ bottom: 8 + (overlayPadding?.bottom || 0), left: 8 }}
        attributionPosition={{ bottom: 8 + (overlayPadding?.bottom || 0), right: 8 }}
        onDidFinishLoadingMap={() => setMapReady(true)}
        onRegionWillChange={(e) => {
          if (e.nativeEvent.userInteraction) userMovedMapRef.current = true;
        }}
        onPress={
          onLocationChange
            ? (e) => handlePinMove(e.nativeEvent.lngLat[0], e.nativeEvent.lngLat[1])
            : undefined
        }
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: [initialCenter.lng, initialCenter.lat],
            zoom: location || driver ? 15 : 12,
          }}
        />

        <GeoJSONSource id="live-route" data={routeGeoJson}>
          <Layer
            id="live-route-casing"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-color': '#2563EB', 'line-opacity': 0.25, 'line-width': 11 }}
          />
          <Layer
            id="live-route-line"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-color': '#2563EB', 'line-width': 5 }}
          />
        </GeoJSONSource>

        {showsUserLocation && <NativeUserLocation mode="heading" />}

        {pickup && (
          <ViewAnnotation id="pickup" lngLat={[pickup.lng, pickup.lat]} anchor="center">
            <View style={[styles.dot, styles.pickupDot]} collapsable={false} />
          </ViewAnnotation>
        )}

        {destination && (
          <ViewAnnotation id="destination" lngLat={[destination.lng, destination.lat]} anchor="center">
            <View style={[styles.dot, styles.destinationDot]} collapsable={false} />
          </ViewAnnotation>
        )}

        {location && (
          <ViewAnnotation
            id="parking"
            lngLat={[location.lng, location.lat]}
            anchor="bottom"
            draggable={!!onLocationChange}
            onDragEnd={(e) => handlePinMove(e.nativeEvent.lngLat[0], e.nativeEvent.lngLat[1])}
          >
            <View style={styles.parkingPin} collapsable={false}>
              <View style={styles.parkingBadge}>
                <Text style={styles.parkingText}>P</Text>
              </View>
              <View style={styles.parkingTail} />
            </View>
          </ViewAnnotation>
        )}

        {driver && <AnimatedCarMarker coordinate={driver} heading={driverRotation} />}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#E8EEF5',
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  pickupDot: { backgroundColor: '#10B981' },
  destinationDot: { backgroundColor: '#EF4444' },
  parkingPin: { alignItems: 'center' },
  parkingBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2563EB',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  parkingText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  parkingTail: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#2563EB',
  },
});
