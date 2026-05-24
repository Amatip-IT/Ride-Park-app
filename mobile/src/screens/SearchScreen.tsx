import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, Modal, Image,
} from 'react-native';
import { useEffect } from 'react';
import * as Location from 'expo-location';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp, useNavigation, NavigationProp } from '@react-navigation/native';
import { searchApi } from '@/api';

type ServiceType = 'parking' | 'driver' | 'taxi';

type SearchParams = {
  Search: { serviceType?: ServiceType } | undefined;
};

const SERVICE_CONFIG: Record<ServiceType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; emptyMsg: string; searchHint: string }> = {
  parking: {
    label: 'Parking',
    icon: 'car-sport',
    color: COLORS.electricTeal,
    emptyMsg: 'No parking spaces available in this area',
    searchHint: 'Search by location, town, or name...',
  },
  driver: {
    label: 'Drivers',
    icon: 'person',
    color: COLORS.info,
    emptyMsg: 'No drivers available in this area',
    searchHint: 'Search by location, postcode, or driver number...',
  },
  taxi: {
    label: 'Taxis',
    icon: 'navigate',
    color: COLORS.amber,
    emptyMsg: 'No taxis available in this area',
    searchHint: 'Search by location, postcode, or driver number...',
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
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);

  // Update service type if navigating from another tab with a param
  useEffect(() => {
    if (route.params?.serviceType) {
      setServiceType(route.params.serviceType);
    }
  }, [route.params?.serviceType]);

  // Autocomplete suggestions
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = SERVICE_CONFIG[serviceType];

  // Debounced autocomplete fetch
  const handleQueryChange = useCallback((text: string) => {
    setSearchQuery(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        let response;
        switch (serviceType) {
          case 'parking':
            response = await searchApi.searchParking(text.trim(), 1, 5);
            break;
          case 'driver':
            response = await searchApi.searchDrivers(text.trim(), 1, 5);
            break;
          case 'taxi':
            response = await searchApi.searchTaxis(text.trim(), 1, 5);
            break;
        }
        const items = response.data?.data || [];
        setSuggestions(items);
        setShowSuggestions(items.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 400);
  }, [serviceType]);

  const selectSuggestion = useCallback((item: any) => {
    setShowSuggestions(false);
    setSuggestions([]);

    if (serviceType === 'parking') {
      setSearchQuery(item.name || item.town || item.postCode || '');
      handleParkingTap(item);
    } else {
      const name = `${item.user?.firstName || ''} ${item.user?.lastName || ''}`.trim();
      setSearchQuery(name || item.driverNumber?.toString() || '');
      // Full search with that name
      setResults([item]);
      setHasSearched(true);
      setResultMessage(`Showing result for "${name}"`);
    }
  }, [serviceType]);

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();

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
    setIsSearching(true);
    setHasSearched(true);
    setSearchQuery('');

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

      let response;
      switch (serviceType) {
        case 'parking':
          response = await searchApi.searchParkingNearby(location.coords.latitude, location.coords.longitude);
          break;
        case 'driver':
          response = await searchApi.searchDriversNearby(location.coords.latitude, location.coords.longitude);
          break;
        case 'taxi':
          response = await searchApi.searchTaxisNearby(location.coords.latitude, location.coords.longitude);
          break;
      }

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
    setSearchQuery('');
    setResults([]);
    setHasSearched(false);
    setResultMessage('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Automatically load all results when tab changes
  useEffect(() => {
    handleSearch();
  }, [serviceType]);

  const handleParkingTap = (space: any) => {
    navigation.navigate('ParkingDetail', { spaceId: space._id, space });
  };

  // ── Render Cards ──

  const renderParkingCard = (item: any) => (
    <TouchableOpacity key={item._id} style={styles.resultCard} activeOpacity={0.7} onPress={() => handleParkingTap(item)}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardPrice}>£{item.hourlyRate?.toFixed(2)}/hr</Text>
      </View>
      {item.description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
      ) : null}
      <View style={styles.cardFooter}>
        <View style={styles.badge}>
          <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
          <Text style={styles.badgeText}>{item.town || item.postCode}</Text>
        </View>
        {item.totalSpots != null && (
          <View style={[styles.badge, { backgroundColor: '#E8FFF3' }]}>
            <Text style={[styles.badgeText, { color: COLORS.success }]}>
              {Math.max(0, item.totalSpots - (item.occupiedSpots || 0))} spots left
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderDriverCard = (item: any) => {
    const user = item.user || {};
    const driverNum = item.driverNumber;

    const isOnline = item.availability === 'online';

    const handleSelectDriver = () => {
      if (!isOnline) {
        Alert.alert('Driver Offline', 'This driver is currently offline and cannot accept requests.');
        return;
      }
      setSelectedDriver(item);
    };

    return (
      <TouchableOpacity key={item._id} style={styles.resultCard} activeOpacity={0.7} onPress={handleSelectDriver}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{user.firstName} {user.lastName}</Text>
            {driverNum && <Text style={styles.driverNumber}>Driver #{driverNum}</Text>}
          </View>
          <View style={[styles.statusOnline, !isOnline && { backgroundColor: '#F1F5F9' }]}>
            <View style={[styles.statusDot, !isOnline && { backgroundColor: COLORS.textTertiary }]} />
            <Text style={[styles.statusOnlineText, !isOnline && { color: COLORS.textTertiary }]}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.badge}>
            <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.badgeText}>{user.address?.town || user.postCode || 'N/A'}</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="cash-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.badgeText}>£1.10/mile</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTaxiCard = (item: any) => {
    const user = item.user || {};
    const driverNum = item.driverNumber;

    const isOnline = item.availability === 'online';

    const handleSelectTaxi = () => {
      if (!isOnline) {
        Alert.alert('Taxi Offline', 'This taxi is currently offline and cannot accept requests.');
        return;
      }
      setSelectedDriver(item);
    };

    return (
      <TouchableOpacity key={item._id} style={styles.resultCard} activeOpacity={0.7} onPress={handleSelectTaxi}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{user.firstName} {user.lastName}</Text>
            {driverNum && <Text style={styles.driverNumber}>Taxi #{driverNum}</Text>}
          </View>
          <View style={[styles.statusOnline, !isOnline && { backgroundColor: '#F1F5F9' }]}>
            <View style={[styles.statusDot, !isOnline && { backgroundColor: COLORS.textTertiary }]} />
            <Text style={[styles.statusOnlineText, !isOnline && { color: COLORS.textTertiary }]}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
        </View>
        {item.vehicleInfo?.make && (
          <Text style={styles.cardDescription}>
            {item.vehicleInfo.make} {item.vehicleInfo.model}
          </Text>
        )}
        <View style={styles.cardFooter}>
          <View style={styles.badge}>
            <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.badgeText}>{user.address?.town || user.postCode || 'N/A'}</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="cash-outline" size={13} color={COLORS.textSecondary} />
            <Text style={styles.badgeText}>£1.10/mi + £0.20/min</Text>
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
                <Ionicons name={cfg.icon} size={18} color={isActive ? cfg.color : COLORS.textTertiary} />
                <Text style={[styles.tabLabel, isActive && { color: cfg.color }]}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.textTertiary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={config.searchHint}
              placeholderTextColor={COLORS.textTertiary}
              value={searchQuery}
              onChangeText={handleQueryChange}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setResults([]); setHasSearched(false); setSuggestions([]); setShowSuggestions(false); }} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Autocomplete Suggestions Dropdown */}
          {showSuggestions && (
            <View style={styles.suggestionsContainer}>
              {suggestions.map((item: any, index: number) => {
                let label = '';
                let sublabel = '';
                if (serviceType === 'parking') {
                  label = item.name || 'Parking Space';
                  sublabel = [item.town, item.postCode].filter(Boolean).join(' · ');
                } else {
                  label = `${item.user?.firstName || ''} ${item.user?.lastName || ''}`.trim() || 'Driver';
                  sublabel = item.driverNumber ? `#${item.driverNumber}` : (item.user?.address?.town || '');
                }
                return (
                  <TouchableOpacity
                    key={item._id || index}
                    style={styles.suggestionItem}
                    onPress={() => selectSuggestion(item)}
                    activeOpacity={0.6}
                  >
                    <Ionicons
                      name={serviceType === 'parking' ? 'car-sport-outline' : 'person-outline'}
                      size={18}
                      color={config.color}
                      style={{ marginRight: SPACING.sm }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestionLabel} numberOfLines={1}>{label}</Text>
                      {sublabel ? <Text style={styles.suggestionSub} numberOfLines={1}>{sublabel}</Text> : null}
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={COLORS.textTertiary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[styles.searchButton, isSearching && { opacity: 0.6 }]}
              onPress={() => { setShowSuggestions(false); handleSearch(); }}
              disabled={isSearching}
            >
              {isSearching ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </TouchableOpacity>

            {serviceType === 'parking' && (
              <TouchableOpacity
                style={[styles.locationButton, isSearching && { opacity: 0.6 }]}
                onPress={handleLocationSearch}
                disabled={isSearching}
              >
                <Ionicons name="location" size={18} color={COLORS.info} style={{ marginRight: 6 }} />
                <Text style={styles.locationButtonText}>Nearby</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Results */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!hasSearched && !isSearching ? (
            <View style={styles.emptyState}>
              <Ionicons name="map-outline" size={64} color={COLORS.textTertiary} />
              <Text style={styles.emptyStateTitle}>Where to?</Text>
              <Text style={styles.emptyStateSubtext}>
                {serviceType !== 'parking'
                  ? `Enter a location, postcode, or driver number to find ${config.label.toLowerCase()}.`
                  : `Enter a location or postcode to find available ${config.label.toLowerCase()} near you.`}
              </Text>
            </View>
          ) : isSearching ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={COLORS.electricTeal} />
              <Text style={styles.emptyStateTitle}>Searching...</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={64} color={COLORS.textTertiary} />
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

        {/* Premium Bottom Modal for Driver & Vehicle details */}
        <Modal
          visible={selectedDriver !== null}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setSelectedDriver(null)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity 
              style={styles.modalBg} 
              activeOpacity={1} 
              onPress={() => setSelectedDriver(null)} 
            />
            <View style={styles.modalContent}>
              {/* Top pill/handle */}
              <View style={styles.modalHandle} />
              
              <Text style={styles.modalHeaderTitle}>
                {serviceType === 'taxi' ? '🚕 Taxi Details' : '🤵 Chauffeur Details'}
              </Text>

              {selectedDriver && (
                <View style={{ alignItems: 'center', width: '100%', marginVertical: SPACING.md }}>
                  {/* Avatar / Initials */}
                  <View style={styles.modalAvatarPlaceholder}>
                    <Text style={styles.modalAvatarText}>
                      {((selectedDriver.user?.firstName?.[0] || '?') + (selectedDriver.user?.lastName?.[0] || '')).toUpperCase()}
                    </Text>
                  </View>

                  <Text style={styles.modalDriverName}>
                    {selectedDriver.user?.firstName} {selectedDriver.user?.lastName}
                  </Text>
                  
                  <View style={styles.modalDriverNumberBadge}>
                    <Text style={styles.modalDriverNumberText}>
                      {serviceType === 'taxi' ? 'Taxi' : 'Chauffeur'} #{selectedDriver.driverNumber || '001'}
                    </Text>
                  </View>

                  {/* Vehicle Card */}
                  <View style={styles.modalVehicleCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' }}>
                      <Ionicons name="car-sport" size={24} color={COLORS.electricTeal} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalVehicleTitle}>
                          {selectedDriver.vehicleInfo?.make || 'Standard'} {selectedDriver.vehicleInfo?.model || 'Vehicle'}
                        </Text>
                        <Text style={styles.modalVehicleSub}>
                          Color: {selectedDriver.vehicleInfo?.color || 'Black'} • Year: {selectedDriver.vehicleInfo?.year || 'N/A'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalPlateBox}>
                      <Text style={styles.modalPlateText}>
                        {selectedDriver.vehicleInfo?.plateNumber || selectedDriver.vehicleInfo?.registration || 'NO PLATE'}
                      </Text>
                    </View>
                  </View>

                  {/* Pricing / Info Row */}
                  <View style={styles.modalPricingCard}>
                    <View style={styles.modalPricingRow}>
                      <Ionicons name="cash-outline" size={18} color={COLORS.textSecondary} />
                      <Text style={styles.modalPricingText}>
                        {serviceType === 'taxi' 
                          ? 'Rate: £1.10 per mile + £0.20 per minute' 
                          : 'Rate: £1.10 per mile'}
                      </Text>
                    </View>
                    <View style={styles.modalPricingRow}>
                      <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} />
                      <Text style={styles.modalPricingText}>
                        Base: {selectedDriver.user?.address?.town || selectedDriver.user?.postCode || 'N/A'}
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.modalActions}>
                    <TouchableOpacity 
                      style={styles.modalCancelBtn}
                      onPress={() => setSelectedDriver(null)}
                    >
                      <Text style={styles.modalCancelBtnText}>Close</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.modalConfirmBtn}
                      onPress={() => {
                        const driver = selectedDriver;
                        setSelectedDriver(null);
                        if (serviceType === 'taxi') {
                          navigation.navigate('TaxiBooking', { 
                            serviceId: driver._id, 
                            prefilledName: `${driver.user?.firstName} ${driver.user?.lastName}` 
                          });
                        } else {
                          navigation.navigate('DriverRequest', { 
                            serviceId: driver._id, 
                            prefilledName: `${driver.user?.firstName} ${driver.user?.lastName}` 
                          });
                        }
                      }}
                    >
                      <Text style={styles.modalConfirmBtnText}>
                        {serviceType === 'taxi' ? 'Book Taxi' : 'Hire Chauffeur'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // Service Tabs
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    color: COLORS.textTertiary,
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
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
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
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  locationButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.info,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationButtonText: {
    color: COLORS.info,
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
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptyStateSubtext: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: '80%',
    lineHeight: 20,
  },
  resultsHeader: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING.md,
  },

  // Result Cards
  resultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    flex: 1,
    marginRight: SPACING.sm,
  },
  cardPrice: {
    color: COLORS.electricTeal,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
  },
  cardDescription: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },

  // Badges
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  badgeText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginLeft: 4,
    fontWeight: FONT_WEIGHTS.medium,
  },

  // Driver number
  driverNumber: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.medium,
    marginTop: 2,
  },

  // Online status
  statusOnline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8FFF3',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: 6,
  },
  statusOnlineText: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.success,
  },

  // Autocomplete Suggestions
  suggestionsContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: -4,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  suggestionLabel: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.label,
    fontWeight: FONT_WEIGHTS.medium,
  },
  suggestionSub: {
    color: COLORS.textTertiary,
    fontSize: 11,
    marginTop: 1,
  },

  // Premium Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: SPACING.xl,
    paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 24,
  },
  modalHandle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  modalAvatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${COLORS.electricTeal}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalAvatarText: {
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.electricTeal,
  },
  modalDriverName: {
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  modalDriverNumberBadge: {
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalDriverNumberText: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
  },
  modalVehicleCard: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  modalVehicleTitle: {
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  modalVehicleSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  modalPlateBox: {
    backgroundColor: COLORS.amber,
    borderRadius: BORDER_RADIUS.sm,
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  modalPlateText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 1,
  },
  modalPricingCard: {
    width: '100%',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  modalPricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  modalPricingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  modalConfirmBtn: {
    flex: 2,
    backgroundColor: COLORS.electricTeal,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
