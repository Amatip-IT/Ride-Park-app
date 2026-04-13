import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { taxiBookingsApi, ridesApi } from '@/api';
import { AmazonMap } from '@/components/AmazonMap';

type ParamList = {
  ProviderActiveJourney: {
    requestId: string;
    serviceType: 'driver' | 'taxi';
  };
};

export function ProviderActiveJourneyScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'ProviderActiveJourney'>>();
  const { requestId, serviceType } = route.params;

  const [requestItem, setRequestItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Journey state: 'accepted' -> 'arrived' -> 'in_progress' -> 'completed'
  const [journeyState, setJourneyState] = useState<'accepted' | 'arrived' | 'in_progress' | 'completed'>('accepted');
  const [rideId, setRideId] = useState<string | null>(null);

  useEffect(() => {
    fetchRequest();
  }, [requestId]);

  const fetchRequest = async () => {
    try {
      const res = await taxiBookingsApi.getRequest(requestId);
      if (res.data?.success) {
        setRequestItem(res.data.data);
      }
    } catch (err) {
      console.log('Failed to fetch request details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    try {
      if (journeyState === 'accepted') {
        // Driver arrived at pickup
        setJourneyState('arrived');
        Alert.alert('Arrived', 'Passenger has been notified of your arrival.');
      } else if (journeyState === 'arrived') {
        // Start the actual ride
        const res = await ridesApi.startRide({
          driverId: requestItem.acceptedDriver._id || requestItem.acceptedDriver,
          serviceType: serviceType,
          bookingId: requestId,
          pickup: {
            address: requestItem.pickupAddress || requestItem.pickupPostcode,
            lat: requestItem.pickupLat,
            lng: requestItem.pickupLng,
          },
          dropoff: {
            address: requestItem.destinationAddress || requestItem.destinationPostcode,
            lat: requestItem.destinationLat,
            lng: requestItem.destinationLng,
          }
        });
        if (res.data?.success) {
          setRideId(res.data.data._id);
          setJourneyState('in_progress');
          Alert.alert('Ride Started', 'The journey is now in progress.');
        } else {
          Alert.alert('Error', res.data?.message || 'Failed to start ride');
        }
      } else if (journeyState === 'in_progress') {
        // Complete the ride and calculate final fare
        if (!rideId) return;
        const res = await ridesApi.completeRide(
          rideId,
          requestItem.estimatedDistanceMiles || 5, // Simulation defaults
          requestItem.estimatedDurationMinutes || 15
        );
        if (res.data?.success) {
          setJourneyState('completed');
          Alert.alert(
            'Ride Completed',
            `The total fare is £${res.data.data.totalCost.toFixed(2)}. Please collect payment.`
          );
        } else {
          Alert.alert('Error', res.data?.message || 'Failed to complete ride');
        }
      } else if (journeyState === 'completed') {
        navigation.navigate('ProviderHome');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'An error occurred');
    }
  };

  const getActionText = () => {
    switch (journeyState) {
      case 'accepted': return 'I Have Arrived';
      case 'arrived': return 'Start Ride (Pick Up)';
      case 'in_progress': return 'Complete Ride & Request Payment';
      case 'completed': return 'Finish & Return Home';
      default: return 'Action';
    }
  };

  const getActionColor = () => {
    switch (journeyState) {
      case 'accepted': return COLORS.amber;
      case 'arrived': return COLORS.success;
      case 'in_progress': return COLORS.error;
      case 'completed': return COLORS.electricTeal;
      default: return COLORS.electricTeal;
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

  if (!requestItem) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={{ color: COLORS.textPrimary }}>Request not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Live Map Integration utilizing AWS MapLibre HTML Script */}
      <View style={styles.mapContainer}>
        <AmazonMap 
           pickupLat={requestItem.pickupLat}
           pickupLng={requestItem.pickupLng}
           destinationLat={requestItem.destinationLat}
           destinationLng={requestItem.destinationLng}
        />
      </View>

      <View style={styles.detailsContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.passengerStr}>
            {requestItem.passenger?.firstName} {requestItem.passenger?.lastName}
          </Text>
          <TouchableOpacity style={styles.callBtn}>
            <Ionicons name="call" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.routeBox}>
          <View style={styles.routeRow}>
            <Ionicons name="radio-button-on" size={16} color={COLORS.success} />
            <Text style={styles.routeText} numberOfLines={1}>
              {requestItem.pickupAddress || requestItem.pickupPostcode || 'GPS Location'}
            </Text>
          </View>
          <View style={styles.routeDivider} />
          <View style={styles.routeRow}>
            <Ionicons name="location" size={16} color={COLORS.error} />
            <Text style={styles.routeText} numberOfLines={1}>
              {requestItem.destinationAddress || requestItem.destinationPostcode}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.mainBtn, { backgroundColor: getActionColor() }]} 
          onPress={handleAction}
          activeOpacity={0.8}
        >
          <Text style={styles.mainBtnText}>{getActionText()}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapContainer: { flex: 1, backgroundColor: '#E2E8F0' },
  map: { width: '100%', height: '100%' },
  mapMock: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapMockText: { color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.semibold, marginTop: SPACING.sm },
  detailsContainer: {
    backgroundColor: COLORS.surface,
    padding: SPACING.xl,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  passengerStr: { fontSize: 22, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center' },
  routeBox: { backgroundColor: COLORS.background, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.xl },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  routeDivider: { width: 2, height: 16, backgroundColor: COLORS.border, marginVertical: 4, marginLeft: 7 },
  routeText: { fontSize: FONT_SIZES.body, color: COLORS.textSecondary, flex: 1 },
  mainBtn: { paddingVertical: SPACING.xl, borderRadius: BORDER_RADIUS.lg, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  mainBtnText: { color: '#FFF', fontSize: 18, fontWeight: FONT_WEIGHTS.bold },
});
