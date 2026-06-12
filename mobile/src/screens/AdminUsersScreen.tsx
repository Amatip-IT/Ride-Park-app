import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, TextInput, Alert, Platform,
} from 'react-native';
import { adminApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { UserRole } from '@/types';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import { getApiErrorMessage } from '@/utils/helpers';
import { AdminScreenLayout } from '@/components/admin/AdminScreenLayout';
import { AdminFormModal } from '@/components/admin/AdminFormModal';

type UserData = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  role: UserRole | string;
  isEmailVerified: boolean;
  accountStatus?: 'active' | 'suspended' | 'banned';
  suspensionReason?: string;
  suspensionEndDate?: string;
  createdAt: string;
};

type ActionModal =
  | { type: 'suspend'; user: UserData }
  | { type: 'ban'; user: UserData }
  | null;

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'user', label: 'Users' },
  { id: 'driver', label: 'Drivers' },
  { id: 'taxi_driver', label: 'Taxis' },
  { id: 'parking_provider', label: 'Park Owners' },
  { id: 'admin', label: 'Admins' },
];

const SUSPENSION_PRESETS = [7, 30, 90];

export function AdminUsersScreen() {
  const navigation = useNavigation<any>();
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [reason, setReason] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const response = await adminApi.getUsers();
      if (response.data?.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return COLORS.error;
      case 'taxi_driver': return COLORS.amber;
      case 'driver': return COLORS.info;
      case 'parking_provider': return COLORS.electricTeal;
      default: return COLORS.textSecondary;
    }
  };

  const formatRole = (role: string) => {
    switch (role) {
      case 'taxi_driver': return 'Taxi Driver';
      case 'parking_provider': return 'Park Owner';
      case 'admin': return 'Admin';
      case 'driver': return 'Driver';
      default: return 'General User';
    }
  };

  const getAccountStatusColor = (status?: string) => {
    switch (status) {
      case 'suspended': return COLORS.amber;
      case 'banned': return COLORS.error;
      default: return COLORS.success;
    }
  };

  const handleUnsuspend = (user: UserData) => {
    Alert.alert('Restore Account', `Unsuspend ${user.firstName} ${user.lastName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unsuspend',
        onPress: async () => {
          try {
            setProcessingId(user._id);
            const res = await adminApi.unsuspendUser(user._id);
            if (res.data?.success) {
              Alert.alert('Done', 'User account restored.');
              fetchUsers();
            } else {
              Alert.alert('Error', res.data?.message || 'Failed to unsuspend');
            }
          } catch {
            Alert.alert('Error', 'Failed to unsuspend user');
          } finally {
            setProcessingId(null);
          }
        },
      },
    ]);
  };

  const handleUnban = (user: UserData) => {
    Alert.alert('Lift Ban', `Remove ban for ${user.firstName} ${user.lastName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unban',
        onPress: async () => {
          try {
            setProcessingId(user._id);
            const res = await adminApi.unbanUser(user._id);
            if (res.data?.success) {
              Alert.alert('Done', 'Ban lifted.');
              fetchUsers();
            } else {
              Alert.alert('Error', res.data?.message || 'Failed to unban');
            }
          } catch {
            Alert.alert('Error', 'Failed to unban user');
          } finally {
            setProcessingId(null);
          }
        },
      },
    ]);
  };

  const handleDelete = (user: UserData) => {
    if (currentUser?._id === user._id) {
      Alert.alert('Not Allowed', 'You cannot delete your own admin account.');
      return;
    }

    Alert.alert(
      'Delete User Permanently?',
      `${user.firstName} ${user.lastName} (${user.email}) will be removed from the database. This cannot be undone.\n\nUse Ban or Suspend if you only need to block access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setProcessingId(user._id);
              const res = await adminApi.deleteUser(user._id);
              if (res.data?.success) {
                Alert.alert('Deleted', res.data.message || 'User has been permanently deleted.');
                fetchUsers();
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to delete user');
              }
            } catch (err) {
              Alert.alert('Error', getApiErrorMessage(err, 'Failed to delete user'));
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const submitAction = async () => {
    if (!actionModal || !reason.trim()) {
      Alert.alert('Reason Required', 'Please enter a reason.');
      return;
    }

    const { user, type } = actionModal;
    try {
      setProcessingId(user._id);
      let res;
      if (type === 'suspend') {
        const days = parseInt(durationDays, 10);
        res = await adminApi.suspendUser(
          user._id,
          reason.trim(),
          Number.isFinite(days) && days > 0 ? days : 7,
        );
      } else {
        res = await adminApi.banUser(user._id, reason.trim());
      }

      if (res.data?.success) {
        Alert.alert('Success', res.data.message || 'Action completed.');
        setActionModal(null);
        setReason('');
        fetchUsers();
      } else {
        Alert.alert('Error', res.data?.message || 'Action failed');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setProcessingId(null);
    }
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    if (activeTab !== 'all' && user.role !== activeTab) return false;
    if (!query) return true;
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.toLowerCase();
    return fullName.includes(query) || user.email.toLowerCase().includes(query);
  });

  const renderUser = ({ item }: { item: UserData }) => {
    const status = item.accountStatus || 'active';
    const isAdmin = item.role === 'admin';
    const isProcessing = processingId === item._id;

    return (
      <View style={styles.userCard}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.firstName?.charAt(0) || 'U'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
            <Text style={styles.userEmail}>{item.email}</Text>
            {item.phoneNumber && <Text style={styles.userPhone}>{item.phoneNumber}</Text>}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardFooter}>
          <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) + '20' }]}>
            <Text style={[styles.roleText, { color: getRoleColor(item.role) }]}>
              {formatRole(item.role)}
            </Text>
          </View>
          <View style={[styles.accountBadge, { backgroundColor: `${getAccountStatusColor(status)}20` }]}>
            <Text style={[styles.accountBadgeText, { color: getAccountStatusColor(status) }]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </View>
        </View>

        {status === 'suspended' && item.suspensionReason && (
          <Text style={styles.reasonText}>Reason: {item.suspensionReason}</Text>
        )}

        {!isAdmin && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('AdminMessaging', {
                userId: item._id,
                userName: `${item.firstName} ${item.lastName}`,
              })}
              disabled={isProcessing}
            >
              <Ionicons name="mail-outline" size={16} color={COLORS.info} />
              <Text style={[styles.actionBtnText, { color: COLORS.info }]}>Message</Text>
            </TouchableOpacity>
            {status === 'active' && (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.suspendBtn]}
                  onPress={() => { setActionModal({ type: 'suspend', user: item }); setReason(''); setDurationDays('7'); }}
                  disabled={isProcessing}
                >
                  <Ionicons name="pause-circle-outline" size={16} color={COLORS.amber} />
                  <Text style={[styles.actionBtnText, { color: COLORS.amber }]}>Suspend</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.banBtn]}
                  onPress={() => { setActionModal({ type: 'ban', user: item }); setReason(''); }}
                  disabled={isProcessing}
                >
                  <Ionicons name="ban-outline" size={16} color={COLORS.error} />
                  <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Ban</Text>
                </TouchableOpacity>
              </>
            )}
            {status === 'suspended' && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleUnsuspend(item)} disabled={isProcessing}>
                <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
                <Text style={[styles.actionBtnText, { color: COLORS.success }]}>Unsuspend</Text>
              </TouchableOpacity>
            )}
            {status === 'banned' && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleUnban(item)} disabled={isProcessing}>
                <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.info} />
                <Text style={[styles.actionBtnText, { color: COLORS.info }]}>Unban</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={() => handleDelete(item)}
              disabled={isProcessing || currentUser?._id === item._id}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                  <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Delete</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const headerFilters = (
    <View>
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={18} color={COLORS.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email..."
            placeholderTextColor={COLORS.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.tabsContainer}>
        <FlatList
          horizontal
          data={TABS}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.tab, activeTab === item.id && styles.activeTab]}
              onPress={() => setActiveTab(item.id)}
            >
              <Text style={[styles.tabText, activeTab === item.id && styles.activeTabText]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingHorizontal: SPACING.md }}
        />
      </View>
    </View>
  );

  return (
    <>
      <AdminScreenLayout
        title="All Users"
        subtitle="Manage accounts & access"
        headerBottom={headerFilters}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={COLORS.electricTeal} />
          </View>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item._id}
            renderItem={renderUser}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="on-drag"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.electricTeal} />
            }
            ListEmptyComponent={
              <View style={styles.centered}>
                <Ionicons name="people-outline" size={48} color={COLORS.textTertiary} />
                <Text style={styles.emptyText}>
                  {query ? 'No users match your search.' : 'No users found in this category.'}
                </Text>
              </View>
            }
          />
        )}
      </AdminScreenLayout>

      <AdminFormModal
        visible={!!actionModal}
        onClose={() => { setActionModal(null); setReason(''); }}
        title={actionModal?.type === 'suspend' ? 'Suspend User' : 'Ban User'}
        subtitle={actionModal ? `${actionModal.user.firstName} ${actionModal.user.lastName}` : undefined}
      >
        <TextInput
          style={styles.modalInput}
          placeholder="Reason (required)"
          placeholderTextColor={COLORS.textTertiary}
          value={reason}
          onChangeText={setReason}
          multiline
          textAlignVertical="top"
        />

        {actionModal?.type === 'suspend' && (
          <>
            <Text style={styles.presetLabel}>Duration (days)</Text>
            <View style={styles.presetRow}>
              {SUSPENSION_PRESETS.map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[styles.presetBtn, durationDays === String(days) && styles.presetBtnActive]}
                  onPress={() => setDurationDays(String(days))}
                >
                  <Text style={[styles.presetBtnText, durationDays === String(days) && styles.presetBtnTextActive]}>
                    {days}d
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Custom days"
              placeholderTextColor={COLORS.textTertiary}
              value={durationDays}
              onChangeText={setDurationDays}
              keyboardType="numeric"
              returnKeyType="done"
            />
          </>
        )}

        <View style={styles.modalActions}>
          <TouchableOpacity
            style={styles.modalCancel}
            onPress={() => { setActionModal(null); setReason(''); }}
          >
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalConfirm} onPress={submitAction}>
            <Text style={styles.modalConfirmText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </AdminFormModal>
    </>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  tabsContainer: { paddingVertical: SPACING.sm },
  tab: {
    paddingHorizontal: SPACING.lg, paddingVertical: 8, marginRight: SPACING.sm,
    borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  activeTab: { backgroundColor: COLORS.electricTeal, borderColor: COLORS.electricTeal },
  tabText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.medium },
  activeTabText: { color: '#FFF', fontWeight: FONT_WEIGHTS.semibold },
  listContent: { padding: SPACING.md },
  userCard: {
    backgroundColor: '#FFF', borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    marginBottom: SPACING.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.electricTeal,
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  userEmail: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  userPhone: { fontSize: 13, color: COLORS.textTertiary, marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  roleText: { fontSize: 12, fontWeight: FONT_WEIGHTS.bold },
  accountBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  accountBadgeText: { fontSize: 12, fontWeight: FONT_WEIGHTS.bold },
  reasonText: { fontSize: 12, color: COLORS.textSecondary, marginTop: SPACING.sm, fontStyle: 'italic' },
  actionsRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  suspendBtn: { borderColor: `${COLORS.amber}40` },
  banBtn: { borderColor: `${COLORS.error}40` },
  deleteBtn: { borderColor: `${COLORS.error}50`, backgroundColor: `${COLORS.error}08` },
  actionBtnText: { fontSize: 13, fontWeight: FONT_WEIGHTS.semibold },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyText: { marginTop: SPACING.md, fontSize: 16, color: COLORS.textSecondary },
  modalInput: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, color: COLORS.textPrimary,
    fontSize: 14, marginBottom: SPACING.md, minHeight: 80, textAlignVertical: 'top',
  },
  presetLabel: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  presetRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  presetBtn: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
  },
  presetBtnActive: { backgroundColor: COLORS.electricTeal, borderColor: COLORS.electricTeal },
  presetBtnText: { color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.medium },
  presetBtnTextActive: { color: '#FFF' },
  modalActions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  modalCancel: {
    flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  modalCancelText: { color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.bold },
  modalConfirm: {
    flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.electricTeal, alignItems: 'center',
  },
  modalConfirmText: { color: '#FFF', fontWeight: FONT_WEIGHTS.bold },
});
