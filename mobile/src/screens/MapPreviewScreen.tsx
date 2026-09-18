import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmazonMap } from '@/components/AmazonMap';
import { LocationAutocompleteInput, PlaceSuggestion } from '@/components/LocationAutocompleteInput';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import * as Location from 'expo-location';

export function MapPreviewScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NavigationProp<any>>();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [destinationText, setDestinationText] = useState('');
  const [destination, setDestination] = useState<{
    label: string;
    lat: number;
    lng: number;
  } | null>(null);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('ConsumerTabs');
  }, [navigation]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          return;
        }

        const loc = await Location.getCurrentPositionAsync({});
        setLocation({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
      } catch {
        setErrorMsg('Could not get your location');
      }
    })();
  }, []);

  const handleSelectDestination = useCallback((place: PlaceSuggestion) => {
    setDestinationText(place.label);
    if (place.point?.lat != null && place.point?.lng != null) {
      setDestination({
        label: place.label,
        lat: place.point.lat,
        lng: place.point.lng,
      });
    }
  }, []);

  if (!location) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.electricTeal} />
        <Text style={{ color: colors.textPrimary, marginTop: 10 }}>Getting your location...</Text>
        {errorMsg && <Text style={{ color: colors.error, marginTop: 10 }}>{errorMsg}</Text>}
        <TouchableOpacity
          style={[styles.backBtnSolid, { marginTop: 24, backgroundColor: colors.surface }]}
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          <Text style={{ color: colors.textPrimary, fontWeight: FONT_WEIGHTS.semibold }}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <AmazonMap
          pickupLat={location.lat}
          pickupLng={location.lng}
          destinationLat={destination?.lat}
          destinationLng={destination?.lng}
        />
      </View>

      <View
        style={[styles.floatingHeader, { top: Math.max(insets.top, 12) + 8 }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Map</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Close map"
        >
          <Ionicons name="close" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <View style={[styles.bottomCard, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }]}>
        <View style={styles.routeInfo}>
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.routeText}>Your current location</Text>
          </View>

          <View style={styles.routeConnector} />

          <View style={styles.destinationBlock}>
            <View style={[styles.dot, { backgroundColor: '#EF4444', marginTop: 14 }]} />
            <LocationAutocompleteInput
              containerStyle={{ flex: 1 }}
              style={styles.destinationInput}
              placeholder="Where to?"
              placeholderTextColor="#9CA3AF"
              value={destinationText}
              onChangeText={(text) => {
                setDestinationText(text);
                if (destination) setDestination(null);
              }}
              onSelectPlace={handleSelectDestination}
              searchOptions={{ biasPosition: location }}
            />
          </View>
        </View>

        {destination ? (
          <Text style={styles.hintText}>
            Blue line shows the driving route to your destination.
          </Text>
        ) : (
          <Text style={styles.hintText}>Type a destination to see the route on the map.</Text>
        )}

        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() =>
              navigation.navigate('TaxiBooking', {
                // prefill if we have destination — params may be ignored if not typed; still useful
              })
            }
          >
            <Ionicons name="navigate" size={20} color="#FFF" />
            <Text style={styles.actionBtnText}>Book a Taxi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.info }]}
            onPress={() => navigation.navigate('DriverRequest', {})}
          >
            <Ionicons name="person" size={20} color="#FFF" />
            <Text style={styles.actionBtnText}>Book a Driver</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.closeLink} onPress={handleBack}>
          <Text style={styles.closeLinkText}>Close map</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#E8EEF5',
    },
    mapContainer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 0,
      backgroundColor: '#E8EEF5',
    },
    floatingHeader: {
      position: 'absolute',
      left: SPACING.md,
      right: SPACING.md,
      zIndex: 20,
      elevation: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255,255,255,0.98)',
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.04)',
    },
    backBtnSolid: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.lg,
    },
    headerTitle: {
      fontSize: FONT_SIZES.section,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#111827',
    },
    bottomCard: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      elevation: 20,
      backgroundColor: '#FFFFFF',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: SPACING.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
    },
    routeInfo: {
      marginBottom: SPACING.sm,
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
    },
    routeConnector: {
      width: 2,
      height: 12,
      backgroundColor: '#D1D5DB',
      marginLeft: 5,
      marginVertical: 2,
    },
    destinationBlock: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
    },
    destinationInput: {
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: 12,
      fontSize: FONT_SIZES.body,
      color: '#111827',
      backgroundColor: '#F9FAFB',
    },
    hintText: {
      color: '#6B7280',
      fontSize: FONT_SIZES.small,
      marginBottom: SPACING.md,
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: SPACING.sm,
    },
    routeText: {
      fontSize: FONT_SIZES.body,
      color: '#111827',
      fontWeight: FONT_WEIGHTS.medium,
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
      backgroundColor: colors.amber,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.lg,
      gap: 8,
    },
    actionBtnText: {
      color: '#FFF',
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
    },
    closeLink: {
      marginTop: SPACING.md,
      alignItems: 'center',
      paddingVertical: SPACING.sm,
    },
    closeLinkText: {
      color: '#6B7280',
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
    },
  });
