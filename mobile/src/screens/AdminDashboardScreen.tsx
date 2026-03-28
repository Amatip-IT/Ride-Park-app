import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

export function AdminDashboardScreen() {
  const navigation = useNavigation<NavigationProp<any>>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
      </View>
      
      <View style={styles.container}>
        <TouchableOpacity 
          style={styles.card}
          onPress={() => navigation.navigate('AdminVerificationQueue')}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="document-text-outline" size={32} color={COLORS.electricTeal} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Verification Queue</Text>
            <Text style={styles.cardDesc}>Review and approve new parking operators and chauffeurs.</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.softSlate} />
        </TouchableOpacity>

        {/* Future links could go here */}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.deepNavy,
  },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  headerTitle: {
    color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
  },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.steelBlue,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0, 194, 168, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  cardContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  cardTitle: {
    color: COLORS.cloudWhite,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  cardDesc: {
    color: COLORS.softSlate,
    fontSize: 14,
    lineHeight: 20,
  },
});
