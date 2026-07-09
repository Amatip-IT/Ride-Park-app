import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '@/constants/theme';
import {
  searchLocationByText,
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
  minChars = 3,
  debounceMs = 300,
  style,
  ...textInputProps
}: LocationAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (text: string) => {
      onChangeText(text);

      if (searchTimeout.current) clearTimeout(searchTimeout.current);

      if (text.trim().length < minChars) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      searchTimeout.current = setTimeout(async () => {
        const results = await searchLocationByText(text, searchOptions);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      }, debounceMs);
    },
    [onChangeText, minChars, debounceMs, searchOptions],
  );

  const handleSelect = useCallback(
    (place: PlaceSuggestion) => {
      onSelectPlace(place);
      setShowSuggestions(false);
      setSuggestions([]);
    },
    [onSelectPlace],
  );

  return (
    <View style={[{ zIndex: 10 }, containerStyle]}>
      <TextInput
        {...textInputProps}
        style={style}
        value={value}
        onChangeText={handleChange}
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true);
        }}
      />

      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={suggestions}
            keyExtractor={(_, i) => `place-${i}`}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionItem}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="location-outline"
                  size={16}
                  color={COLORS.electricTeal}
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
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  suggestionsContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: -SPACING.sm + 2,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  suggestionText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.small,
    lineHeight: 18,
  },
  suggestionSub: {
    color: COLORS.textTertiary,
    fontSize: FONT_SIZES.small,
    marginTop: 2,
  },
});
