import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, Image, TextInput,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { searchApi, bookingsApi } from '@/api';
import MapView, { Marker } from 'react-native-maps';

type ParkingDetailParams = {
  ParkingDetail: { spaceId: string; space?: any };
};

export function ParkingDetailScreen() {
  const route = useRoute<RouteProp<ParkingDetailParams, 'ParkingDetail'>>();
  const navigation = useNavigation();
  const { spaceId, space: passedSpace } = route.params;

  const [space, setSpace] = useState<any>(passedSpace || null);
  const [loading, setLoading] = useState(!passedSpace);
  const [sendingRequest, setSendingRequest] = useState(false);

  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!passedSpace && spaceId) {
      fetchDetail();
    }
  }, [spaceId]);

  const fetchDetail = async () => {
    try {
      const res = await searchApi.getParkingDetail(spaceId);
      if (res.data?.success) {
        setSpace(res.data.data);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load parking space details');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async () => {
    setSendingRequest(true);
    try {
      const response = await bookingsApi.createRequest({
        serviceType: 'parking',
        serviceId: spaceId,
        message: message.trim() || undefined,
      });

      if (response.data?.success) {
        Alert.alert(
          'Request Sent!',
          'Your parking request has been sent to the owner. You will be notified when they respond.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else {
        Alert.alert('Error', response.data?.message || 'Failed to send request');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send request. Please try again.');
    } finally {
      setSendingRequest(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.electricTeal} />
        </View>
      </SafeAreaView>
    );
  }

  if (!space) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.softSlate} />
          <Text style={styles.errorText}>Parking space not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const availableSpots = Math.max(0, (space.totalSpots || 0) - (space.occupiedSpots || 0));
  const ownerName = space.owner?.firstName
    ? `${space.owner.firstName} ${space.owner.lastName}`
    : 'Park Owner';

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Back button */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.cloudWhite} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Parking Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Photos */}
        {space.photos && space.photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoContainer}>
            {space.photos.map((photo: string, index: number) => (
              <Image key={index} source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.noPhotoContainer}>
            <Ionicons name="image-outline" size={48} color={COLORS.softSlate} />
            <Text style={styles.noPhotoText}>No photos available</Text>
          </View>
        )}

        {/* About this car park */}
        <View style={styles.detailSection}>
          <Text style={styles.sectionHeader}>About this car park</Text>

          {/* Quick Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Ionicons name="time-outline" size={24} color={COLORS.electricTeal} />
              <Text style={styles.metricText}>{space.openingTimes?.['Everyday'] || space.openingTimes?.['Monday'] || 'Not specified'}</Text>
            </View>
            <View style={styles.metricItem}>
              <Ionicons name="car-outline" size={24} color={COLORS.electricTeal} />
              <Text style={styles.metricText}>{space.totalSpots ? `${space.totalSpots} spaces` : 'Capacity not specified'}</Text>
            </View>
            <View style={styles.metricItem}>
              <Ionicons name="stopwatch-outline" size={24} color={COLORS.electricTeal} />
              <Text style={styles.metricText}>{space.parkingType || 'Not specified'}</Text>
            </View>
            <View style={styles.metricItem}>
              <Ionicons name="phone-portrait-outline" size={24} color={COLORS.electricTeal} />
              <Text style={styles.metricText}>{space.bookingMethods?.length ? space.bookingMethods.join(', ') : 'Not specified'}</Text>
            </View>
          </View>

          {/* Location & Map */}
          <View style={styles.blockContainer}>
            <Text style={styles.blockTitle}>Location</Text>
            <Text style={styles.blockText}>
              {[space.addressLine1 || space.name, space.town, space.postCode].filter(Boolean).join(', ')}
            </Text>
            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkText}>Get directions to this car park</Text>
              <Ionicons name="open-outline" size={14} color={COLORS.electricTeal} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
            <Text style={styles.blockSubText}>Location ID: {space.locationId || 'Not set'}</Text>

            {/* Embedded Map */}
            {space.coordinates?.lat && space.coordinates?.lng ? (
              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  initialRegion={{
                    latitude: space.coordinates.lat,
                    longitude: space.coordinates.lng,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                  scrollEnabled={false}
                >
                  <Marker
                    coordinate={{ latitude: space.coordinates.lat, longitude: space.coordinates.lng }}
                    title={space.name}
                  />
                </MapView>
              </View>
            ) : (
              <View style={styles.mapPlaceholder}>
                <Ionicons name="map-outline" size={32} color={COLORS.softSlate} />
                <Text style={styles.noPhotoText}>Map preview not available</Text>
              </View>
            )}
          </View>

          {/* Charges */}
          <View style={styles.blockContainer}>
            <Text style={styles.blockTitle}>Charges</Text>
            <Text style={styles.blockText}>
              {space.maxStayDetails || 'Stay details not specified.'}
            </Text>
            
            <View style={styles.chargesList}>
              <Text style={styles.chargeItem}>Rate: £{(space.hourlyRate || 0).toFixed(2)} / hour</Text>
              {space.chargesDescription && <Text style={styles.chargeItem}>{space.chargesDescription}</Text>}
            </View>
          </View>

          {/* Opening times */}
          <View style={styles.blockContainer}>
            <Text style={styles.blockTitle}>Opening times</Text>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
              <View key={day} style={styles.openingTimeRow}>
                <Text style={styles.dayText}>{day}</Text>
                <Text style={styles.timeText}>
                  {space.openingTimes?.[day] || space.openingTimes?.['Everyday'] || 'Not specified'}
                </Text>
              </View>
            ))}
          </View>

          {/* Capacity */}
          <View style={styles.blockContainer}>
            <Text style={styles.blockTitle}>Capacity</Text>
            <Text style={styles.blockText}>Maximum spaces: {space.totalSpots} (max)</Text>
            <Text style={[styles.blockText, { marginTop: 8, color: availableSpots > 0 ? COLORS.success : COLORS.coralRed }]}>
              {availableSpots > 0 ? `${availableSpots} currently available` : 'Full'}
            </Text>
          </View>

          {/* Accepted vehicles */}
          <View style={styles.blockContainer}>
            <Text style={styles.blockTitle}>Accepted vehicles</Text>
            {(space.acceptedVehicles?.length > 0 ? space.acceptedVehicles : ['Car', 'Motorbikes']).map((v: string) => (
              <Text key={v} style={styles.vehicleType}>{v}</Text>
            ))}
          </View>

          <View style={styles.divider} />
          
          {/* Owner details */}
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark" size={20} color={COLORS.electricTeal} />
            <Text style={styles.infoText}>Verified by Ride & Park. Managed by {ownerName}</Text>
          </View>
        </View>

        {/* Message */}
        <View style={styles.pricingSection}>
          <Text style={styles.sectionTitle}>Message the Owner (Optional)</Text>
          <TextInput
            style={styles.messageInput}
            placeholder="Any questions or special requests?"
            placeholderTextColor={COLORS.softSlate}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={300}
          />
        </View>

        {/* Pricing */}
        <View style={styles.pricingSection}>
          <Text style={styles.sectionTitle}>Pricing</Text>
          <View style={styles.priceRow}>
            <View style={styles.priceCard}>
              <Text style={styles.priceLabel}>Per Hour</Text>
              <Text style={styles.priceValue}>£{space.hourlyRate?.toFixed(2)}</Text>
            </View>
            {space.dailyRate && (
              <View style={styles.priceCard}>
                <Text style={styles.priceLabel}>Per Day</Text>
                <Text style={styles.priceValue}>£{space.dailyRate?.toFixed(2)}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* CTA Button */}
      <View style={styles.ctaContainer}>
        {/* Chat Button */}
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => (navigation as any).navigate('Chat', { 
            userId: space.owner?._id || space.owner, 
            userName: space.owner?.firstName ? `${space.owner.firstName} ${space.owner.lastName}` : 'Park Owner' 
          })}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-ellipses" size={24} color={COLORS.electricTeal} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctaButton, (sendingRequest || availableSpots === 0) && styles.ctaDisabled]}
          onPress={handleSendRequest}
          disabled={sendingRequest || availableSpots === 0}
          activeOpacity={0.8}
        >
          {sendingRequest ? (
            <ActivityIndicator color={COLORS.deepNavy} />
          ) : (
            <>
              <Ionicons name="send" size={20} color={COLORS.deepNavy} style={{ marginRight: 8 }} />
              <Text style={styles.ctaText}>
                {availableSpots === 0 ? 'No Spots Available' : 'Send Request'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.deepNavy },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: COLORS.softSlate, fontSize: 16, marginTop: SPACING.md },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold },

  // Photos
  photoContainer: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  photo: {
    width: 280, height: 180, borderRadius: BORDER_RADIUS.lg,
    marginRight: SPACING.md, backgroundColor: COLORS.steelBlue,
  },
  noPhotoContainer: {
    height: 180, marginHorizontal: SPACING.lg, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.steelBlue, justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  noPhotoText: { color: COLORS.softSlate, marginTop: SPACING.sm, fontSize: 14 },

  scrollContent: { paddingBottom: 100 },

  // Details
  detailSection: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl },
  sectionHeader: {
    color: COLORS.cloudWhite, fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.xl,
  },
  metricsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.xl,
  },
  metricItem: {
    width: '47%', backgroundColor: COLORS.steelBlue, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  metricText: {
    color: COLORS.cloudWhite, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 8,
  },
  
  blockContainer: { marginBottom: SPACING.xl },
  blockTitle: {
    color: COLORS.cloudWhite, fontSize: 20, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.sm,
  },
  blockText: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.body, lineHeight: 22 },
  blockSubText: { color: COLORS.softSlate, fontSize: FONT_SIZES.small, marginTop: 4 },
  
  linkButton: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  linkText: { color: COLORS.electricTeal, fontSize: FONT_SIZES.body, textDecorationLine: 'underline' },

  mapContainer: {
    width: '100%', height: 200, borderRadius: BORDER_RADIUS.lg, overflow: 'hidden',
    marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.steelBlue,
  },
  map: { width: '100%', height: '100%' },
  mapPlaceholder: {
    width: '100%', height: 200, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.steelBlue, justifyContent: 'center', alignItems: 'center',
    marginTop: SPACING.md,
  },

  chargesList: { marginTop: SPACING.sm },
  chargeItem: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.body, marginBottom: 4 },

  openingTimeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dayText: { color: COLORS.softSlate, fontSize: FONT_SIZES.body, flex: 1 },
  timeText: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.medium },

  vehicleType: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.body, marginBottom: 4 },
  
  divider: { height: 1, backgroundColor: COLORS.steelBlue, marginVertical: SPACING.lg },

  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: SPACING.sm, gap: SPACING.sm,
  },
  infoText: { color: COLORS.cloudWhite, fontSize: FONT_SIZES.label, flex: 1 },

  // Pricing
  pricingSection: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl },
  sectionTitle: {
    color: COLORS.cloudWhite, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.md,
  },
  priceRow: { flexDirection: 'row', gap: SPACING.md },
  priceCard: {
    flex: 1, backgroundColor: COLORS.steelBlue, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, alignItems: 'center',
  },
  priceLabel: { color: COLORS.softSlate, fontSize: FONT_SIZES.small, marginBottom: 4 },
  priceValue: { color: COLORS.electricTeal, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold },

  // Message Input
  messageInput: {
    backgroundColor: COLORS.steelBlue, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: COLORS.cloudWhite, fontSize: FONT_SIZES.body,
    minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: 'transparent',
  },

  // CTA
  ctaContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg,
    backgroundColor: COLORS.deepNavy,
    borderTopWidth: 1, borderTopColor: COLORS.steelBlue,
  },
  ctaButton: {
    flex: 1,
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center',
  },
  chatButton: {
    width: 56, height: 56, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.steelBlue,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.electricTeal,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: COLORS.deepNavy, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },
});
