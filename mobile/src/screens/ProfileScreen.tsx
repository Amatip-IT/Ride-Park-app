import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, SafeAreaView, Alert, Image, Switch } from 'react-native';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/index';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useNavigation } from '@react-navigation/native';

export function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const { isDarkMode, toggleDarkMode } = useUIStore();
  const colors = useThemeColors();
  const navigation = useNavigation<any>();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() }
    ]);
  };

  const roleLabel =
    user?.role === 'parking_provider' ? 'Park Owner' :
    user?.role === 'driver' ? 'Private Driver' :
    user?.role === 'taxi_driver' ? 'Taxi Driver' :
    user?.role === 'admin' ? 'Admin' : 'Consumer';

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
              {user?.profileImageUrl ? (
                <Image source={{ uri: user.profileImageUrl }} style={{ width: 80, height: 80, borderRadius: 40 }} />
              ) : (
                <Text style={styles.avatarText}>
                  {user?.firstName?.charAt(0).toUpperCase() || 'E'}
                  {user?.lastName?.charAt(0).toUpperCase() || ''}
                </Text>
              )}
            </View>
            <View style={styles.infoWrapper}>
              <Text style={styles.userName}>
                {user?.firstName || 'Explorer'} {user?.lastName || 'User'}
              </Text>
              <Text style={styles.userPhone}>{user?.phoneNumber || '+44 0000 000 000'}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{roleLabel}</Text>
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
                    <View style={[styles.menuIconWrapper, { backgroundColor: `${colors.electricTeal}20` }]}>
                      <Ionicons name="shield-checkmark-outline" size={22} color={colors.electricTeal} />
                    </View>
                    <Text style={styles.menuTitle}>Manage Space & Verification</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.softSlate} />
                  </TouchableOpacity>
                )}

                {(user?.role === 'driver' || user?.role === 'taxi_driver') && (
                  <TouchableOpacity 
                    style={styles.menuItem} 
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('DriverVerification')}
                  >
                    <View style={[styles.menuIconWrapper, { backgroundColor: `${colors.amber}20` }]}>
                      <Ionicons name="document-text-outline" size={22} color={colors.amber} />
                    </View>
                    <Text style={styles.menuTitle}>Manage Requirements & Documents</Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.softSlate} />
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Menu Items */}
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => navigation.navigate('EditProfile')}>
              <View style={[styles.menuIconWrapper, { backgroundColor: `${colors.info}20` }]}>
                <Ionicons name="person-outline" size={22} color={colors.info} />
              </View>
              <Text style={styles.menuTitle}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.softSlate} />
            </TouchableOpacity>
            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => navigation.navigate('Disputes')}>
              <View style={[styles.menuIconWrapper, { backgroundColor: `${colors.coralRed}20` }]}>
                <Ionicons name="help-buoy-outline" size={22} color={colors.coralRed} />
              </View>
              <Text style={styles.menuTitle}>Help & Disputes</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.softSlate} />
            </TouchableOpacity>
            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => navigation.navigate('Notifications')}>
              <View style={[styles.menuIconWrapper, { backgroundColor: `${colors.amber}20` }]}>
                <Ionicons name="notifications-outline" size={22} color={colors.amber} />
              </View>
              <Text style={styles.menuTitle}>Notifications</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.softSlate} />
            </TouchableOpacity>
            <View style={styles.menuDivider} />

            <View style={styles.menuItem}>
              <View style={[styles.menuIconWrapper, { backgroundColor: `${colors.info}20` }]}>
                <Ionicons name="moon-outline" size={22} color={colors.info} />
              </View>
              <Text style={styles.menuTitle}>Dark Mode</Text>
              <Switch
                value={isDarkMode}
                onValueChange={toggleDarkMode}
                trackColor={{ false: colors.border, true: colors.electricTeal }}
                thumbColor="#FFF"
              />
            </View>
            <View style={styles.menuDivider} />

            <TouchableOpacity 
              style={styles.menuItem} 
              activeOpacity={0.7} 
              onPress={() => navigation.navigate('LegalDocument', { documentType: 'privacy' })}
            >
              <View style={[styles.menuIconWrapper, { backgroundColor: `${colors.success}20` }]}>
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.success} />
              </View>
              <Text style={styles.menuTitle}>Privacy & Security</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.softSlate} />
            </TouchableOpacity>
            <View style={styles.menuDivider} />

            <TouchableOpacity 
              style={styles.menuItem} 
              activeOpacity={0.7} 
              onPress={() => navigation.navigate('LegalDocument', { documentType: 'help' })}
            >
              <View style={[styles.menuIconWrapper, { backgroundColor: `${colors.softSlate}20` }]}>
                <Ionicons name="help-circle-outline" size={22} color={colors.softSlate} />
              </View>
              <Text style={styles.menuTitle}>Help & Support</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.softSlate} />
            </TouchableOpacity>
          </View>

          {/* Logout App Button */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={22} color={colors.error} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          
          <Text style={styles.versionText}>GleeZip App v1.0.0</Text>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.textPrimary,
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
    backgroundColor: colors.electricTeal,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.lg,
    elevation: 5,
    shadowColor: colors.electricTeal,
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
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  userPhone: {
    color: colors.textSecondary,
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
    color: colors.electricTeal,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: SPACING.xl,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    marginLeft: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
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
    color: colors.error,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: SPACING.sm,
  },
  versionText: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
});
