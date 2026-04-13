import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useStripe, StripeProvider } from '@stripe/stripe-react-native';
import { paymentsApi } from '@/api';

export function WalletScreenContent() {
  const [paymentMethods, setPaymentMethods] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  React.useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      setLoading(true);
      const res = await paymentsApi.getPaymentMethods();
      if (res.data?.success) {
        setPaymentMethods(res.data.data);
      }
    } catch (err) {
      console.log('Failed to fetch payment methods', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCard = async () => {
    try {
      // 1. Fetch setup intent from backend
      const res = await paymentsApi.createSetupIntent();
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to initialize card setup');
      
      const { setupIntent, ephemeralKey, customer } = res.data.data;

      // 2. Initialize Payment Sheet
      const initRes = await initPaymentSheet({
        merchantDisplayName: 'Ride and Park',
        customerId: customer,
        customerEphemeralKeySecret: ephemeralKey,
        setupIntentClientSecret: setupIntent,
        allowsDelayedPaymentMethods: false,
      });

      if (initRes.error) {
        Alert.alert('Error', initRes.error.message);
        return;
      }

      // 3. Present Payment Sheet
      const presentRes = await presentPaymentSheet();
      if (presentRes.error) {
        if (presentRes.error.code !== 'Canceled') {
          Alert.alert('Error', presentRes.error.message);
        }
      } else {
        Alert.alert('Success', 'Your payment method has been securely saved!');
        fetchPaymentMethods(); // Refresh list
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || err.message || 'Something went wrong');
    }
  };

  const getCardIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'visa': return 'card';
      case 'mastercard': return 'card';
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

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.electricTeal} style={{ marginVertical: 20 }} />
          ) : paymentMethods.length === 0 ? (
            <Text style={{ textAlign: 'center', color: COLORS.textSecondary, marginBottom: 20 }}>No payment methods securely saved yet.</Text>
          ) : (
            paymentMethods.map((method, index) => (
              <View key={method.id} style={styles.paymentCard}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                  <Ionicons name={getCardIcon(method.brand) as any} size={28} color={COLORS.info} />
                </View>
                
                <View style={styles.methodInfo}>
                  <Text style={styles.methodName}>{method.brand?.toUpperCase()} ending in {method.last4}</Text>
                  <Text style={styles.methodExpiry}>Expires {method.expMonth}/{method.expYear}</Text>
                </View>

                {index === 0 ? (
                  <View style={[styles.badgeContainer, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                    <Text style={[styles.badgeText, { color: COLORS.success }]}>Default</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.optionsBtn}>
                    <Ionicons name="ellipsis-vertical" size={20} color={COLORS.softSlate} />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}

          <TouchableOpacity style={styles.addCardBtn} onPress={handleAddCard} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={24} color={COLORS.electricTeal} />
            <Text style={styles.addCardText}>Add Payment Method</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

export function WalletScreen() {
  return (
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_mock'}
    >
      <WalletScreenContent />
    </StripeProvider>
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
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING.xs,
  },
  balanceAmount: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.lg,
  },
  topUpBtn: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
  },
  topUpText: {
    color: COLORS.electricTeal,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
  },
  sectionHeader: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  methodExpiry: {
    color: COLORS.textSecondary,
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
    fontWeight: FONT_WEIGHTS.bold,
  },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 160, 0.4)',
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  addCardText: {
    color: COLORS.electricTeal,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: SPACING.sm,
  },
});
