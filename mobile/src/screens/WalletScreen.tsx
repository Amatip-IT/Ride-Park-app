import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  SafeAreaView, ActivityIndicator, Alert, Modal, TextInput, RefreshControl,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { paymentsApi, walletApi } from '@/api';
import { formatCurrency, formatDate, formatTime, getApiErrorMessage } from '@/utils/helpers';

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

type WalletTransaction = {
  _id: string;
  type: 'deposit' | 'withdrawal' | 'earning';
  amount: number;
  status: string;
  description?: string;
  createdAt: string;
};

const TX_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  deposit: { label: 'Top up', icon: 'add-circle', color: COLORS.success },
  withdrawal: { label: 'Withdrawal', icon: 'arrow-up-circle', color: COLORS.amber },
  earning: { label: 'Earning', icon: 'cash', color: COLORS.info },
};

export function WalletScreenContent() {
  const [paymentMethods, setPaymentMethods] = React.useState<any[]>([]);
  const [transactions, setTransactions] = React.useState<WalletTransaction[]>([]);
  const [loadingMethods, setLoadingMethods] = React.useState(true);
  const [loadingTransactions, setLoadingTransactions] = React.useState(true);
  const [addingCard, setAddingCard] = React.useState(false);
  const [toppingUp, setToppingUp] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [walletBalance, setWalletBalance] = React.useState(0);
  const [isTopUpModalVisible, setTopUpModalVisible] = React.useState(false);
  const [topUpAmount, setTopUpAmount] = React.useState('');
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const stripeConfigured = Boolean(STRIPE_PUBLISHABLE_KEY);

  React.useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else {
      setLoadingMethods(true);
      setLoadingTransactions(true);
    }
    setLoadError(null);

    const [methodsResult, walletResult, txResult] = await Promise.allSettled([
      paymentsApi.getPaymentMethods(),
      walletApi.getWalletInfo(),
      walletApi.getTransactions(),
    ]);

    if (methodsResult.status === 'fulfilled' && methodsResult.value.data?.success) {
      setPaymentMethods(methodsResult.value.data.data || []);
    } else if (methodsResult.status === 'rejected') {
      setLoadError(getApiErrorMessage(methodsResult.reason, 'Failed to load payment methods'));
    }

    if (walletResult.status === 'fulfilled' && walletResult.value.data?.success) {
      setWalletBalance(walletResult.value.data.data.balance || 0);
    } else if (walletResult.status === 'rejected') {
      setLoadError(getApiErrorMessage(walletResult.reason, 'Failed to load wallet balance'));
    }

    if (txResult.status === 'fulfilled' && txResult.value.data?.success) {
      setTransactions(txResult.value.data.data || []);
    }

    setLoadingMethods(false);
    setLoadingTransactions(false);
    setRefreshing(false);
  };

  const openTopUpModal = () => {
    if (paymentMethods.length === 0) {
      Alert.alert(
        'Add a card first',
        'You need a saved payment method before topping up your wallet.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add card', onPress: handleAddCard },
        ],
      );
      return;
    }
    setTopUpModalVisible(true);
  };

  const submitTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than zero.');
      return;
    }

    try {
      setToppingUp(true);
      const res = await walletApi.topUp(amount);
      if (res.data?.success) {
        Alert.alert('Success', 'Wallet topped up successfully!');
        setTopUpModalVisible(false);
        setTopUpAmount('');
        await loadWalletData();
      } else {
        Alert.alert('Top up failed', res.data?.message || 'Unable to complete top up.');
      }
    } catch (err: unknown) {
      Alert.alert('Top up failed', getApiErrorMessage(err, 'Failed to top up. Please ensure you have a default card added.'));
    } finally {
      setToppingUp(false);
    }
  };

  const handleAddCard = async () => {
    if (!stripeConfigured) {
      Alert.alert(
        'Payments unavailable',
        'Stripe is not configured for this build. Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in your environment.',
      );
      return;
    }

    if (addingCard) return;

    try {
      setAddingCard(true);
      const res = await paymentsApi.createSetupIntent();
      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Failed to initialize card setup');
      }

      const { setupIntent, ephemeralKey, customer } = res.data.data;
      if (!setupIntent || !ephemeralKey || !customer) {
        throw new Error('Stripe setup response is incomplete. Please try again.');
      }

      const initRes = await initPaymentSheet({
        merchantDisplayName: 'Gleezip',
        customerId: customer,
        customerEphemeralKeySecret: ephemeralKey,
        setupIntentClientSecret: setupIntent,
        allowsDelayedPaymentMethods: false,
        returnURL: 'rideandpark://stripe-redirect',
      });

      if (initRes.error) {
        Alert.alert('Could not open payment form', initRes.error.message);
        return;
      }

      const presentRes = await presentPaymentSheet();
      if (presentRes.error) {
        if (presentRes.error.code !== 'Canceled') {
          Alert.alert('Card setup failed', presentRes.error.message);
        }
      } else {
        Alert.alert('Success', 'Your payment method has been securely saved!');
        await loadWalletData();
      }
    } catch (err: unknown) {
      Alert.alert('Could not add card', getApiErrorMessage(err, 'Something went wrong while saving your card.'));
    } finally {
      setAddingCard(false);
    }
  };

  const getCardIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'visa':
      case 'mastercard':
        return 'card';
      default:
        return 'card-outline';
    }
  };

  const renderTransaction = (tx: WalletTransaction) => {
    const meta = TX_LABELS[tx.type] || { label: tx.type, icon: 'swap-horizontal' as const, color: COLORS.textSecondary };
    const isCredit = tx.type === 'deposit' || tx.type === 'earning';
    const sign = isCredit ? '+' : '-';

    return (
      <View key={tx._id} style={styles.txRow}>
        <View style={[styles.txIcon, { backgroundColor: `${meta.color}22` }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={styles.txInfo}>
          <Text style={styles.txTitle}>{tx.description || meta.label}</Text>
          <Text style={styles.txDate}>
            {formatDate(tx.createdAt)} · {formatTime(tx.createdAt)}
          </Text>
        </View>
        <View style={styles.txAmountCol}>
          <Text style={[styles.txAmount, { color: isCredit ? COLORS.success : COLORS.textPrimary }]}>
            {sign}{formatCurrency(tx.amount)}
          </Text>
          <Text style={styles.txStatus}>{tx.status}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Wallet</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadWalletData(true)} tintColor={COLORS.electricTeal} />
          }
        >
          {!stripeConfigured && (
            <View style={styles.warningBanner}>
              <Ionicons name="warning-outline" size={18} color={COLORS.amber} />
              <Text style={styles.warningText}>
                Card payments need Stripe configured (EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY).
              </Text>
            </View>
          )}

          {loadError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={COLORS.coralRed} />
              <Text style={styles.errorBannerText}>{loadError}</Text>
              <TouchableOpacity onPress={() => loadWalletData()}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceAmount}>{formatCurrency(walletBalance)}</Text>
            <TouchableOpacity style={styles.topUpBtn} onPress={openTopUpModal} activeOpacity={0.8}>
              <Text style={styles.topUpText}>Top Up</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Methods</Text>
          </View>

          {loadingMethods ? (
            <ActivityIndicator size="small" color={COLORS.electricTeal} style={{ marginVertical: 20 }} />
          ) : paymentMethods.length === 0 ? (
            <Text style={styles.emptyHint}>No payment methods saved yet. Add a card to top up your wallet.</Text>
          ) : (
            paymentMethods.map((method, index) => (
              <View key={method.id} style={styles.paymentCard}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                  <Ionicons name={getCardIcon(method.brand) as any} size={28} color={COLORS.info} />
                </View>

                <View style={styles.methodInfo}>
                  <Text style={styles.methodName}>
                    {method.brand?.toUpperCase()} ending in {method.last4}
                  </Text>
                  <Text style={styles.methodExpiry}>
                    Expires {method.expMonth}/{method.expYear}
                  </Text>
                </View>

                {index === 0 && (
                  <View style={[styles.badgeContainer, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                    <Text style={[styles.badgeText, { color: COLORS.success }]}>Default</Text>
                  </View>
                )}
              </View>
            ))
          )}

          <TouchableOpacity
            style={[styles.addCardBtn, addingCard && { opacity: 0.6 }]}
            onPress={handleAddCard}
            disabled={addingCard}
            activeOpacity={0.8}
          >
            {addingCard ? (
              <ActivityIndicator color={COLORS.electricTeal} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={24} color={COLORS.electricTeal} />
                <Text style={styles.addCardText}>Add Payment Method</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={[styles.sectionHeader, { marginTop: SPACING.xl }]}>
            <Text style={styles.sectionTitle}>Transaction History</Text>
          </View>

          {loadingTransactions ? (
            <ActivityIndicator size="small" color={COLORS.electricTeal} style={{ marginVertical: 16 }} />
          ) : transactions.length === 0 ? (
            <Text style={styles.emptyHint}>No transactions yet. Top-ups and payments will appear here.</Text>
          ) : (
            transactions.map(renderTransaction)
          )}

          <View style={styles.infoRow}>
            <Ionicons name="lock-closed-outline" size={16} color={COLORS.textTertiary} />
            <Text style={styles.infoText}>
              Your payment information is securely processed by Stripe. We never store your full card details.
            </Text>
          </View>
        </ScrollView>
      </View>

      <Modal visible={isTopUpModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Top Up Wallet</Text>
            <Text style={styles.modalSubtitle}>
              Enter the amount to charge your default card and add to your wallet balance.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Amount (£)"
              keyboardType="decimal-pad"
              value={topUpAmount}
              onChangeText={setTopUpAmount}
              placeholderTextColor={COLORS.textTertiary}
              editable={!toppingUp}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setTopUpModalVisible(false)}
                disabled={toppingUp}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtnSubmit, toppingUp && { opacity: 0.7 }]}
                onPress={submitTopUp}
                disabled={toppingUp}
              >
                {toppingUp ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.modalBtnSubmitText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export function WalletScreen() {
  return <WalletScreenContent />;
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
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: BORDER_RADIUS.md,
  },
  warningText: {
    flex: 1,
    color: COLORS.amber,
    fontSize: 13,
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderRadius: BORDER_RADIUS.md,
  },
  errorBannerText: {
    flex: 1,
    color: COLORS.coralRed,
    fontSize: 13,
  },
  retryText: {
    color: COLORS.electricTeal,
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: 13,
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
  emptyHint: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 20,
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
    minHeight: 56,
  },
  addCardText: {
    color: COLORS.electricTeal,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: SPACING.sm,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  txInfo: {
    flex: 1,
  },
  txTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  txDate: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  txAmountCol: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.bold,
  },
  txStatus: {
    fontSize: 11,
    color: COLORS.textTertiary,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: SPACING.lg,
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  infoText: {
    flex: 1,
    color: COLORS.textTertiary,
    fontSize: 12,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xl,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalBtnCancelText: {
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: 16,
  },
  modalBtnSubmit: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.electricTeal,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  modalBtnSubmitText: {
    color: '#FFF',
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: 16,
  },
});
