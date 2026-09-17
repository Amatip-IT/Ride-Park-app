import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  SafeAreaView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/api/authService';
import { uploadFileToS3 } from '@/utils/uploadFile';
import { ProfileAvatar } from '@/components/ProfileAvatar';

export function EditProfileScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { user, setUser } = useAuthStore();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const displayImageUri = localImageUri || user?.profileImageUrl || null;
  const initials = `${(firstName?.[0] || 'U').toUpperCase()}${(lastName?.[0] || '').toUpperCase()}`;

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant photo library access to update your profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets?.[0]) {
      setLocalImageUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera access to take a profile photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets?.[0]) {
      setLocalImageUri(result.assets[0].uri);
    }
  };

  const handleImagePress = () => {
    Alert.alert('Profile Photo', 'Choose a method', [
      { text: 'Camera', onPress: takePhoto },
      { text: 'Photo Library', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Required', 'First name and last name are required.');
      return;
    }

    try {
      setSaving(true);
      const updateData: Record<string, string> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };
      const originalPhone = (user?.phoneNumber || '').replace(/[\s()-]/g, '');
      const nextPhone = phoneNumber.trim().replace(/[\s()-]/g, '');
      if (nextPhone && nextPhone !== originalPhone) {
        updateData.phoneNumber = nextPhone;
      }

      // Only upload + persist a new photo when the user picked one this session
      if (localImageUri && !localImageUri.startsWith('http')) {
        const uploadedUrl = await uploadFileToS3(
          localImageUri,
          `avatar_${Date.now()}.jpg`,
        );
        updateData.profileImageUrl = uploadedUrl;
      }

      const res = await authService.updateProfile(updateData);
      if (res.success) {
        const saved = (res.data || {}) as Record<string, any>;
        if (user) {
          setUser({
            ...user,
            ...saved,
            firstName: saved.firstName || firstName.trim(),
            lastName: saved.lastName || lastName.trim(),
            phoneNumber: saved.phoneNumber || updateData.phoneNumber || user.phoneNumber,
            profileImageUrl:
              saved.profileImageUrl ||
              updateData.profileImageUrl ||
              user.profileImageUrl,
          });
        }
        setLocalImageUri(null);
        Alert.alert('Success', 'Profile updated successfully!', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', res.message || 'Failed to update profile.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel =
    user?.role === 'parking_provider' ? 'Park Owner' :
    user?.role === 'driver' ? 'Private Driver' :
    user?.role === 'taxi_driver' ? 'Taxi Driver' :
    user?.role === 'admin' ? 'Admin' : 'Consumer';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.avatarSection} onPress={handleImagePress} activeOpacity={0.7}>
          <ProfileAvatar
            uri={displayImageUri}
            size={110}
            initials={initials}
            style={styles.avatarImage}
          />
          <View style={styles.cameraOverlay}>
            <Ionicons name="camera" size={18} color="#FFF" />
          </View>
        </TouchableOpacity>
        <Text style={styles.photoHint}>Tap to change photo</Text>

        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{roleLabel}</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>First Name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Enter first name"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Enter last name"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+447123456789"
            placeholderTextColor={colors.textTertiary}
            keyboardType="phone-pad"
          />
          <Text style={styles.fieldHint}>Use international format with no spaces</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Email</Text>
          <View style={[styles.input, styles.inputDisabled]}>
            <Text style={styles.disabledText}>{user?.email || 'No email'}</Text>
          </View>
          <Text style={styles.fieldHint}>Email cannot be changed</Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold },
  content: { padding: SPACING.xl, alignItems: 'center', paddingBottom: 40 },

  avatarSection: { position: 'relative', marginBottom: SPACING.xs },
  avatarImage: {
    borderWidth: 3, borderColor: colors.electricTeal,
  },
  cameraOverlay: {
    position: 'absolute', bottom: 2, right: 2,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.info,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
  photoHint: {
    color: colors.textSecondary, fontSize: 13, marginBottom: SPACING.lg,
  },
  roleBadge: {
    backgroundColor: `${colors.electricTeal}15`,
    paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20,
    marginBottom: SPACING.xl,
  },
  roleBadgeText: {
    color: colors.electricTeal, fontSize: 13, fontWeight: FONT_WEIGHTS.bold,
  },

  fieldGroup: { width: '100%', marginBottom: SPACING.lg },
  fieldLabel: {
    color: colors.textSecondary, fontSize: 13, fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs, marginLeft: 2,
  },
  input: {
    backgroundColor: colors.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: SPACING.lg, paddingVertical: 14,
    color: colors.textPrimary, fontSize: 16,
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
  },
  disabledText: { color: colors.textTertiary, fontSize: 16 },
  fieldHint: { color: colors.textTertiary, fontSize: 11, marginTop: 4, marginLeft: 2 },

  saveBtn: {
    width: '100%', paddingVertical: 16,
    borderRadius: BORDER_RADIUS.lg, backgroundColor: colors.electricTeal,
    alignItems: 'center', marginTop: SPACING.lg,
    shadowColor: colors.electricTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFF', fontSize: 17, fontWeight: FONT_WEIGHTS.bold },
});
