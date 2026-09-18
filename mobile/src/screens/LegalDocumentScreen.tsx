import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { PRIVACY_POLICY_TEXT, TERMS_CONDITIONS_TEXT, HELP_SUPPORT_TEXT } from '@/constants/legal';
import { RootStackParamList } from '@/navigation/RootNavigator';

type LegalScreenRouteProp = RouteProp<RootStackParamList, 'LegalDocument'>;

export function LegalDocumentScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation();
  const route = useRoute<LegalScreenRouteProp>();
  const documentType = route.params?.documentType ?? 'terms';

  const title = documentType === 'privacy' 
    ? 'Privacy Policy' 
    : (documentType as string) === 'help' 
    ? 'Help & Support'
    : 'Terms & Conditions';
    
  const text = documentType === 'privacy' 
    ? PRIVACY_POLICY_TEXT 
    : (documentType as string) === 'help'
    ? HELP_SUPPORT_TEXT
    : TERMS_CONDITIONS_TEXT;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.bodyText}>{text}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? 10 : 40,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZES.section,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.textPrimary,
  },
  content: {
    padding: SPACING.xl,
    paddingBottom: SPACING.xl * 2,
  },
  bodyText: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
});
