import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Platform, SafeAreaView } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Mock data for visual presentation
  const mockResults = [
    { id: '1', name: 'Downtown Garage', price: '£4.50/hr', distance: '0.2 mi away', spots: 12 },
    { id: '2', name: 'Central Station Parking', price: '£6.00/hr', distance: '0.4 mi away', spots: 3 },
    { id: '3', name: 'Westfield Mall Lot', price: '£3.00/hr', distance: '0.8 mi away', spots: 45 },
    { id: '4', name: 'Street Share: 12 Baker St', price: '£2.50/hr', distance: '1.2 mi away', spots: 1 },
  ];

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    
    // Clean and validate query
    const cleanQuery = searchQuery.replace(/\s+/g, '').toUpperCase();
    
    try {
      const response = await fetch(`https://api.postcodes.io/postcodes/${cleanQuery}`);
      const data = await response.json();
      
      if (data.status === 200) {
        const { latitude, longitude, admin_district } = data.result;
        // Output result logic (to be passed to backend coordinates API)
        // For now, we simulate success state
        console.log(`Found: lat ${latitude}, lon ${longitude} in ${admin_district}`);
      }
    } catch (error) {
      console.error('Postcode API Error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Find a Space</Text>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.softSlate} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Enter postcode or destination..."
              placeholderTextColor={COLORS.softSlate}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={20} color={COLORS.softSlate} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!isSearching && searchQuery.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="map-outline" size={64} color={COLORS.steelBlue} />
              <Text style={styles.emptyStateTitle}>Where to?</Text>
              <Text style={styles.emptyStateSubtext}>Type a destination to see available parking spaces and prices.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.resultsHeader}>Available near "{searchQuery || 'you'}"</Text>
              {mockResults.map((spot) => (
                <TouchableOpacity key={spot.id} style={styles.resultCard} activeOpacity={0.8}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.spotName}>{spot.name}</Text>
                    <Text style={styles.spotPrice}>{spot.price}</Text>
                  </View>
                  <View style={styles.cardFooter}>
                    <View style={styles.badgeContainer}>
                      <Ionicons name="location-outline" size={14} color={COLORS.cloudWhite} />
                      <Text style={styles.badgeText}>{spot.distance}</Text>
                    </View>
                    <View style={[styles.badgeContainer, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                      <Text style={[styles.badgeText, { color: COLORS.success, marginLeft: 0 }]}>
                        {spot.spots} spots left
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
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
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
  },
  searchContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
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
    marginBottom: SPACING.md,
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
});
