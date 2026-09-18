import React, { useCallback, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, BORDER_RADIUS, FONT_SIZES, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  searchLocationByText,
  getPlaceById,
  PlaceSuggestion,
  LocationSearchOptions,
} from '@/api/amazonLocation';

export type { PlaceSuggestion };

type LocationAutocompleteInputProps = Omit<TextInputProps, 'onChangeText' | 'value'> & {
  value: string;
  onChangeText: (text: string) => void;
  onSelectPlace: (place: PlaceSuggestion) => void;
  searchOptions?: LocationSearchOptions;
  containerStyle?: StyleProp<ViewStyle>;
  minChars?: number;
  debounceMs?: number;
};

export function LocationAutocompleteInput({
  value,
  onChangeText,
  onSelectPlace,
  searchOptions,
  containerStyle,
  minChars = 2,
  debounceMs = 300,
  style,
  ...textInputProps
}: LocationAutocompleteInputProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  // Stabilize options so typing isn't reset by new object identity each render
  const biasLat = searchOptions?.biasPosition?.lat;
  const biasLng = searchOptions?.biasPosition?.lng;
  const maxResults = searchOptions?.maxResults;
  const filterCountriesKey = searchOptions?.filterCountries?.join(',') ?? '';
  const stableSearchOptions = useMemo<LocationSearchOptions>(
    () => ({
      biasPosition:
        biasLat != null && biasLng != null ? { lat: biasLat, lng: biasLng } : undefined,
      maxResults,
      filterCountries: filterCountriesKey
        ? filterCountriesKey.split(',').filter(Boolean)
        : undefined,
    }),
    [biasLat, biasLng, maxResults, filterCountriesKey],
  );

  const handleChange = useCallback(
    (text: string) => {
      onChangeText(text);

      if (searchTimeout.current) clearTimeout(searchTimeout.current);

      if (text.trim().length < minChars) {
        setSuggestions([]);
        setShowSuggestions(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      const id = ++requestId.current;
      searchTimeout.current = setTimeout(async () => {
        const results = await searchLocationByText(text, stableSearchOptions);
        if (id !== requestId.current) return;
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setLoading(false);
      }, debounceMs);
    },
    [onChangeText, minChars, debounceMs, stableSearchOptions],
  );

  const handleSelect = useCallback(
    async (place: PlaceSuggestion) => {
      setShowSuggestions(false);
      setSuggestions([]);

      let resolved = place;
      if ((!place.point?.lat || !place.point?.lng) && place.placeId) {
        const full = await getPlaceById(place.placeId);
        if (full) resolved = full;
      }

      onSelectPlace(resolved);
    },
    [onSelectPlace],
  );

  return (
    <View style={[{ zIndex: 20, elevation: 20 }, containerStyle]}>
      <View>
        <TextInput
          {...textInputProps}
          style={style}
          value={value}
          onChangeText={handleChange}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {loading ? (
          <ActivityIndicator
            size="small"
            color={colors.electricTeal}
            style={styles.loadingIcon}
          />
        ) : null}
      </View>

      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          {suggestions.map((item, i) => (
            <TouchableOpacity
              key={item.placeId || `place-${i}`}
              style={styles.suggestionItem}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="location-outline"
                size={16}
                color={colors.electricTeal}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionText} numberOfLines={2}>
                  {item.label}
                </Text>
                {item.municipality || item.country ? (
                  <Text style={styles.suggestionSub} numberOfLines={1}>
                    {[item.municipality, item.country].filter(Boolean).join(', ')}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    loadingIcon: {
      position: 'absolute',
      right: 12,
      top: 14,
    },
    suggestionsContainer: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 4,
      marginBottom: SPACING.sm,
      overflow: 'hidden',
      zIndex: 30,
      elevation: 30,
    },
    suggestionItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    suggestionText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: FONT_SIZES.small,
      lineHeight: 18,
    },
    suggestionSub: {
      color: colors.textTertiary,
      fontSize: FONT_SIZES.small,
      marginTop: 2,
    },
  });
