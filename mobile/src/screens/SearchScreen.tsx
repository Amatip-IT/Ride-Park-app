import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp, useNavigation, NavigationProp } from '@react-navigation/native';
import { searchApi } from '@/api';

type ServiceType = 'parking' | 'driver' | 'taxi';

type SearchParams = {
  Search: { serviceType?: ServiceType } | undefined;
};

const SERVICE_CONFIG: Record<ServiceType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; emptyMsg: string }> = {
  parking: {
    label: 'Parking',
    icon: 'car-sport',
    color: COLORS.electricTeal,
    emptyMsg: 'No parking spaces available in this area',
  },
  driver: {
    label: 'Drivers',
    icon: 'person',
    color: COLORS.info,
    emptyMsg: 'No drivers available in this area',
  },
  taxi: {
    label: 'Taxis',
    icon: 'navigate',
    color: COLORS.amber,
    emptyMsg: 'No taxis available in this area',
  },
};

export function SearchScreen() {
  const route = useRoute<RouteProp<SearchParams, 'Search'>>();
  const navigation = useNavigation<NavigationProp<any>>();
  const initialService: ServiceType = route.params?.serviceType || 'parking';

  const [serviceType, setServiceType] = useState<ServiceType>(initialService);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [resultMessage, setResultMessage] = useState('');

  const config = SERVICE_CONFIG[serviceType];

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      Alert.alert('Search', 'Please enter a location or postcode to search');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      let response;
      switch (serviceType) {
        case 'parking':
          response = await searchApi.searchParking(query);
          break;
        case 'driver':
          response = await searchApi.searchDrivers(query);
          break;
        case 'taxi':
          response = await searchApi.searchTaxis(query);
          break;
      }

      const data = response.data;
      if (data.success) {
        setResults(data.data || []);
        setResultMessage(data.message || '');
      } else {
        setResults([]);
        setResultMessage(data.message || 'Search failed');
      }
    } catch (error: any) {
      setResults([]);
      setResultMessage(error?.message || 'Failed to search. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, serviceType]);

  const handleLocationSearch = useCallback(async () => {
    if (serviceType !== 'parking') {
      Alert.alert('Info', 'Location search currently only supports parking spaces.');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setSearchQuery(''); // clear text query since we're using GPS

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setIsSearching(false);
        Alert.alert('Permission Denied', 'Allow location access to find nearby parking.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const response = await searchApi.searchParkingNearby(
        location.coords.latitude,
        location.coords.longitude
      );

      const data = response.data;
      if (data.success) {
        setResults(data.data || []);
        setResultMessage(data.message || '');
      } else {
        setResults([]);
        setResultMessage(data.message || 'Location search failed');
      }
    } catch (error: any) {
      setResults([]);
      setResultMessage(error?.message || 'Failed to search by location. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [serviceType]);

  const handleServiceChange = (type: ServiceType) => {
    setServiceType(type);
    setResults([]);
    setHasSearched(false);
    setResultMessage('');
  };

  const handleParkingTap = (space: any) => {
    navigation.navigate('ParkingDetail', { spaceId: space._id, space });
  };

  // ── Render a single result card ──
  const renderParkingCard = (item: any) => (
    <TouchableOpacity key={item._id} style={styles.resultCard} activeOpacity={0.8} onPress={() => handleParkingTap(item)}>
      <View style={styles.cardHeader}>
        <Text style={styles.spotName}>{item.name}</Text>
        <Text style={styles.spotPrice}>£{item.hourlyRate?.toFixed(2)}/hr</Text>
      </View>
      {item.description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
      ) : null}
      <View style={styles.cardFooter}>
        <View style={styles.badgeContainer}>
          <Ionicons name="location-outline" size={14} color={COLORS.cloudWhite} />
          <Text style={styles.badgeText}>{item.town || item.postCode}</Text>
        </View>
        {item.totalSpots != null && (
          <View style={[styles.badgeContainer, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
            <Text style={[styles.badgeText, { color: COLORS.success, marginLeft: 0 }]}>
              {Math.max(0, item.totalSpots - (item.occupiedSpots || 0))} spots left
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderDriverCard = (item: any) => {
    const user = item.user || {};
    return (
      <TouchableOpacity key={item._id} style={styles.resultCard} activeOpacity={0.8}>
        <View style={styles.cardHeader}>
          <Text style={styles.spotName}>{user.firstName} {user.lastName}</Text>
          <View style={[styles.statusBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <Text style={[styles.statusText, { color: COLORS.success }]}>Available</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.badgeContainer}>
            <Ionicons name="location-outline" size={14} color={COLORS.cloudWhite} />
            <Text style={styles.badgeText}>{user.address?.town || user.postCode || 'N/A'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTaxiCard = (item: any) => {
    const user = item.user || {};
    return (
      <TouchableOpacity key={item._id} style={styles.resultCard} activeOpacity={0.8}>
        <View style={styles.cardHeader}>
          <Text style={styles.spotName}>{user.firstName} {user.lastName}</Text>
          <View style={[styles.statusBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <Text style={[styles.statusText, { color: COLORS.success }]}>Available</Text>
          </View>
        </View>
        {item.vehicleInfo?.make && (
          <Text style={styles.cardDescription}>
            {item.vehicleInfo.make} {item.vehicleInfo.model}
          </Text>
        )}
        <View style={styles.cardFooter}>
          <View style={styles.badgeContainer}>
            <Ionicons name="location-outline" size={14} color={COLORS.cloudWhite} />
            <Text style={styles.badgeText}>{user.address?.town || user.postCode || 'N/A'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderResultCard = (item: any) => {
    switch (serviceType) {
      case 'parking': return renderParkingCard(item);
      case 'driver': return renderDriverCard(item);
      case 'taxi': return renderTaxiCard(item);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Search</Text>
        </View>

        {/* Service Type Tabs */}
        <View style={styles.tabContainer}>
          {(Object.keys(SERVICE_CONFIG) as ServiceType[]).map((type) => {
            const cfg = SERVICE_CONFIG[type];
            const isActive = serviceType === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.tab, isActive && { borderBottomColor: cfg.color, borderBottomWidth: 2 }]}
                onPress={() => handleServiceChange(type)}
              >
                <Ionicons name={cfg.icon} size={18} color={isActive ? cfg.color : COLORS.softSlate} />
                <Text style={[styles.tabLabel, isActive && { color: cfg.color }]}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.softSlate} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search ${config.label.toLowerCase()} by location or postcode...`}
              placeholderTextColor={COLORS.softSlate}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setResults([]); setHasSearched(false); }} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={20} color={COLORS.softSlate} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actionButtonsContainer}>
            {/* Search Button */}
            <TouchableOpacity
              style={[styles.searchButton, isSearching && { opacity: 0.6 }]}
              onPress={handleSearch}
              disabled={isSearching}
            >
              {isSearching ? (
                <ActivityIndicator size="small" color={COLORS.deepNavy} />
              ) : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </TouchableOpacity>

            {/* Location Search Button (Only for Parking) */}
            {serviceType === 'parking' && (
              <TouchableOpacity
                style={[styles.locationButton, isSearching && { opacity: 0.6 }]}
                onPress={handleLocationSearch}
                disabled={isSearching}
              >
                <Ionicons name="location" size={18} color={COLORS.cloudWhite} style={{ marginRight: 6 }} />
                <Text style={styles.locationButtonText}>Nearby</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Results */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!hasSearched && !isSearching ? (
            <View style={styles.emptyState}>
              <Ionicons name="map-outline" size={64} color={COLORS.steelBlue} />
              <Text style={styles.emptyStateTitle}>Where to?</Text>
              <Text style={styles.emptyStateSubtext}>
                Enter a location or postcode to find available {config.label.toLowerCase()} near you.
              </Text>
            </View>
          ) : isSearching ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={COLORS.electricTeal} />
              <Text style={styles.emptyStateTitle}>Searching...</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={64} color={COLORS.softSlate} />
              <Text style={styles.emptyStateTitle}>No Results</Text>
              <Text style={styles.emptyStateSubtext}>{config.emptyMsg}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.resultsHeader}>{resultMessage}</Text>
              {results.map((item) => renderResultCard(item))}
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.deepNavy,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  headerTitle: {
    color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // Service Tabs
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabLabel: {
    color: COLORS.softSlate,
    fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.medium,
  },

  // Search
  searchContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.steelBlue,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    height: 50,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.body,
    height: '100%',
  },
  clearBtn: {
    padding: SPACING.xs,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  searchButton: {
    flex: 1,
    backgroundColor: COLORS.electricTeal,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    color: COLORS.deepNavy,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  locationButton: {
    flexDirection: 'row',
    backgroundColor: 'rgba(59, 130, 246, 0.2)', // Info color with opacity
    borderWidth: 1,
    borderColor: COLORS.info,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationButtonText: {
    color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // Results
  scrollContent: {
    padding: SPACING.lg,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  emptyStateTitle: {
    color: COLORS.cloudWhite,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptyStateSubtext: {
    color: COLORS.softSlate,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: '80%',
    lineHeight: 20,
  },
  resultsHeader: {
    color: COLORS.softSlate,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING.md,
  },
  resultCard: {
    backgroundColor: COLORS.steelBlue,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  spotName: {
    color: COLORS.cloudWhite,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    flex: 1,
    marginRight: SPACING.sm,
  },
  spotPrice: {
    color: COLORS.electricTeal,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
  },
  cardDescription: {
    color: COLORS.softSlate,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    marginRight: SPACING.sm,
  },
  badgeText: {
    color: COLORS.cloudWhite,
    fontSize: 12,
    marginLeft: 4,
    fontWeight: FONT_WEIGHTS.medium,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
