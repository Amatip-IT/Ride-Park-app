import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { adminApi } from '@/api';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { AdminScreenLayout } from '@/components/admin/AdminScreenLayout';
import { AdminFormModal } from '@/components/admin/AdminFormModal';
import { SafeAreaView } from 'react-native-safe-area-context';

type Template = {
  _id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
};

type UserOption = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type HistoryMessage = {
  _id: string;
  message: string;
  subject?: string;
  channel: string;
  deliveryStatus: string;
  createdAt?: string;
  admin?: { firstName?: string; lastName?: string; email?: string };
};

const CHANNELS = [
  { id: 'system', label: 'Push + In-App' },
  { id: 'email', label: 'Email Only' },
  { id: 'all', label: 'Push + Email' },
];

const TEMPLATE_CATEGORY_ORDER = [
  'verification',
  'approval',
  'rejection',
  'booking',
  'earnings',
  'expiry',
  'suspension',
  'general',
  'custom',
] as const;

const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  verification: 'Under review & submissions',
  approval: 'Approved',
  rejection: 'Rejected — action needed',
  booking: 'Bookings',
  earnings: 'Earnings & payouts',
  expiry: 'Document expiry',
  suspension: 'Account status',
  general: 'General',
  custom: 'Custom templates',
};

export function AdminMessagingScreen() {
  const route = useRoute<any>();
  const preselectedUserId = route.params?.userId as string | undefined;
  const preselectedUserName = route.params?.userName as string | undefined;

  const [tab, setTab] = useState<'compose' | 'history'>('compose');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [subject, setSubject] = useState('Message from Gleezip Admin');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<'system' | 'email' | 'all'>('system');
  const [showPreview, setShowPreview] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', category: 'custom', subject: '', body: '' });

  const loadData = async () => {
    try {
      const [templatesRes, usersRes] = await Promise.all([
        adminApi.getMessageTemplates(),
        adminApi.getUsers(),
      ]);
      if (templatesRes.data?.success) setTemplates(templatesRes.data.data || []);
      if (usersRes.data?.success) {
        const list = usersRes.data.data || [];
        setUsers(list);
        if (preselectedUserId) {
          const match = list.find((u: UserOption) => u._id === preselectedUserId);
          if (match) setSelectedUser(match);
        }
      }
    } catch (err) {
      console.log('Failed to load messaging data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (userId: string) => {
    try {
      const res = await adminApi.getMessageHistory(userId);
      if (res.data?.success) setHistory(res.data.data || []);
    } catch (err) {
      console.log('Failed to load history:', err);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, [preselectedUserId]));

  useEffect(() => {
    if (selectedUser && tab === 'history') loadHistory(selectedUser._id);
  }, [selectedUser, tab]);

  const applyTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setSubject(template.subject);
    setMessage(template.body);
  };

  const handleSend = async () => {
    if (!selectedUser) {
      Alert.alert('Select User', 'Choose a recipient before sending.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Message Required', 'Enter a message to send.');
      return;
    }

    Alert.alert(
      'Send Message',
      `Send to ${selectedUser.firstName} ${selectedUser.lastName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSending(true);
            try {
              const res = await adminApi.sendAdminMessage({
                userId: selectedUser._id,
                message: message.trim(),
                subject: subject.trim(),
                type: channel,
                templateId: selectedTemplate?._id,
              });
              if (res.data?.success) {
                Alert.alert('Sent', res.data.message || 'Message delivered');
                setMessage('');
                if (tab === 'history') loadHistory(selectedUser._id);
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to send');
              }
            } catch {
              Alert.alert('Error', 'Failed to send message');
            } finally {
              setSending(false);
            }
          },
        },
      ],
    );
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.subject.trim() || !newTemplate.body.trim()) {
      Alert.alert('Missing Fields', 'Fill in name, subject, and body.');
      return;
    }
    try {
      const res = await adminApi.createMessageTemplate(newTemplate);
      if (res.data?.success) {
        Alert.alert('Created', 'Template saved');
        setShowNewTemplate(false);
        setNewTemplate({ name: '', category: 'custom', subject: '', body: '' });
        loadData();
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to create template');
      }
    } catch {
      Alert.alert('Error', 'Failed to create template');
    }
  };

  const templatesByCategory = useMemo(() => {
    const groups = new Map<string, Template[]>();
    for (const t of templates) {
      const cat = t.category || 'general';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(t);
    }
    const orderedCategories = [
      ...TEMPLATE_CATEGORY_ORDER.filter(c => groups.has(c)),
      ...[...groups.keys()].filter(c => !TEMPLATE_CATEGORY_ORDER.includes(c as typeof TEMPLATE_CATEGORY_ORDER[number])),
    ];
    return orderedCategories.map(category => ({
      category,
      label: TEMPLATE_CATEGORY_LABELS[category] || category.replace(/_/g, ' '),
      items: groups.get(category)!,
    }));
  }, [templates]);

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    return (
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  const tabRow = (
    <View style={styles.tabRow}>
      <TouchableOpacity
        style={[styles.tab, tab === 'compose' && styles.tabActive]}
        onPress={() => setTab('compose')}
      >
        <Text style={[styles.tabText, tab === 'compose' && styles.tabTextActive]}>Compose</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, tab === 'history' && styles.tabActive]}
        onPress={() => setTab('history')}
      >
        <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>History</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centerSafe} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={COLORS.electricTeal} />
      </SafeAreaView>
    );
  }

  return (
    <>
    <AdminScreenLayout
      title="Admin Messaging"
      subtitle="Templates, compose & history"
      scroll
      headerBottom={tabRow}
      contentContainerStyle={styles.scrollContent}
    >
        <TouchableOpacity style={styles.userPicker} onPress={() => setShowUserPicker(true)}>
          <Ionicons name="person-outline" size={20} color={COLORS.electricTeal} />
          <Text style={styles.userPickerText}>
            {selectedUser
              ? `${selectedUser.firstName} ${selectedUser.lastName} · ${selectedUser.email}`
              : preselectedUserName || 'Select recipient...'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={COLORS.textTertiary} />
        </TouchableOpacity>

        {tab === 'compose' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Message templates</Text>
              <TouchableOpacity onPress={() => setShowNewTemplate(true)}>
                <Text style={styles.linkText}>+ Custom</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionHint}>
              Tap a template — these are the messages users should receive at each step (e.g. documents under review).
            </Text>
            {templatesByCategory.map(group => (
              <View key={group.category} style={styles.templateGroup}>
                <Text style={styles.templateGroupLabel}>{group.label}</Text>
                <View style={styles.templateChipRow}>
                  {group.items.map(t => {
                    const isActive = selectedTemplate?._id === t._id;
                    return (
                      <TouchableOpacity
                        key={t._id}
                        style={[styles.templateChip, isActive && styles.templateChipActive]}
                        onPress={() => applyTemplate(t)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.templateChipText, isActive && styles.templateChipTextActive]} numberOfLines={2}>
                          {t.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            <Text style={styles.label}>Subject</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholderTextColor={COLORS.textTertiary}
              returnKeyType="done"
              blurOnSubmit
            />

            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.messageInput]}
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
              placeholder="Write your message..."
              placeholderTextColor={COLORS.textTertiary}
              blurOnSubmit
            />

            <Text style={styles.label}>Delivery Channel</Text>
            <View style={styles.channelRow}>
              {CHANNELS.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.channelChip, channel === c.id && styles.channelChipActive]}
                  onPress={() => setChannel(c.id as typeof channel)}
                >
                  <Text style={[styles.channelText, channel === c.id && styles.channelTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.previewBtn} onPress={() => setShowPreview(true)}>
                <Ionicons name="eye-outline" size={18} color={COLORS.info} />
                <Text style={styles.previewBtnText}>Preview</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#FFF" />
                    <Text style={styles.sendBtnText}>Send Message</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {tab === 'history' && (
          <>
            {!selectedUser ? (
              <Text style={styles.emptyHint}>Select a user to view message history.</Text>
            ) : history.length === 0 ? (
              <Text style={styles.emptyHint}>No messages sent to this user yet.</Text>
            ) : (
              history.map(item => (
                <View key={item._id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historySubject}>{item.subject || 'Admin Message'}</Text>
                    <View style={[styles.statusPill, { backgroundColor: `${COLORS.success}15` }]}>
                      <Text style={[styles.statusPillText, { color: COLORS.success }]}>{item.deliveryStatus}</Text>
                    </View>
                  </View>
                  <Text style={styles.historyMessage}>{item.message}</Text>
                  <Text style={styles.historyMeta}>
                    {item.channel} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                  </Text>
                </View>
              ))
            )}
          </>
        )}
    </AdminScreenLayout>

      <AdminFormModal
        visible={showUserPicker}
        onClose={() => { setShowUserPicker(false); setUserSearch(''); }}
        title="Select User"
        subtitle="Search and choose a recipient"
      >
        <TextInput
          style={styles.input}
          placeholder="Search users..."
          placeholderTextColor={COLORS.textTertiary}
          value={userSearch}
          onChangeText={setUserSearch}
          returnKeyType="search"
        />
        <FlatList
          data={filteredUsers}
          keyExtractor={item => item._id}
          style={{ maxHeight: 280 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.userRow}
              onPress={() => {
                setSelectedUser(item);
                setShowUserPicker(false);
                setUserSearch('');
              }}
            >
              <Text style={styles.userRowName}>{item.firstName} {item.lastName}</Text>
              <Text style={styles.userRowEmail}>{item.email}</Text>
            </TouchableOpacity>
          )}
        />
      </AdminFormModal>

      <AdminFormModal
        visible={showPreview}
        onClose={() => setShowPreview(false)}
        title="Message Preview"
      >
        <Text style={styles.previewSubject}>{subject}</Text>
        <Text style={styles.previewBody}>{message || 'No message yet.'}</Text>
        <Text style={styles.previewMeta}>
          To: {selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : 'No recipient'}
        </Text>
        <TouchableOpacity style={styles.sendBtn} onPress={() => setShowPreview(false)}>
          <Text style={styles.sendBtnText}>Close Preview</Text>
        </TouchableOpacity>
      </AdminFormModal>

      <AdminFormModal
        visible={showNewTemplate}
        onClose={() => setShowNewTemplate(false)}
        title="New Template"
      >
        <TextInput
          style={styles.input}
          placeholder="Template name"
          placeholderTextColor={COLORS.textTertiary}
          value={newTemplate.name}
          onChangeText={v => setNewTemplate(p => ({ ...p, name: v }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Subject"
          placeholderTextColor={COLORS.textTertiary}
          value={newTemplate.subject}
          onChangeText={v => setNewTemplate(p => ({ ...p, subject: v }))}
        />
        <TextInput
          style={[styles.input, styles.messageInput]}
          placeholder="Body"
          placeholderTextColor={COLORS.textTertiary}
          value={newTemplate.body}
          onChangeText={v => setNewTemplate(p => ({ ...p, body: v }))}
          multiline
          textAlignVertical="top"
        />
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.previewBtn} onPress={() => setShowNewTemplate(false)}>
            <Text style={styles.previewBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendBtn} onPress={handleCreateTemplate}>
            <Text style={styles.sendBtnText}>Save Template</Text>
          </TouchableOpacity>
        </View>
      </AdminFormModal>
    </>
  );
}

const styles = StyleSheet.create({
  centerSafe: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: SPACING.md, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.electricTeal },
  tabText: { color: COLORS.textSecondary, fontWeight: FONT_WEIGHTS.medium },
  tabTextActive: { color: COLORS.electricTeal },
  scrollContent: { paddingBottom: SPACING.xl },
  userPicker: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  userPickerText: { flex: 1, color: COLORS.textPrimary, fontSize: FONT_SIZES.small },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  sectionTitle: { color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.semibold },
  sectionHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: SPACING.md,
  },
  linkText: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.medium, fontSize: FONT_SIZES.small },
  templateGroup: { marginBottom: SPACING.md },
  templateGroupLabel: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: SPACING.xs,
  },
  templateChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  templateChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    maxWidth: '100%',
  },
  templateChipActive: { backgroundColor: `${COLORS.electricTeal}12`, borderColor: COLORS.electricTeal },
  templateChipText: { color: COLORS.textSecondary, fontSize: 12, maxWidth: 220 },
  templateChipTextActive: { color: COLORS.electricTeal, fontWeight: FONT_WEIGHTS.semibold },
  label: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small, marginBottom: SPACING.xs },
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, color: COLORS.textPrimary,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md,
  },
  messageInput: { minHeight: 120 },
  channelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
  channelChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  channelChipActive: { backgroundColor: `${COLORS.info}15`, borderColor: COLORS.info },
  channelText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  channelTextActive: { color: COLORS.info },
  actionRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center' },
  previewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    padding: SPACING.md, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, flex: 1, justifyContent: 'center',
  },
  previewBtnText: { color: COLORS.info, fontWeight: FONT_WEIGHTS.medium },
  sendBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.electricTeal, borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#FFF', fontWeight: FONT_WEIGHTS.semibold },
  emptyHint: { color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.xl },
  historyCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  historySubject: { color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.semibold, flex: 1 },
  statusPill: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.sm },
  statusPillText: { fontSize: 10, fontWeight: FONT_WEIGHTS.bold },
  historyMessage: { color: COLORS.textSecondary, marginBottom: SPACING.xs },
  historyMeta: { color: COLORS.textTertiary, fontSize: 11 },
  userRow: { paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  userRowName: { color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.medium },
  userRowEmail: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  previewSubject: { color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.bold, marginBottom: SPACING.sm },
  previewBody: { color: COLORS.textSecondary, marginBottom: SPACING.md, lineHeight: 22 },
  previewMeta: { color: COLORS.textTertiary, fontSize: FONT_SIZES.small, marginBottom: SPACING.lg },
});
