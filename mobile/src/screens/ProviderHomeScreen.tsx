import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, SafeAreaView, RefreshControl,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { bookingsApi } from '@/api';

export function ProviderHomeScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<NavigationProp<any>>();
  const [stats, setStats] = useState({ pending: 0, accepted: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await bookingsApi.getProviderRequests();
      if (res.data?.success) {
        const requests = res.data.data || [];
        setStats({
          pending: requests.filter((r: any) => r.status === 'pending').length,
          accepted: requests.filter((r: any) => r.status === 'accepted').length,
          total: requests.length,
        });
      }
    } catch (err) {
      console.log('Failed to fetch stats:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  const roleLabel = user?.role === 'parking_provider'
    ? 'Park Owner'
    : user?.role === 'driver'
      ? 'Driver'
      : user?.role === 'taxi_driver'
        ? 'Taxi Driver'
        : 'Provider';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome, {user?.firstName || 'Provider'}</Text>
            <Text style={styles.roleTag}>{roleLabel} Dashboard</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={{ marginRight: SPACING.lg, padding: SPACING.xs }} 
              onPress={() => navigation.navigate('ChatList')}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={26} color={COLORS.cloudWhite} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ProviderProfile')} style={styles.profileBtn}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{user?.firstName?.charAt(0) || 'P'}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchStats(true)} tintColor={COLORS.electricTeal} />
          }
        >
          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: COLORS.amber }]}>{stats.pending}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: COLORS.success }]}>{stats.accepted}</Text>
              <Text style={styles.statLabel}>Accepted</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statNumber, { color: COLORS.electricTeal }]}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>

          {/* Pending alert */}
          {stats.pending > 0 && (
            <TouchableOpacity
              style={styles.alertCard}
              onPress={() => navigation.navigate('ProviderRequests')}
              activeOpacity={0.8}
            >
              <View style={styles.alertIcon}>
                <Ionicons name="notifications" size={24} color={COLORS.amber} />
              </View>
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>
                  {stats.pending} pending request{stats.pending > 1 ? 's' : ''}
                </Text>
                <Text style={styles.alertSubtext}>Tap to review and respond</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.softSlate} />
            </TouchableOpacity>
          )}

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('ProviderRequests')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
              <Ionicons name="mail-open" size={24} color={COLORS.info} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>View Requests</Text>
              <Text style={styles.actionSubtext}>Review and respond to booking requests</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.softSlate} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('ProviderEarnings')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Ionicons name="wallet" size={24} color={COLORS.success} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Earnings</Text>
              <Text style={styles.actionSubtext}>View your earnings and payment history</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.softSlate} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('ProviderVerification')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(243, 156, 18, 0.1)' }]}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.amber} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Verification</Text>
              <Text style={styles.actionSubtext}>Manage your documents and verification status</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.softSlate} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.deepNavy },
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: Platform.OS === 'ios' ? 10 : 40,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.steelBlue,
    borderBottomLeftRadius: BORDER_RADIUS.xl,
    borderBottomRightRadius: BORDER_RADIUS.xl,
  },
  greeting: {
    color: COLORS.cloudWhite, fontSize: FONT_SIZES.section, fontWeight: FONT_WEIGHTS.bold,
  },
  roleTag: { color: COLORS.electricTeal, fontSize: FONT_SIZES.label, marginTop: 4 },
  profileBtn: { padding: SPACING.xs },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.electricTeal,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: COLORS.deepNavy, fontSize: 18, fontWeight: 'bold' },

  scrollContent: { padding: SPACING.lg, paddingTop: SPACING.xl },

  // Stats
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  statCard: {
    flex: 1, backgroundColor: COLORS.steelBlue, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, alignItems: 'center',
  },
  statNumber: { fontSize: 28, fontWeight: FONT_WEIGHTS.bold, marginBottom: 4 },
  statLabel: { color: COLORS.softSlate, fontSize: FONT_SIZES.small },

  // Alert
  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(243, 156, 18, 0.1)',
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginBottom: SPACING.xl, borderWidth: 1, borderColor: 'rgba(243, 156, 18, 0.3)',
  },
  alertIcon: { marginRight: SPACING.md },
  alertContent: { flex: 1 },
  alertTitle: { color: COLORS.amber, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold },
  alertSubtext: { color: COLORS.softSlate, fontSize: FONT_SIZES.small, marginTop: 2 },

  // Section
  sectionTitle: {
    color: COLORS.cloudWhite, fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING.md,
  },

  // Action cards
  actionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.steelBlue, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
  },
  actionIcon: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  actionContent: { flex: 1 },
  actionTitle: { color: COLORS.cloudWhite, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold },
  actionSubtext: { color: COLORS.softSlate, fontSize: 13, marginTop: 2 },
});
