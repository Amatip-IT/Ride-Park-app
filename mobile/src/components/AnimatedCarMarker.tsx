import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { bearingBetween, distanceMeters, LatLng } from '@/utils/routing';

type Props = {
  coordinate: LatLng;
  /** Heading in degrees from GPS; falls back to direction of travel when missing. */
  heading?: number;
};

const MIN_GLIDE_MS = 600;
const MAX_GLIDE_MS = 3000;
const TURN_MS = 700;
/** Jumps larger than this (GPS reset, app resume) snap instead of gliding across the map. */
const TELEPORT_METERS = 1500;

function shortestTurn(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Car icon that glides between GPS fixes at constant speed and turns smoothly,
 * so 2-second location updates look like continuous movement.
 * The map is kept north-up, so rotating the view by the heading is enough.
 */
export function AnimatedCarMarker({ coordinate, heading }: Props) {
  const [position, setPosition] = useState<LatLng>(coordinate);
  const [rotation, setRotation] = useState<number>(heading || 0);

  const positionRef = useRef(position);
  const rotationRef = useRef(rotation);
  const lastFixAtRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = positionRef.current;
    const to = coordinate;
    const moved = distanceMeters(from, to);
    const now = Date.now();
    const sinceLastFix = lastFixAtRef.current ? now - lastFixAtRef.current : MIN_GLIDE_MS;
    lastFixAtRef.current = now;

    const fromRotation = rotationRef.current;
    const targetRotation =
      heading != null && heading > 0
        ? heading
        : moved > 3
          ? bearingBetween(from, to)
          : fromRotation;
    const turn = shortestTurn(fromRotation, targetRotation);

    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);

    if (moved > TELEPORT_METERS) {
      positionRef.current = to;
      rotationRef.current = targetRotation;
      setPosition(to);
      setRotation(targetRotation);
      return;
    }

    // Glide for roughly the gap between fixes so the car arrives as the next fix lands
    const glideMs = Math.min(MAX_GLIDE_MS, Math.max(MIN_GLIDE_MS, sinceLastFix));
    const start = performance.now();

    const step = (time: number) => {
      const t = Math.min(1, (time - start) / glideMs);
      const turnT = Math.min(1, (time - start) / TURN_MS);
      const easedTurn = 1 - (1 - turnT) ** 3;

      const next = {
        lat: from.lat + (to.lat - from.lat) * t,
        lng: from.lng + (to.lng - from.lng) * t,
      };
      const nextRotation = (fromRotation + turn * easedTurn + 360) % 360;

      positionRef.current = next;
      rotationRef.current = nextRotation;
      setPosition(next);
      setRotation(nextRotation);

      if (t < 1 || turnT < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [coordinate.lat, coordinate.lng, heading]);

  return (
    <Marker id="live-car" lngLat={[position.lng, position.lat]} anchor="center">
      <View style={[styles.car, { transform: [{ rotate: `${rotation}deg` }] }]} collapsable={false}>
        <View style={styles.windscreen} />
        <View style={styles.roof} />
        <View style={styles.rearScreen} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  // Top-down car drawn with views; nose points up (north) at rotation 0
  car: {
    width: 22,
    height: 40,
    borderRadius: 7,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 3,
      },
      default: { elevation: 4 },
    }),
  },
  windscreen: {
    position: 'absolute',
    top: 6,
    width: 14,
    height: 7,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: '#93C5FD',
  },
  roof: {
    position: 'absolute',
    top: 14,
    width: 14,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#374151',
  },
  rearScreen: {
    position: 'absolute',
    bottom: 5,
    width: 12,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#93C5FD',
  },
});
