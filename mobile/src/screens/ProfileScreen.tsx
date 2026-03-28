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
          {user?.role === 'parking_provider' && (
            <>
              <Text style={styles.sectionTitle}>Provider Tools</Text>
              <View style={styles.menuContainer}>
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
          
          <Text style={styles.versionText}>Ride & Park App v1.0.0</Text>

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
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    color: COLORS.cloudWhite,
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
    color: COLORS.deepNavy,
    fontSize: 32,
    fontWeight: FONT_WEIGHTS.bold,
  },
  infoWrapper: {
    flex: 1,
  },
  userName: {
    color: COLORS.cloudWhite,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  userPhone: {
    color: COLORS.softSlate,
    fontSize: 14,
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: 'rgba(0, 194, 168, 0.15)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
  },
  roleBadgeText: {
    color: COLORS.electricTeal,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.steelBlue,
    marginVertical: SPACING.xl,
  },
  sectionTitle: {
    color: COLORS.softSlate,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING.md,
    marginLeft: SPACING.sm,
    textTransform: 'uppercase',
  },
  menuContainer: {
    backgroundColor: COLORS.steelBlue,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING['2xl'],
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
    color: COLORS.cloudWhite,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.medium,
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginLeft: 76,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
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
    color: COLORS.softSlate,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
});
