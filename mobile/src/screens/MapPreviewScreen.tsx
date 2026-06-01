import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { AmazonMap } from '@/components/AmazonMap';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import * as Location from 'expo-location';

export function MapPreviewScreen() {
  const navigation = useNavigation<NavigationProp<any>>();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
    })();
  }, []);

  if (!location) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.electricTeal} />
        <Text style={{ color: '#fff', marginTop: 10 }}>Getting your location...</Text>
        {errorMsg && <Text style={{ color: 'red', marginTop: 10 }}>{errorMsg}</Text>}
        <TouchableOpacity style={[styles.backBtn, { marginTop: 20, backgroundColor: '#fff' }]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>
    );
  }

  // Use current location for pickup
  const pickupLat = location.lat;
  const pickupLng = location.lng;

  return (
    <View style={styles.container}>
      {/* Map takes full screen */}
      <View style={styles.mapContainer}>
        <AmazonMap
          pickupLat={pickupLat}
          pickupLng={pickupLng}
        />
      </View>

      {/* Floating header */}
      <View style={styles.floatingHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Map</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Bottom info card */}
      <View style={styles.bottomCard}>
        <View style={styles.routeInfo}>
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.routeText}>Your Current Location</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={() => navigation.navigate('TaxiBooking', {})}
          >
            <Ionicons name="navigate" size={20} color="#FFF" />
            <Text style={styles.actionBtnText}>Book a Taxi</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: COLORS.info }]} 
            onPress={() => navigation.navigate('DriverRequest', {})}
          >
            <Ionicons name="person" size={20} color="#FFF" />
            <Text style={styles.actionBtnText}>Book a Driver</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  mapContainer: {
    flex: 1,
  },
  floatingHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  routeInfo: {
    marginBottom: SPACING.lg,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: SPACING.sm,
  },
  routeText: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  routeDivider: {
    width: 2,
    height: 16,
    backgroundColor: '#E5E7EB',
    marginLeft: 5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.amber,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: 8,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
