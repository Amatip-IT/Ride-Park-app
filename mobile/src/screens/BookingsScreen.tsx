import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, SafeAreaView } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export function BookingsScreen() {
  const [activeTab, setActiveTab] = useState<'Upcoming' | 'Past'>('Upcoming');

  const upcomingBookings: any[] = [];
  const pastBookings: any[] = []; // empty datasets for now

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Bookings</Text>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'Upcoming' && styles.activeTab]} 
            onPress={() => setActiveTab('Upcoming')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'Upcoming' && styles.activeTabText]}>Upcoming</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'Past' && styles.activeTab]} 
            onPress={() => setActiveTab('Past')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'Past' && styles.activeTabText]}>Past</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {(activeTab === 'Upcoming' ? upcomingBookings : pastBookings).length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.iconCircle}>
                <Ionicons name="calendar-outline" size={48} color={COLORS.electricTeal} />
              </View>
              <Text style={styles.emptyStateTitle}>No {activeTab.toLowerCase()} bookings</Text>
              <Text style={styles.emptyStateSubtext}>
                {activeTab === 'Upcoming' 
                  ? "You don't have any parking or taxi reservations scheduled right now." 
                  : "You haven't made any bookings in the past yet."}
              </Text>
            </View>
          ) : (
             <></> /* Render real bookings here later */
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
    paddingBottom: SPACING.lg,
  },
  headerTitle: {
    color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.hero,
    fontWeight: FONT_WEIGHTS.bold,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.steelBlue,
  },
  tab: {
    paddingBottom: SPACING.md,
    marginRight: SPACING.xl,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: COLORS.electricTeal,
  },
  tabText: {
    color: COLORS.softSlate,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.medium,
  },
  activeTabText: {
    color: COLORS.electricTeal,
    fontWeight: FONT_WEIGHTS.semibold,
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
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 194, 168, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  emptyStateTitle: {
    color: COLORS.cloudWhite,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    color: COLORS.softSlate,
    fontSize: 16,
    textAlign: 'center',
    maxWidth: '85%',
    lineHeight: 24,
  },
});
