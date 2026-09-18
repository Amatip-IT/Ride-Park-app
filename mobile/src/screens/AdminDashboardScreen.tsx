import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { taxiBookingsApi } from '@/api';

type NavItem = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: 'electricTeal' | 'amber' | 'info' | 'warning' | 'success' | 'coralRed';
  route: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Verifications',
    items: [
      {
        title: 'Parking Verification',
        subtitle: 'Approve parking operator applications',
        icon: 'document-text-outline',
        colorKey: 'electricTeal',
        route: 'AdminVerificationQueue',
      },
      {
        title: 'Driver Verifications',
        subtitle: 'Driver and taxi document submissions',
        icon: 'car-sport-outline',
        colorKey: 'amber',
        route: 'AdminDriverQueue',
      },
      {
        title: 'Identity Documents',
        subtitle: 'ID and proof of address reviews',
        icon: 'id-card-outline',
        colorKey: 'info',
        route: 'AdminIdentityQueue',
      },
      {
        title: 'Expiring Documents',
        subtitle: 'Licence and insurance renewals',
        icon: 'alert-circle-outline',
        colorKey: 'warning',
        route: 'AdminExpiringDocuments',
      },
    ],
  },
  {
    title: 'Support & Money',
    items: [
      {
        title: 'Dispute Queue',
        subtitle: 'Review and resolve user complaints',
        icon: 'help-buoy-outline',
        colorKey: 'coralRed',
        route: 'AdminDisputes',
      },
      {
        title: 'Payouts Queue',
        subtitle: 'Approve provider withdrawals',
        icon: 'cash-outline',
        colorKey: 'success',
        route: 'AdminPayoutsQueue',
      },
      {
        title: 'Admin Messaging',
        subtitle: 'Send messages with delivery tracking',
        icon: 'mail-outline',
        colorKey: 'info',
        route: 'AdminMessaging',
      },
    ],
  },
  {
    title: 'Platform',
    items: [
      {
        title: 'Users',
        subtitle: 'View, suspend, or ban accounts',
        icon: 'people-outline',
        colorKey: 'info',
        route: 'AdminUsers',
      },
      {
        title: 'Analytics',
        subtitle: 'Revenue, users, and queue health',
        icon: 'bar-chart-outline',
        colorKey: 'success',
        route: 'AdminAnalytics',
      },
      {
        title: 'Audit Logs',
        subtitle: 'Admin actions and account changes',
        icon: 'shield-checkmark-outline',
        colorKey: 'electricTeal',
        route: 'AdminAuditLogs',
      },
      {
        title: 'Platform Settings',
        subtitle: 'Fees and configuration',
        icon: 'settings-outline',
        colorKey: 'coralRed',
        route: 'AdminPlatformSettings',
      },
    ],
  },
];

export function AdminDashboardScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NavigationProp<any>>();
  const { logout } = useAuthStore();
  const [activeRideCount, setActiveRideCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchActiveRideCount = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await taxiBookingsApi.getAdminActive();
      if (res.data?.success) {
        setActiveRideCount((res.data.data || []).length);
      }
    } catch (err) {
      console.log('Failed to fetch ride count:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchActiveRideCount();
      const interval = setInterval(() => fetchActiveRideCount(), 15000);
      return () => clearInterval(interval);
    }, []),
  );

  const handleLogout = async () => {
    await logout();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={22} color={colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchActiveRideCount(true)}
            tintColor={colors.electricTeal}
          />
        }
      >
        <TouchableOpacity
          style={styles.liveButton}
          onPress={() => navigation.navigate('AdminActiveRides')}
          activeOpacity={0.75}
        >
          <View style={styles.liveLeft}>
            <View style={styles.liveDot} />
            <View>
              <Text style={styles.liveTitle}>Active Ride Requests</Text>
              <Text style={styles.liveSub}>Live taxi and driver activity</Text>
            </View>
          </View>
          <View style={styles.liveRight}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeRideCount}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </View>
        </TouchableOpacity>

        {NAV_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, index) => {
                const tint = colors[item.colorKey];
                const isLast = index === section.items.length - 1;
                return (
                  <TouchableOpacity
                    key={item.route}
                    style={[styles.navRow, !isLast && styles.navRowBorder]}
                    onPress={() => navigation.navigate(item.route)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconContainer, { backgroundColor: `${tint}12` }]}>
                      <Ionicons name={item.icon} size={22} color={tint} />
                    </View>
                    <View style={styles.navContent}>
                      <Text style={styles.navTitle}>{item.title}</Text>
                      <Text style={styles.navSub} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.xl,
      paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.sm,
      paddingBottom: SPACING.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: FONT_SIZES.section,
      fontWeight: FONT_WEIGHTS.bold,
    },
    logoutButton: {
      padding: SPACING.sm,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: `${colors.error}10`,
    },
    scrollContent: {
      padding: SPACING.lg,
      paddingBottom: SPACING['3xl'],
    },

    liveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.xl,
      borderWidth: 1,
      borderColor: colors.amber,
      borderLeftWidth: 4,
    },
    liveLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      flex: 1,
      minWidth: 0,
    },
    liveDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.success,
    },
    liveTitle: {
      color: colors.textPrimary,
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
    },
    liveSub: {
      color: colors.textSecondary,
      fontSize: FONT_SIZES.small,
      marginTop: 2,
    },
    liveRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginLeft: SPACING.sm,
    },
    badge: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      paddingHorizontal: 8,
      backgroundColor: `${colors.amber}18`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      color: colors.amber,
      fontSize: 13,
      fontWeight: FONT_WEIGHTS.bold,
    },

    section: {
      marginBottom: SPACING.lg,
    },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: SPACING.sm,
      marginLeft: 2,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
    },
    navRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.md,
    },
    navContent: { flex: 1, marginRight: SPACING.sm, minWidth: 0 },
    navTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    navSub: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
      lineHeight: 16,
    },
  });
