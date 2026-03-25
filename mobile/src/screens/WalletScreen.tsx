import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, SafeAreaView } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export function WalletScreen() {
  const paymentMethods = [
    { id: '1', type: 'Visa', last4: '4242', expiry: '12/26', isDefault: true },
    { id: '2', type: 'Mastercard', last4: '5555', expiry: '08/25', isDefault: false },
  ];

  const getCardIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'visa': return 'card';
      case 'mastercard': return 'card'; // using generalized icons since specific brand icons might not be in Ionicons
      default: return 'card-outline';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Wallet</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceAmount}>£0.00</Text>
            <TouchableOpacity style={styles.topUpBtn}>
              <Text style={styles.topUpText}>Top Up</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Methods</Text>
          </View>

          {paymentMethods.map((method) => (
            <View key={method.id} style={styles.paymentCard}>
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                <Ionicons name={getCardIcon(method.type) as any} size={28} color={COLORS.info} />
              </View>
              
              <View style={styles.methodInfo}>
                <Text style={styles.methodName}>{method.type} ending in {method.last4}</Text>
                <Text style={styles.methodExpiry}>Expires {method.expiry}</Text>
              </View>

              {method.isDefault ? (
                <View style={[styles.badgeContainer, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                  <Text style={[styles.badgeText, { color: COLORS.success }]}>Default</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.optionsBtn}>
                  <Ionicons name="ellipsis-vertical" size={20} color={COLORS.softSlate} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity style={styles.addCardBtn} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={24} color={COLORS.electricTeal} />
            <Text style={styles.addCardText}>Add Payment Method</Text>
          </TouchableOpacity>

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
  balanceCard: {
    backgroundColor: COLORS.electricTeal,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    alignItems: 'center',
    shadowColor: COLORS.electricTeal,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  balanceLabel: {
    color: 'rgba(13, 27, 42, 0.8)',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING.xs,
  },
  balanceAmount: {
    color: COLORS.deepNavy,
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.lg,
  },
  topUpBtn: {
    backgroundColor: COLORS.deepNavy,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
  },
  topUpText: {
    color: COLORS.cloudWhite,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  sectionHeader: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    color: COLORS.cloudWhite,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.steelBlue,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    color: COLORS.cloudWhite,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 2,
  },
  methodExpiry: {
    color: COLORS.softSlate,
    fontSize: 13,
  },
  optionsBtn: {
    padding: SPACING.sm,
  },
  badgeContainer: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 168, 0.3)',
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.lg,
  },
  addCardText: {
    color: COLORS.electricTeal,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.medium,
    marginLeft: SPACING.sm,
  },
});
