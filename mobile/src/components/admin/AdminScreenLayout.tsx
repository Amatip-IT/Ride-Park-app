import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';

/** Jump straight to the admin home screen (not one step back in the stack). */
export function useAdminDashboardBack() {
  const navigation = useNavigation<any>();
  return () => navigation.navigate('AdminDashboard');
}

type AdminScreenLayoutProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Wrap body in ScrollView (forms, analytics). Omit for FlatList screens. */
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  rightSlot?: React.ReactNode;
  onBack?: () => void;
  footer?: React.ReactNode;
  /** Slot between header and main body (filters, tabs) */
  headerBottom?: React.ReactNode;
};

export function AdminScreenLayout({
  title,
  subtitle,
  children,
  scroll = false,
  contentContainerStyle,
  rightSlot,
  onBack,
  footer,
  headerBottom,
}: AdminScreenLayoutProps) {
  const goToDashboard = useAdminDashboardBack();

  const body = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.body}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}
      >
        <View style={styles.flex}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onBack ?? goToDashboard}
              style={styles.backBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
              {subtitle ? (
                <Text style={styles.headerSub} numberOfLines={2}>{subtitle}</Text>
              ) : null}
            </View>
            {rightSlot ?? <View style={styles.headerSpacer} />}
          </View>
          {headerBottom}
          {body}
          {footer}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  backBtn: { padding: SPACING.xs, marginRight: SPACING.sm },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
  },
  headerSub: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    marginTop: 2,
    lineHeight: 18,
  },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    flexGrow: 1,
  },
  body: { flex: 1 },
});
