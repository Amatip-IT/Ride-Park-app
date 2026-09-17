import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  CONTINENTS,
  COUNTRIES_BY_CONTINENT,
  searchCountries,
  Country,
  Continent,
} from '@/constants/countries';

type CountryPickerProps = {
  value: string;
  onChange: (countryName: string) => void;
  placeholder?: string;
};

export function CountryPicker({ value, onChange, placeholder = 'Select country' }: CountryPickerProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCountries = useMemo(() => searchCountries(searchQuery), [searchQuery]);

  const groupedData = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredCountries.map((country) => ({ type: 'country' as const, country }));
    }

    const sections: Array<
      | { type: 'header'; continent: Continent }
      | { type: 'country'; country: Country }
    > = [];

    for (const continent of CONTINENTS) {
      sections.push({ type: 'header', continent });
      for (const country of COUNTRIES_BY_CONTINENT[continent]) {
        sections.push({ type: 'country', country });
      }
    }
    return sections;
  }, [searchQuery, filteredCountries]);

  const handleSelect = (country: Country) => {
    onChange(country.name);
    setVisible(false);
    setSearchQuery('');
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.triggerText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select country</Text>
            <TouchableOpacity onPress={() => setVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search countries..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={groupedData}
            keyExtractor={(item, index) =>
              item.type === 'header' ? `header-${item.continent}` : `country-${item.country.iso3}-${index}`
            }
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <View style={styles.continentHeader}>
                    <Text style={styles.continentText}>{item.continent}</Text>
                  </View>
                );
              }

              const selected = item.country.name === value;
              return (
                <TouchableOpacity
                  style={[styles.countryRow, selected && styles.countryRowSelected]}
                  onPress={() => handleSelect(item.country)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.countryName, selected && styles.countryNameSelected]}>
                    {item.country.name}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark" size={20} color={colors.electricTeal} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: SPACING.lg,
    height: 50,
  },
  triggerText: {
    color: colors.textPrimary,
    fontSize: FONT_SIZES.body,
    flex: 1,
  },
  placeholder: {
    color: colors.textTertiary,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold as any,
    color: colors.textPrimary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    margin: SPACING.lg,
    paddingHorizontal: SPACING.md,
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: colors.border,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: FONT_SIZES.body,
  },
  continentHeader: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    backgroundColor: colors.background,
  },
  continentText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  countryRowSelected: {
    backgroundColor: `${colors.electricTeal}12`,
  },
  countryName: {
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
  },
  countryNameSelected: {
    color: colors.electricTeal,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
});
