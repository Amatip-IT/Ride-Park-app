import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { taxiBookingsApi } from '@/api';
import { AmazonMap } from '@/components/AmazonMap';

type ParamList = {
  PassengerTrackingScreen: { requestId: string };
};

export function PassengerTrackingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'PassengerTrackingScreen'>>();
  const { requestId } = route.params;

  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchRequest = async () => {
    try {
      const res = await taxiBookingsApi.getRequest(requestId);
      if (res.data?.success) {
        setRequest(res.data.data);
      }
    } catch (err) {
      console.log('Failed to fetch request:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequest();
  }, [requestId]);

  // Poll for status updates every 10 seconds
  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(fetchRequest, 10000);
      return () => clearInterval(interval);
    }, [requestId])
  );

  const getStatusText = () => {
    if (!request) return '';
    switch (request.status) {
      case 'accepted': return '🚗 Driver is on the way';
      case 'arrived': return '📍 Driver has arrived';
      case 'in_progress': return '🛣️ Ride in progress';
      case 'completed': return '✅ Ride completed';
      default: return '🔍 Finding a driver...';
    }
  };

  const getStatusColor = () => {
    if (!request) return COLORS.textSecondary;
    switch (request.status) {
      case 'accepted': return COLORS.info;
      case 'arrived': return COLORS.amber;
      case 'in_progress': return COLORS.success;
      case 'completed': return COLORS.electricTeal;
      default: return COLORS.textSecondary;
    }
  };

  const callDriver = () => {
    // If we have the driver's phone, use it
    if (request?.acceptedDriver?.phoneNumber) {
      Linking.openURL(`tel:${request.acceptedDriver.phoneNumber}`);
    } else {
      Alert.alert('Unavailable', 'Driver contact is not available yet.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={{ color: COLORS.textPrimary }}>Ride request not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Live Map */}
      <View style={styles.mapContainer}>
        <AmazonMap
          pickupLat={request.pickupLat}
          pickupLng={request.pickupLng}
          destinationLat={request.destinationLat}
          destinationLng={request.destinationLng}
        />
      </View>

      {/* Bottom Details Sheet */}
      <View style={styles.detailsSheet}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: `${getStatusColor()}15` }]}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
        </View>

        {/* Driver Info */}
        {request.acceptedDriver && (
          <View style={styles.driverRow}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverAvatarText}>
                {(request.acceptedDriver.firstName?.[0] || '?').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>
                {request.acceptedDriver.firstName} {request.acceptedDriver.lastName}
              </Text>
              {request.driverVehicle && (
                <Text style={styles.vehicleText}>
                  {request.driverVehicle.color} {request.driverVehicle.make} {request.driverVehicle.model}
                  {request.driverVehicle.plateNumber ? ` • ${request.driverVehicle.plateNumber}` : ''}
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={callDriver}>
              <Ionicons name="call" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Route */}
        <View style={styles.routeBox}>
          <View style={styles.routeRow}>
            <Ionicons name="radio-button-on" size={14} color={COLORS.success} />
            <Text style={styles.routeText} numberOfLines={1}>
              {request.pickupAddress || request.pickupPostcode || 'GPS Pickup'}
            </Text>
          </View>
          <View style={styles.routeDivider} />
          <View style={styles.routeRow}>
            <Ionicons name="location" size={14} color={COLORS.error} />
            <Text style={styles.routeText} numberOfLines={1}>
              {request.destinationAddress || request.destinationPostcode}
            </Text>
          </View>
        </View>

        {/* ETA / Cost */}
        <View style={styles.infoRow}>
          {request.driverEtaMinutes && request.status === 'accepted' && (
            <View style={styles.infoChip}>
              <Ionicons name="time-outline" size={16} color={COLORS.electricTeal} />
              <Text style={styles.infoChipText}>ETA: ~{request.driverEtaMinutes} min</Text>
            </View>
          )}
          {request.estimatedCost && (
            <View style={styles.infoChip}>
              <Ionicons name="cash-outline" size={16} color={COLORS.electricTeal} />
              <Text style={styles.infoChipText}>Est: £{request.estimatedCost.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapContainer: { flex: 1, backgroundColor: '#E2E8F0' },

  detailsSheet: {
    backgroundColor: COLORS.surface,
    padding: SPACING.xl,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 12,
  },
  statusBanner: {
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg, alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  statusText: {
    fontSize: 16, fontWeight: FONT_WEIGHTS.bold,
  },

  driverRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg,
  },
  driverAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: `${COLORS.electricTeal}18`,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  driverAvatarText: {
    color: COLORS.electricTeal, fontSize: 18, fontWeight: FONT_WEIGHTS.bold,
  },
  driverName: {
    color: COLORS.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold,
  },
  vehicleText: {
    color: COLORS.textSecondary, fontSize: 13, marginTop: 2,
  },
  callBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.success,
    justifyContent: 'center', alignItems: 'center',
  },

  routeBox: {
    backgroundColor: COLORS.background, padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  routeDivider: {
    width: 2, height: 14, backgroundColor: COLORS.border,
    marginVertical: 3, marginLeft: 6,
  },
  routeText: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },

  infoRow: {
    flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg,
  },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${COLORS.electricTeal}10`,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: 20,
  },
  infoChipText: {
    color: COLORS.electricTeal, fontSize: 13, fontWeight: FONT_WEIGHTS.semibold,
  },

  backButton: {
    alignItems: 'center', paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
  },
  backButtonText: {
    color: COLORS.textPrimary, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold,
  },
});
