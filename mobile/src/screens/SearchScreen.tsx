import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { useEffect } from 'react';
import * as Location from 'expo-location';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp, useNavigation, NavigationProp } from '@react-navigation/native';
import { searchApi } from '@/api';
import { searchLocationByText, PlaceSuggestion } from '@/api/amazonLocation';
import { useLocationBias } from '@/hooks/useLocationBias';
import { getApiErrorMessage } from '@/utils/helpers';

type ServiceType = 'parking' | 'driver' | 'taxi';

type SearchParams = {
  Search: { serviceType?: ServiceType } | undefined;
};

export function SearchScreen() {
  const route = useRoute<RouteProp<SearchParams, 'Search'>>();
  const navigation = useNavigation<NavigationProp<any>>();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const initialService: ServiceType = route.params?.serviceType || 'parking';

  const SERVICE_CONFIG: Record<ServiceType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; emptyMsg: string; searchHint: string }> = {
    parking: {
      label: 'Parking',
      icon: 'car-sport',
      color: colors.electricTeal,
      emptyMsg: 'No parking spaces available in this area',
      searchHint: 'Search by location, town, or name...',
    },
    driver: {
      label: 'Drivers',
      icon: 'person',
      color: colors.info,
      emptyMsg: 'No drivers available in this area',
      searchHint: 'Search by location, postcode, or driver number...',
    },
    taxi: {
      label: 'Taxis',
      icon: 'navigate',
      color: colors.amber,
      emptyMsg: 'No taxis available in this area',
      searchHint: 'Search by location, postcode, or driver number...',
    },
  };

  const [serviceType, setServiceType] = useState<ServiceType>(initialService);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fromNearMe, setFromNearMe] = useState(false);
  const biasPosition = useLocationBias();

  useEffect(() => {
    if (route.params?.serviceType) {
      setServiceType(route.params.serviceType);
    }
  }, [route.params?.serviceType]);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = SERVICE_CONFIG[serviceType];

  const handleQueryChange = useCallback((text: string) => {
    setSearchQuery(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setSuggestions([]);
      setPlaceSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const trimmed = text.trim();
        const [places, serviceResponse] = await Promise.all([
          trimmed.length >= 3
            ? searchLocationByText(trimmed, { biasPosition: biasPosition ?? undefined, maxResults: 5 })
            : Promise.resolve([]),
          (async () => {
            switch (serviceType) {
              case 'parking':
                return searchApi.searchParking(trimmed, 1, 5);
              case 'driver':
                return searchApi.searchDrivers(trimmed, 1, 5);
              case 'taxi':
                return searchApi.searchTaxis(trimmed, 1, 5);
            }
          })(),
        ]);

        const items = serviceResponse.data?.data || [];
        setPlaceSuggestions(places);
        setSuggestions(items);
        setShowSuggestions(places.length > 0 || items.length > 0);
      } catch {
        setSuggestions([]);
        setPlaceSuggestions([]);
        setShowSuggestions(false);
      }
    }, 400);
  }, [serviceType, biasPosition]);

  const selectPlaceSuggestion = useCallback(async (place: PlaceSuggestion) => {
    setShowSuggestions(false);
    setPlaceSuggestions([]);
    setSuggestions([]);
    setSearchQuery(place.label);
    setIsSearching(true);
    setHasSearched(true);
    setSearchError(null);

    try {
      let response;
      if (place.point?.lat && place.point?.lng) {
        switch (serviceType) {
          case 'parking':
            response = await searchApi.searchParkingNearby(place.point.lat, place.point.lng);
            break;
          case 'driver':
            response = await searchApi.searchDriversNearby(place.point.lat, place.point.lng);
            break;
          case 'taxi':
            response = await searchApi.searchTaxisNearby(place.point.lat, place.point.lng);
            break;
        }
      } else {
        switch (serviceType) {
          case 'parking':
            response = await searchApi.searchParking(place.label);
            break;
          case 'driver':
            response = await searchApi.searchDrivers(place.label);
            break;
          case 'taxi':
            response = await searchApi.searchTaxis(place.label);
            break;
        }
      }

      const data = response!.data;
      if (data.success) {
        setResults(data.data || []);
        setResultMessage(data.message || `Near ${place.label}`);
      } else {
        setResults([]);
        setResultMessage(data.message || 'Search failed');
        setSearchError(data.message || 'Search failed');
      }
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Failed to search near that location.');
      setResults([]);
      setResultMessage(message);
      setSearchError(message);
    } finally {
      setIsSearching(false);
    }
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
      setResults([item]);
      setHasSearched(true);
      setResultMessage(`Showing result for "${name}"`);
    }
  }, [serviceType]);

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    setFromNearMe(false);

    if (serviceType === 'parking' && !query) {
      setSearchError('Enter a location, town, or postcode — or tap Nearby to find parking near you.');
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setSearchError(null);

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
        setSearchError(data.message || 'Search failed');
      }
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Failed to search. Please try again.');
      setResults([]);
      setResultMessage(message);
      setSearchError(message);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, serviceType]);

  const handleLocationSearch = useCallback(async () => {
    setIsSearching(true);
    setHasSearched(true);
    setSearchQuery('');
    setSearchError(null);
    setFromNearMe(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setIsSearching(false);
        setHasSearched(false);
        Alert.alert('Permission Denied', 'Allow location access to find nearby services.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
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
        setResultMessage(data.message || `Nearby ${config.label.toLowerCase()}`);
      } else {
        setResults([]);
        setResultMessage(data.message || 'Location search failed');
        setSearchError(data.message || 'Location search failed');
      }
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Failed to search by location. Please try again.');
      setResults([]);
      setResultMessage(message);
      setSearchError(message);
    } finally {
      setIsSearching(false);
    }
  }, [serviceType, config.label]);

  const handleServiceChange = (type: ServiceType) => {
    setServiceType(type);
    setSearchQuery('');
    setResults([]);
    setHasSearched(false);
    setResultMessage('');
    setSearchError(null);
    setFromNearMe(false);
    setSuggestions([]);
    setPlaceSuggestions([]);
    setShowSuggestions(false);
  };

  const handleParkingTap = (space: any) => {
    const id = space?._id?.toString?.() || space?._id;
    if (!id) {
      Alert.alert('Error', 'This parking listing could not be opened. Try searching again.');
      return;
    }
    navigation.navigate('ParkingDetail', { spaceId: id, space });
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
          <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.badgeText}>{item.town || item.postCode}</Text>
        </View>
        {item.totalSpots != null && (
          <View style={[styles.badge, { backgroundColor: `${colors.success}20` }]}>
            <Text style={[styles.badgeText, { color: colors.success }]}>
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

    return (
      <TouchableOpacity key={item._id} style={styles.resultCard} activeOpacity={0.7} onPress={() => setSelectedDriver(item)}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{user.firstName} {user.lastName}</Text>
            {driverNum && <Text style={styles.driverNumber}>Driver #{driverNum}</Text>}
          </View>
          <View style={[styles.statusOnline, !isOnline && { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.statusDot, !isOnline && { backgroundColor: colors.textTertiary }]} />
            <Text style={[styles.statusOnlineText, !isOnline && { color: colors.textTertiary }]}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.badge}>
            <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.badgeText}>{user.address?.town || user.postCode || 'N/A'}</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="cash-outline" size={13} color={colors.textSecondary} />
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

    return (
      <TouchableOpacity key={item._id} style={styles.resultCard} activeOpacity={0.7} onPress={() => setSelectedDriver(item)}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{user.firstName} {user.lastName}</Text>
            {driverNum && <Text style={styles.driverNumber}>Taxi #{driverNum}</Text>}
          </View>
          <View style={[styles.statusOnline, !isOnline && { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.statusDot, !isOnline && { backgroundColor: colors.textTertiary }]} />
            <Text style={[styles.statusOnlineText, !isOnline && { color: colors.textTertiary }]}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
        </View>
        {item.vehicleInfo?.make && (
          <Text style={styles.cardDescription}>
            {item.vehicleInfo.make} {item.vehicleInfo.model}
          </Text>
        )}
        <View style={styles.cardFooter}>
          <View style={styles.badge}>
            <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.badgeText}>{user.address?.town || user.postCode || 'N/A'}</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="cash-outline" size={13} color={colors.textSecondary} />
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
                <Ionicons name={cfg.icon} size={18} color={isActive ? cfg.color : colors.textTertiary} />
                <Text style={[styles.tabLabel, isActive && { color: cfg.color }]}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={colors.textTertiary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={config.searchHint}
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={handleQueryChange}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              onFocus={() => { if (suggestions.length > 0 || placeSuggestions.length > 0) setShowSuggestions(true); }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setResults([]); setHasSearched(false); setSuggestions([]); setPlaceSuggestions([]); setShowSuggestions(false); }} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Autocomplete Suggestions */}
          {showSuggestions && (placeSuggestions.length > 0 || suggestions.length > 0) && (
            <View style={styles.suggestionsContainer}>
              {placeSuggestions.length > 0 && (
                <Text style={styles.suggestionsSectionLabel}>Places near you</Text>
              )}
              {placeSuggestions.map((place, index) => (
                <TouchableOpacity
                  key={`place-${index}`}
                  style={styles.suggestionItem}
                  onPress={() => selectPlaceSuggestion(place)}
                  activeOpacity={0.6}
                >
                  <Ionicons name="location-outline" size={18} color={colors.info} style={{ marginRight: SPACING.sm }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionLabel} numberOfLines={1}>{place.label}</Text>
                    {(place.municipality || place.country) ? (
                      <Text style={styles.suggestionSub} numberOfLines={1}>
                        {[place.municipality, place.country].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}

              {suggestions.length > 0 && placeSuggestions.length > 0 && (
                <Text style={[styles.suggestionsSectionLabel, { marginTop: SPACING.sm }]}>
                  {serviceType === 'parking' ? 'Parking spaces' : serviceType === 'driver' ? 'Drivers' : 'Taxis'}
                </Text>
              )}

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
                    <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
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

            <TouchableOpacity
              style={[styles.locationButton, isSearching && { opacity: 0.6 }]}
              onPress={handleLocationSearch}
              disabled={isSearching}
            >
              <Ionicons name="location" size={18} color={colors.info} style={{ marginRight: 6 }} />
              <Text style={styles.locationButtonText}>
                {serviceType === 'parking' ? 'Nearby' : 'Near me'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Results */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!hasSearched && !isSearching ? (
            <View style={styles.emptyState}>
              <Ionicons name="map-outline" size={64} color={colors.textTertiary} />
              <Text style={styles.emptyStateTitle}>Where to?</Text>
              <Text style={styles.emptyStateSubtext}>
                {serviceType === 'parking'
                  ? 'Enter a location or postcode, or tap Nearby to find parking near you.'
                  : `Enter a location, postcode, or driver number — or tap Near me to browse ${config.label.toLowerCase()} nearby.`}
              </Text>
              {searchError ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color={colors.coralRed} />
                  <Text style={styles.errorBannerText}>{searchError}</Text>
                </View>
              ) : null}
            </View>
          ) : isSearching ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={colors.electricTeal} />
              <Text style={styles.emptyStateTitle}>Searching...</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={64} color={colors.textTertiary} />
              <Text style={styles.emptyStateTitle}>{searchError ? 'Search Failed' : 'No Results'}</Text>
              <Text style={styles.emptyStateSubtext}>{searchError || config.emptyMsg}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.resultsHeader}>{resultMessage}</Text>

              {fromNearMe && serviceType === 'taxi' && (
                <TouchableOpacity
                  style={styles.instantBookBanner}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('TaxiBooking', {})}
                >
                  <View style={styles.instantBookIconWrap}>
                    <Ionicons name="flash" size={22} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.instantBookTitle}>Book nearest available taxi</Text>
                    <Text style={styles.instantBookSub}>
                      Instantly notify all online taxis near you — no need to pick a driver first.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.amber} />
                </TouchableOpacity>
              )}

              {fromNearMe && serviceType === 'taxi' && results.length > 0 && (
                <Text style={styles.nearMeHint}>
                  Or tap a driver below to request them specifically by ID
                </Text>
              )}

              {results.map((item) => renderResultCard(item))}
            </>
          )}
        </ScrollView>

        {/* Driver Detail Modal */}
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
              <View style={styles.modalHandle} />

              <Text style={styles.modalHeaderTitle}>
                {serviceType === 'taxi' ? '🚕 Taxi Details' : '🤵 Chauffeur Details'}
              </Text>

              {selectedDriver && (() => {
                const isDriverOnline = selectedDriver.availability === 'online';
                const availabilityLabel =
                  selectedDriver.availability === 'busy'
                    ? 'Busy on another trip'
                    : 'Not available at the moment';

                return (
                <View style={{ alignItems: 'center', width: '100%', marginVertical: SPACING.md }}>
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

                  {!isDriverOnline && (
                    <View style={styles.modalOfflineBanner}>
                      <Ionicons name="radio-button-off" size={16} color={colors.coralRed} />
                      <Text style={styles.modalOfflineText}>{availabilityLabel}</Text>
                    </View>
                  )}

                  <View style={styles.modalVehicleCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' }}>
                      <Ionicons name="car-sport" size={24} color={colors.electricTeal} />
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

                  <View style={styles.modalPricingCard}>
                    <View style={styles.modalPricingRow}>
                      <Ionicons name="cash-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.modalPricingText}>
                        {serviceType === 'taxi'
                          ? 'Rate: £1.10 per mile + £0.20 per minute'
                          : 'Rate: £1.10 per mile'}
                      </Text>
                    </View>
                    <View style={styles.modalPricingRow}>
                      <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.modalPricingText}>
                        Base: {selectedDriver.user?.address?.town || selectedDriver.user?.postCode || 'N/A'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.modalCancelBtn}
                      onPress={() => setSelectedDriver(null)}
                    >
                      <Text style={styles.modalCancelBtnText}>Close</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalConfirmBtn, !isDriverOnline && styles.modalConfirmBtnDisabled]}
                      disabled={!isDriverOnline}
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
                        {!isDriverOnline
                          ? 'Not available'
                          : serviceType === 'taxi' ? 'Book This Taxi' : 'Hire This Chauffeur'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                );
              })()}
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    header: {
      paddingHorizontal: SPACING.xl,
      paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
      paddingBottom: SPACING.sm,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: FONT_SIZES.section,
      fontWeight: FONT_WEIGHTS.bold,
    },
    tabContainer: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
      color: colors.textTertiary,
      fontSize: FONT_SIZES.label,
      fontWeight: FONT_WEIGHTS.medium,
    },
    searchContainer: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.md,
      height: 48,
    },
    searchIcon: { marginRight: SPACING.sm },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: FONT_SIZES.body,
      height: '100%',
    },
    clearBtn: { padding: SPACING.xs },
    actionButtonsContainer: { flexDirection: 'row', marginTop: SPACING.sm, gap: SPACING.sm },
    searchButton: {
      flex: 1,
      backgroundColor: colors.electricTeal,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchButtonText: { color: '#FFF', fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold },
    locationButton: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.info,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    locationButtonText: { color: colors.info, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold },
    scrollContent: { padding: SPACING.lg, flexGrow: 1 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
    emptyStateTitle: {
      color: colors.textPrimary, fontSize: 20, fontWeight: FONT_WEIGHTS.semibold,
      marginTop: SPACING.lg, marginBottom: SPACING.sm,
    },
    emptyStateSubtext: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', maxWidth: '80%', lineHeight: 20 },
    errorBanner: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
      marginTop: SPACING.lg, padding: SPACING.md,
      backgroundColor: `${colors.coralRed}18`, borderRadius: BORDER_RADIUS.md, maxWidth: '90%',
    },
    errorBannerText: { flex: 1, color: colors.coralRed, fontSize: 13, lineHeight: 18 },
    resultsHeader: { color: colors.textSecondary, fontSize: 14, fontWeight: FONT_WEIGHTS.medium, marginBottom: SPACING.md },
    instantBookBanner: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
      marginBottom: SPACING.md, padding: SPACING.lg,
      backgroundColor: `${colors.amber}18`, borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1, borderColor: colors.amber,
    },
    instantBookIconWrap: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: colors.amber,
      alignItems: 'center', justifyContent: 'center',
    },
    instantBookTitle: { color: colors.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.semibold },
    instantBookSub: { color: colors.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2, lineHeight: 16 },
    nearMeHint: { color: colors.textTertiary, fontSize: FONT_SIZES.small, marginBottom: SPACING.sm },
    resultCard: {
      backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: colors.border,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
    cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold, flex: 1, marginRight: SPACING.sm },
    cardPrice: { color: colors.electricTeal, fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
    cardDescription: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: SPACING.sm },
    cardFooter: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.sm },
    badge: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt,
      paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.sm,
    },
    badgeText: { color: colors.textSecondary, fontSize: 12, marginLeft: 4, fontWeight: FONT_WEIGHTS.medium },
    driverNumber: { color: colors.textSecondary, fontSize: 12, fontWeight: FONT_WEIGHTS.medium, marginTop: 2 },
    statusOnline: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: `${colors.success}20`,
      paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.sm,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success, marginRight: 6 },
    statusOnlineText: { fontSize: 12, fontWeight: FONT_WEIGHTS.semibold, color: colors.success },
    suggestionsContainer: {
      backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.md,
      borderWidth: 1, borderColor: colors.border, marginTop: -4, marginBottom: SPACING.sm,
      overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    suggestionsSectionLabel: {
      paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.xs,
      color: colors.textSecondary, fontSize: 11, fontWeight: FONT_WEIGHTS.semibold,
      textTransform: 'uppercase', letterSpacing: 0.4,
    },
    suggestionItem: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md,
      borderBottomWidth: 1, borderBottomColor: colors.divider,
    },
    suggestionLabel: { color: colors.textPrimary, fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.medium },
    suggestionSub: { color: colors.textTertiary, fontSize: 11, marginTop: 1 },

    // Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
    modalContent: {
      backgroundColor: colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30,
      padding: SPACING.xl, paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xl,
      alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15, shadowRadius: 16, elevation: 24,
    },
    modalHandle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: SPACING.lg },
    modalHeaderTitle: { fontSize: 18, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary, marginBottom: SPACING.md },
    modalAvatarPlaceholder: {
      width: 72, height: 72, borderRadius: 36, backgroundColor: `${colors.electricTeal}15`,
      justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md,
    },
    modalAvatarText: { fontSize: 24, fontWeight: FONT_WEIGHTS.bold, color: colors.electricTeal },
    modalDriverName: { fontSize: 20, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary, marginBottom: 4 },
    modalDriverNumberBadge: {
      backgroundColor: colors.surfaceAlt, paddingHorizontal: SPACING.md, paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border,
    },
    modalDriverNumberText: { fontSize: 12, fontWeight: FONT_WEIGHTS.semibold, color: colors.textSecondary },
    modalVehicleCard: {
      backgroundColor: colors.surfaceAlt, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
      width: '100%', borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.md,
    },
    modalVehicleTitle: { fontSize: 15, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary },
    modalVehicleSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    modalPlateBox: {
      backgroundColor: colors.amber, borderRadius: BORDER_RADIUS.sm, paddingVertical: 5,
      paddingHorizontal: 12, alignSelf: 'flex-start', marginTop: SPACING.md,
      borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
    },
    modalPlateText: { fontSize: 13, fontWeight: '800', color: '#000', letterSpacing: 1 },
    modalPricingCard: { width: '100%', gap: SPACING.sm, marginBottom: SPACING.lg, paddingHorizontal: SPACING.xs },
    modalPricingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
    modalPricingText: { fontSize: 13, color: colors.textSecondary, fontWeight: FONT_WEIGHTS.medium },
    modalActions: { flexDirection: 'row', gap: SPACING.md, width: '100%' },
    modalCancelBtn: {
      flex: 1, paddingVertical: SPACING.lg, borderRadius: BORDER_RADIUS.md,
      borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    },
    modalCancelBtnText: { color: colors.textSecondary, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold },
    modalConfirmBtn: {
      flex: 2, backgroundColor: colors.electricTeal, paddingVertical: SPACING.lg,
      borderRadius: BORDER_RADIUS.md, alignItems: 'center', justifyContent: 'center',
    },
    modalConfirmBtnDisabled: { backgroundColor: colors.textTertiary, opacity: 0.7 },
    modalOfflineBanner: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
      backgroundColor: `${colors.coralRed}18`, paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
      marginTop: SPACING.sm, marginBottom: SPACING.sm,
    },
    modalOfflineText: { color: colors.coralRed, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium },
    modalConfirmBtnText: { color: '#FFF', fontSize: 15, fontWeight: FONT_WEIGHTS.bold },
  });
