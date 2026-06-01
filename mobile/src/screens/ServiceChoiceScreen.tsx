import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp, useRoute, RouteProp } from '@react-navigation/native';

type ServiceMode = 'driver' | 'taxi';

type Params = {
  ServiceChoice: { mode: ServiceMode };
};

const CONFIG: Record<ServiceMode, {
  title: string;
  searchTitle: string;
  searchDesc: string;
  searchIcon: keyof typeof Ionicons.glyphMap;
  requestTitle: string;
  requestDesc: string;
  requestIcon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = {
  driver: {
    title: 'Book a Driver',
    searchTitle: 'Search for a Driver',
    searchDesc: 'Browse available professional drivers in your area.',
    searchIcon: 'search',
    requestTitle: 'Submit a Request',
    requestDesc: 'Tell us your location, duration, and timing — we\'ll match you with a driver.',
    requestIcon: 'paper-plane',
    color: COLORS.info,
  },
  taxi: {
    title: 'Hire a Taxi',
    searchTitle: 'Search for a Taxi',
    searchDesc: 'Browse available taxis near you.',
    searchIcon: 'search',
    requestTitle: 'Request a Taxi',
    requestDesc: 'Enter your pickup and destination — nearby drivers will be notified instantly.',
    requestIcon: 'navigate',
    color: COLORS.amber,
  },
};

export function ServiceChoiceScreen() {
  const navigation = useNavigation<NavigationProp<any>>();
  const route = useRoute<RouteProp<Params, 'ServiceChoice'>>();
  const mode = route.params?.mode || 'driver';
  const config = CONFIG[mode];

  const handleSearch = () => {
    navigation.navigate('Search', { serviceType: mode });
  };

  const handleRequest = () => {
    if (mode === 'taxi') {
      navigation.navigate('TaxiBooking');
    } else {
      navigation.navigate('DriverRequest');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{config.title}</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle}>How would you like to proceed?</Text>

        {/* Choice Cards */}
        <View style={styles.cardsContainer}>
          {/* Search Option */}
          <TouchableOpacity style={styles.choiceCard} onPress={handleSearch} activeOpacity={0.7}>
            <View style={[styles.iconCircle, { backgroundColor: `${config.color}15` }]}>
              <Ionicons name={config.searchIcon} size={32} color={config.color} />
            </View>
            <Text style={styles.choiceTitle}>{config.searchTitle}</Text>
            <Text style={styles.choiceDesc}>{config.searchDesc}</Text>
            <View style={[styles.actionPill, { backgroundColor: config.color }]}>
              <Text style={styles.actionPillText}>Browse</Text>
              <Ionicons name="chevron-forward" size={16} color="#FFF" />
            </View>
          </TouchableOpacity>

          {/* Request Option */}
          <TouchableOpacity style={styles.choiceCard} onPress={handleRequest} activeOpacity={0.7}>
            <View style={[styles.iconCircle, { backgroundColor: `${config.color}15` }]}>
              <Ionicons name={config.requestIcon} size={32} color={config.color} />
            </View>
            <Text style={styles.choiceTitle}>{config.requestTitle}</Text>
            <Text style={styles.choiceDesc}>{config.requestDesc}</Text>
            <View style={[styles.actionPill, { backgroundColor: config.color }]}>
              <Text style={styles.actionPillText}>Continue</Text>
              <Ionicons name="chevron-forward" size={16} color="#FFF" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: {
    color: COLORS.textPrimary, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },
  subtitle: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.body,
    textAlign: 'center', marginTop: SPACING.xl, marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  cardsContainer: {
    paddingHorizontal: SPACING.lg, gap: SPACING.lg,
  },
  choiceCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg,
  },
  choiceTitle: {
    color: COLORS.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs, textAlign: 'center',
  },
  choiceDesc: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.label, textAlign: 'center',
    lineHeight: 20, marginBottom: SPACING.lg, paddingHorizontal: SPACING.md,
  },
  actionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.full,
  },
  actionPillText: {
    color: '#FFF', fontSize: FONT_SIZES.label, fontWeight: FONT_WEIGHTS.bold,
  },
});
