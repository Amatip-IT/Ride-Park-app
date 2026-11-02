import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isExpoGo } from '@/utils/expoGo';
import { LatLng } from '@/utils/routing';

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
  locationLat?: number;
  locationLng?: number;
  routeCoordinates?: MapCoordinate[];
  focusToken?: number;
  followDriver?: boolean;
  showsUserLocation?: boolean;
  onLocationChange?: (point: MapCoordinate) => void;
  interactive?: boolean;
  overlayPadding?: Partial<Padding>;
}

type NativeMapComponent = React.ComponentType<LiveMapProps>;

let cachedNativeMap: NativeMapComponent | null | undefined;

function getNativeMap(): NativeMapComponent | null {
  if (cachedNativeMap !== undefined) return cachedNativeMap;
  try {
    cachedNativeMap = require('./LiveMapNative').LiveMapNative as NativeMapComponent;
  } catch {
    cachedNativeMap = null;
  }
  return cachedNativeMap;
}

function MapUnavailable() {
  return (
    <View style={styles.unavailable}>
      <Text style={styles.title}>Map unavailable in Expo Go</Text>
      <Text style={styles.body}>The live map is in the TestFlight and Android builds.</Text>
    </View>
  );
}

/**
 * Expo Go has no MapLibre native module (MLRNCameraModule).
 * The real map loads only in a dev client, TestFlight, or Android build.
 */
export function LiveMap(props: LiveMapProps) {
  if (isExpoGo()) return <MapUnavailable />;

  const NativeMap = getNativeMap();
  if (!NativeMap) return <MapUnavailable />;

  return <NativeMap {...props} />;
}

const styles = StyleSheet.create({
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#E8EEF5',
  },
  title: { color: '#111827', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  body: { color: '#4B5563', fontSize: 13, textAlign: 'center', marginTop: 6 },
});
