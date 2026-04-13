import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, SafeAreaView, Alert } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useNavigation } from '@react-navigation/native';

export function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<any>();

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() }
    ]);
  };

  const menuItems = [
    { id: '1', title: 'Edit Profile', icon: 'person-outline', color: COLORS.info },
    { id: '2', title: 'Notifications', icon: 'notifications-outline', color: COLORS.amber },
    { id: '3', title: 'Switch to Provider', icon: 'car-sport-outline', color: COLORS.success }, // Good for demo transition
    { id: '4', title: 'Help & Support', icon: 'help-circle-outline', color: COLORS.softSlate },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Avatar and Info */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {user?.firstName?.charAt(0).toUpperCase() || 'E'}
                {user?.lastName?.charAt(0).toUpperCase() || ''}
              </Text>
            </View>
            <View style={styles.infoWrapper}>
              <Text style={styles.userName}>
                {user?.firstName || 'Explorer'} {user?.lastName || 'User'}
              </Text>
              <Text style={styles.userPhone}>{user?.phoneNumber || '+44 0000 000 000'}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>Consumer</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Provider Specific Settings */}
          {(user?.role === 'parking_provider' || user?.role === 'driver' || user?.role === 'taxi_driver') && (
            <>
              <Text style={styles.sectionTitle}>Provider Tools</Text>
              <View style={styles.menuContainer}>
                {user?.role === 'parking_provider' && (
                  <TouchableOpacity 
                    style={styles.menuItem} 
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('ProviderVerification')}
                  >
                    <View style={[styles.menuIconWrapper, { backgroundColor: `${COLORS.electricTeal}20` }]}>
                      <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.electricTeal} />
                    </View>
                    <Text style={styles.menuTitle}>Manage Space & Verification</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.softSlate} />
                  </TouchableOpacity>
                )}

                {(user?.role === 'driver' || user?.role === 'taxi_driver') && (
                  <TouchableOpacity 
                    style={styles.menuItem} 
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('DriverVerification')}
                  >
                    <View style={[styles.menuIconWrapper, { backgroundColor: `${COLORS.amber}20` }]}>
                      <Ionicons name="document-text-outline" size={22} color={COLORS.amber} />
                    </View>
                    <Text style={styles.menuTitle}>Manage Requirements & Documents</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.softSlate} />
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Menu Items */}
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.menuContainer}>
            {menuItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
                  <View style={[styles.menuIconWrapper, { backgroundColor: `${item.color}20` }]}>
                    <Ionicons name={item.icon as any} size={22} color={item.color} />
                  </View>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.softSlate} />
                </TouchableOpacity>
                {index < menuItems.length - 1 && <View style={styles.menuDivider} />}
              </React.Fragment>
            ))}
          </View>

          {/* Logout App Button */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.error} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          
          <Text style={styles.versionText}>GleeZip App v1.0.0</Text>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.hero,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scrollContent: {
    padding: SPACING.lg,
    flexGrow: 1,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.electricTeal,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.lg,
    elevation: 5,
    shadowColor: COLORS.electricTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: FONT_WEIGHTS.bold,
  },
  infoWrapper: {
    flex: 1,
  },
  userName: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  userPhone: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: 'rgba(0, 180, 160, 0.15)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
  },
  roleBadgeText: {
    color: COLORS.electricTeal,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xl,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    marginLeft: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING['2xl'],
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  menuIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  menuTitle: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 76,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: 'rgba(231, 76, 60, 0.08)',
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.xl,
  },
  logoutText: {
    color: COLORS.error,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: SPACING.sm,
  },
  versionText: {
    color: COLORS.textTertiary,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
});
