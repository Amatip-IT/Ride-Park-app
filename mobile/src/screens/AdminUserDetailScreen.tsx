import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { adminApi } from '@/api';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useAdminDashboardBack } from '@/components/admin/AdminScreenLayout';

type TabId = 'overview' | 'bookings' | 'payments' | 'activity';

type ParamList = {
  AdminUserDetail: { userId: string };
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'payments', label: 'Payments' },
  { id: 'activity', label: 'Activity' },
];

function personName(p?: any) {
  if (!p) return '—';
  if (typeof p === 'string') return p;
  return `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email || '—';
}

function formatDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function money(amount?: number) {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) return '—';
  return `£${Number(amount).toFixed(2)}`;
}

export function AdminUserDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const goUsers = useAdminDashboardBack();
  const route = useRoute<RouteProp<ParamList, 'AdminUserDetail'>>();
  const userId = route.params.userId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<any>(null);
  const [tab, setTab] = useState<TabId>('overview');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getUserDossier(userId);
      if (res.data?.success) {
        setDossier(res.data.data);
      } else {
        setError(res.data?.message || 'Failed to load user');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load user');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const profile = dossier?.profile;
  const fullName = profile
    ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User'
    : 'User';

  const roleLabel = (() => {
    switch (profile?.role) {
      case 'taxi_driver': return 'Taxi Driver';
      case 'parking_provider': return 'Park Owner';
      case 'driver': return 'Driver';
      case 'admin': return 'Admin';
      default: return 'General User';
    }
  })();

  const status = profile?.accountStatus || 'active';

  const renderOverview = () => (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>Account</Text>
      <DetailRow label="Email" value={profile?.email} />
      <DetailRow label="Phone" value={profile?.phoneNumber} />
      <DetailRow label="Username" value={profile?.username} />
      <DetailRow label="Role" value={roleLabel} />
      <DetailRow label="Status" value={status} />
      <DetailRow label="Joined" value={formatDate(profile?.createdAt)} />
      {profile?.suspensionReason && (
        <DetailRow label="Suspension reason" value={profile.suspensionReason} />
      )}

      <Text style={styles.sectionTitle}>Address</Text>
      <DetailRow label="Postcode" value={profile?.postCode} />
      <DetailRow
        label="Location"
        value={[profile?.address?.street, profile?.address?.town, profile?.address?.county, profile?.address?.country]
          .filter(Boolean)
          .join(', ') || undefined}
      />

      <Text style={styles.sectionTitle}>Verification</Text>
      <DetailRow label="Identity status" value={profile?.identityStatus || '—'} />
      <DetailRow
        label="Email verified"
        value={profile?.isVerified?.email || profile?.isEmailVerified ? 'Yes' : 'No'}
      />

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() =>
            navigation.navigate('AdminMessaging', {
              userId,
              userName: fullName,
            })
          }
        >
          <Ionicons name="mail-outline" size={18} color={colors.info} />
          <Text style={[styles.quickBtnText, { color: colors.info }]}>Message</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderBookings = () => {
    const bookings = dossier?.bookings || [];
    const rides = dossier?.rides || [];
    if (!bookings.length && !rides.length) {
      return <EmptyState text="No bookings or rides for this user." />;
    }
    return (
      <View style={styles.sectionBlock}>
        {bookings.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Bookings ({bookings.length})</Text>
            {bookings.map((b: any) => (
              <View key={b._id} style={styles.listCard}>
                <View style={styles.listCardHeader}>
                  <Text style={styles.listCardTitle}>
                    {(b.serviceType || 'booking').toUpperCase()}
                  </Text>
                  <StatusChip status={b.status} />
                </View>
                <Text style={styles.listCardSub}>
                  {personName(b.requester)} → {personName(b.provider)}
                </Text>
                {b.serviceName ? (
                  <Text style={styles.listCardMeta}>{b.serviceName}</Text>
                ) : null}
                <Text style={styles.listCardMeta}>
                  {money(b.quotedPrice)} · {formatDate(b.createdAt)}
                </Text>
                {b.paymentStatus ? (
                  <Text style={styles.listCardMeta}>Payment: {b.paymentStatus}</Text>
                ) : null}
              </View>
            ))}
          </>
        )}
        {rides.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Taxi rides ({rides.length})</Text>
            {rides.map((r: any) => (
              <View key={r._id} style={styles.listCard}>
                <View style={styles.listCardHeader}>
                  <Text style={styles.listCardTitle}>TAXI</Text>
                  <StatusChip status={r.status} />
                </View>
                <Text style={styles.listCardSub} numberOfLines={2}>
                  {r.pickupPostcode || r.pickupAddress || 'Pickup'} →{' '}
                  {r.destinationAddress || r.destinationPostcode || 'Destination'}
                </Text>
                <Text style={styles.listCardMeta}>
                  Passenger: {personName(r.passenger)}
                </Text>
                <Text style={styles.listCardMeta}>
                  Driver: {personName(r.acceptedDriver || r.targetDriver)}
                </Text>
                <Text style={styles.listCardMeta}>{formatDate(r.createdAt)}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    );
  };

  const renderPayments = () => {
    const wallet = dossier?.wallet;
    const txs = dossier?.transactions || [];
    const bookingPayments = (dossier?.bookings || []).filter(
      (b: any) => b.paymentIntentId || b.quotedPrice || b.paymentStatus,
    );
    const ridePayments = (dossier?.rides || []).filter(
      (r: any) => r.fare || r.paymentIntentId || r.paymentStatus,
    );

    if (!wallet && !txs.length && !bookingPayments.length && !ridePayments.length) {
      return <EmptyState text="No payment or wallet activity for this user." />;
    }

    return (
      <View style={styles.sectionBlock}>
        {wallet && (
          <>
            <Text style={styles.sectionTitle}>Wallet</Text>
            <View style={styles.listCard}>
              <DetailRow label="Available" value={money(wallet.availableBalance ?? wallet.balance)} />
              <DetailRow label="Pending" value={money(wallet.pendingBalance)} />
              <DetailRow label="Currency" value={wallet.currency || 'GBP'} />
            </View>
          </>
        )}

        {txs.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Transactions ({txs.length})</Text>
            {txs.map((t: any) => (
              <View key={t._id} style={styles.listCard}>
                <View style={styles.listCardHeader}>
                  <Text style={styles.listCardTitle}>{t.type}</Text>
                  <StatusChip status={t.status} />
                </View>
                <Text style={styles.listCardSub}>{money(t.amount)}</Text>
                {t.platformFee ? (
                  <Text style={styles.listCardMeta}>Fee: {money(t.platformFee)}</Text>
                ) : null}
                <Text style={styles.listCardMeta}>{formatDate(t.createdAt)}</Text>
              </View>
            ))}
          </>
        )}

        {bookingPayments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Booking payments</Text>
            {bookingPayments.map((b: any) => (
              <View key={`pay-${b._id}`} style={styles.listCard}>
                <Text style={styles.listCardTitle}>{b.serviceType || 'booking'}</Text>
                <Text style={styles.listCardSub}>{money(b.quotedPrice)}</Text>
                <Text style={styles.listCardMeta}>Status: {b.paymentStatus || '—'}</Text>
                {b.paymentIntentId ? (
                  <Text style={styles.listCardMeta} numberOfLines={1}>
                    Intent: {b.paymentIntentId}
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        )}

        {ridePayments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Ride payments</Text>
            {ridePayments.map((r: any) => (
              <View key={`ride-pay-${r._id}`} style={styles.listCard}>
                <Text style={styles.listCardTitle}>Taxi ride</Text>
                <Text style={styles.listCardSub}>{money(r.fare)}</Text>
                <Text style={styles.listCardMeta}>Status: {r.paymentStatus || r.status}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    );
  };

  const renderActivity = () => {
    const disputes = dossier?.disputes || [];
    const auditLogs = dossier?.auditLogs || [];
    const messages = dossier?.messages || [];
    if (!disputes.length && !auditLogs.length && !messages.length) {
      return <EmptyState text="No disputes, audit events, or admin messages." />;
    }
    return (
      <View style={styles.sectionBlock}>
        {disputes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Disputes ({disputes.length})</Text>
            {disputes.map((d: any) => (
              <View key={d._id} style={styles.listCard}>
                <View style={styles.listCardHeader}>
                  <Text style={styles.listCardTitle}>{d.category}</Text>
                  <StatusChip status={d.status} />
                </View>
                <Text style={styles.listCardSub} numberOfLines={2}>{d.description}</Text>
                <Text style={styles.listCardMeta}>
                  Filed by {personName(d.filedBy)} · {formatDate(d.createdAt)}
                </Text>
              </View>
            ))}
          </>
        )}
        {auditLogs.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Audit log ({auditLogs.length})</Text>
            {auditLogs.map((a: any) => (
              <View key={a._id} style={styles.listCard}>
                <Text style={styles.listCardTitle}>{a.action}</Text>
                <Text style={styles.listCardMeta}>
                  Admin: {personName(a.admin)} · {formatDate(a.createdAt)}
                </Text>
                {a.notes ? <Text style={styles.listCardSub}>{a.notes}</Text> : null}
              </View>
            ))}
          </>
        )}
        {messages.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Admin messages ({messages.length})</Text>
            {messages.map((m: any) => (
              <View key={m._id} style={styles.listCard}>
                <Text style={styles.listCardTitle}>{m.subject || 'Message'}</Text>
                <Text style={styles.listCardSub} numberOfLines={3}>{m.message}</Text>
                <Text style={styles.listCardMeta}>
                  {m.channel} · {formatDate(m.createdAt)}
                </Text>
              </View>
            ))}
          </>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else goUsers();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>{fullName}</Text>
          <Text style={styles.headerSub}>{roleLabel} · {status}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.electricTeal} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.profileStrip}>
            <ProfileAvatar
              uri={profile?.profileImageUrl}
              size={56}
              initials={`${(profile?.firstName?.[0] || 'U').toUpperCase()}${(profile?.lastName?.[0] || '').toUpperCase()}`}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.profileName} numberOfLines={1}>{fullName}</Text>
              <Text style={styles.profileEmail} numberOfLines={1}>{profile?.email}</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tab, tab === t.id && styles.tabActive]}
                onPress={() => setTab(t.id)}
              >
                <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={colors.electricTeal}
              />
            }
          >
            {tab === 'overview' && renderOverview()}
            {tab === 'bookings' && renderBookings()}
            {tab === 'payments' && renderPayments()}
            {tab === 'activity' && renderActivity()}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  const colors = useThemeColors();
  return (
    <View style={{ marginBottom: SPACING.sm }}>
      <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: FONT_WEIGHTS.semibold, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZES.label, marginTop: 2 }} selectable>
        {value?.trim() ? value : '—'}
      </Text>
    </View>
  );
}

function StatusChip({ status }: { status?: string }) {
  const colors = useThemeColors();
  const s = (status || 'unknown').toLowerCase();
  const color =
    s.includes('complete') || s === 'paid' || s === 'active' || s === 'approved'
      ? colors.success
      : s.includes('cancel') || s.includes('fail') || s === 'banned' || s === 'rejected'
        ? colors.error
        : s.includes('pending') || s === 'searching' || s === 'suspended'
          ? colors.amber
          : colors.info;
  return (
    <View style={{ backgroundColor: `${color}18`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
      <Text style={{ color, fontSize: 11, fontWeight: FONT_WEIGHTS.bold }}>{status || '—'}</Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <View style={{ paddingVertical: SPACING['3xl'], alignItems: 'center' }}>
      <Ionicons name="folder-open-outline" size={40} color={colors.textTertiary} />
      <Text style={{ color: colors.textSecondary, marginTop: SPACING.sm, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingTop: Platform.OS === 'android' ? SPACING.sm : 0,
      paddingBottom: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
    headerText: { flex: 1, minWidth: 0 },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: FONT_SIZES.section,
      fontWeight: FONT_WEIGHTS.bold,
    },
    headerSub: {
      color: colors.textSecondary,
      fontSize: FONT_SIZES.small,
      marginTop: 2,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
    errorText: { color: colors.error, textAlign: 'center' },
    retryBtn: {
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      backgroundColor: colors.electricTeal,
      borderRadius: BORDER_RADIUS.md,
    },
    retryText: { color: '#FFF', fontWeight: FONT_WEIGHTS.semibold },
    profileStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      padding: SPACING.md,
    },
    profileName: {
      color: colors.textPrimary,
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    profileEmail: { color: colors.textSecondary, fontSize: FONT_SIZES.small, marginTop: 2 },
    tabsRow: {
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
      paddingBottom: SPACING.sm,
    },
    tab: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: {
      backgroundColor: `${colors.electricTeal}18`,
      borderColor: colors.electricTeal,
    },
    tabText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    tabTextActive: { color: colors.electricTeal },
    content: { padding: SPACING.md, paddingBottom: SPACING['3xl'] },
    sectionBlock: { gap: SPACING.xs },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: FONT_WEIGHTS.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: SPACING.md,
      marginBottom: SPACING.sm,
    },
    listCard: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
    },
    listCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
      marginBottom: 4,
    },
    listCardTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: FONT_WEIGHTS.semibold,
      flex: 1,
    },
    listCardSub: { color: colors.textPrimary, fontSize: 13, marginTop: 2 },
    listCardMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    quickActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
    quickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.info,
      backgroundColor: `${colors.info}08`,
    },
    quickBtnText: { fontWeight: FONT_WEIGHTS.semibold, fontSize: 13 },
  });
