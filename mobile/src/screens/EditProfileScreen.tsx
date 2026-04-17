import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  SafeAreaView, Platform, Alert, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@/store/authStore';
import { usersApi } from '@/api';

export function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, setUser } = useAuthStore();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [profileImage, setProfileImage] = useState<string | null>(user?.profileImageUrl || null);
  const [saving, setSaving] = useState(false);

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
      base64: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      // For now, store the local URI. In production, upload to S3/Cloudinary first.
      setProfileImage(asset.uri);
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
      setProfileImage(result.assets[0].uri);
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
      const updateData: any = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };
      if (phoneNumber.trim()) updateData.phoneNumber = phoneNumber.trim();
      if (profileImage) updateData.profileImageUrl = profileImage;

      const res = await usersApi.updateProfile(updateData);
      if (res.data?.success) {
        // Update the local auth store with the new user data
        if (user) {
          setUser({
            ...user,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phoneNumber: phoneNumber.trim() || user.phoneNumber,
            profileImageUrl: profileImage || user.profileImageUrl,
          });
        }
        Alert.alert('Success', 'Profile updated successfully!', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', res.data?.message || 'Failed to update profile.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to update profile.');
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
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Photo */}
        <TouchableOpacity style={styles.avatarSection} onPress={handleImagePress} activeOpacity={0.7}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>
                {(firstName?.[0] || 'U').toUpperCase()}
                {(lastName?.[0] || '').toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.cameraOverlay}>
            <Ionicons name="camera" size={18} color="#FFF" />
          </View>
        </TouchableOpacity>
        <Text style={styles.photoHint}>Tap to change photo</Text>

        {/* Role Badge */}
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{roleLabel}</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>First Name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Enter first name"
            placeholderTextColor={COLORS.textTertiary}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Enter last name"
            placeholderTextColor={COLORS.textTertiary}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+44 XXXX XXXXXX"
            placeholderTextColor={COLORS.textTertiary}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Email</Text>
          <View style={[styles.input, styles.inputDisabled]}>
            <Text style={styles.disabledText}>{user?.email || 'No email'}</Text>
          </View>
          <Text style={styles.fieldHint}>Email cannot be changed</Text>
        </View>

        {/* Save Button */}
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'android' ? SPACING.xl : SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold },
  content: { padding: SPACING.xl, alignItems: 'center', paddingBottom: 40 },

  // Avatar
  avatarSection: { position: 'relative', marginBottom: SPACING.xs },
  avatarImage: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, borderColor: COLORS.electricTeal,
  },
  avatarPlaceholder: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: COLORS.electricTeal,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: `${COLORS.electricTeal}60`,
  },
  avatarInitials: { color: '#FFF', fontSize: 36, fontWeight: FONT_WEIGHTS.bold },
  cameraOverlay: {
    position: 'absolute', bottom: 2, right: 2,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.info,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
  photoHint: {
    color: COLORS.textSecondary, fontSize: 13, marginBottom: SPACING.lg,
  },
  roleBadge: {
    backgroundColor: `${COLORS.electricTeal}15`,
    paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20,
    marginBottom: SPACING.xl,
  },
  roleBadgeText: {
    color: COLORS.electricTeal, fontSize: 13, fontWeight: FONT_WEIGHTS.bold,
  },

  // Fields
  fieldGroup: { width: '100%', marginBottom: SPACING.lg },
  fieldLabel: {
    color: COLORS.textSecondary, fontSize: 13, fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs, marginLeft: 2,
  },
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg, paddingVertical: 14,
    color: COLORS.textPrimary, fontSize: 16,
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
  },
  disabledText: { color: COLORS.textTertiary, fontSize: 16 },
  fieldHint: { color: COLORS.textTertiary, fontSize: 11, marginTop: 4, marginLeft: 2 },

  // Save
  saveBtn: {
    width: '100%', paddingVertical: 16,
    borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.electricTeal,
    alignItems: 'center', marginTop: SPACING.lg,
    shadowColor: COLORS.electricTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFF', fontSize: 17, fontWeight: FONT_WEIGHTS.bold },
});
