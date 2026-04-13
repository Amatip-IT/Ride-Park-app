import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Platform,
  SafeAreaView, ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

type ParamList = {
  DocumentUpload: {
    docId: string;
    docTitle: string;
    docStatus: string;
  };
};

export function DocumentUploadScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'DocumentUpload'>>();
  const { docId, docTitle, docStatus } = route.params;

  const [documentUri, setDocumentUri] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setDocumentUri(result.assets[0].uri);
      setDocumentName(result.assets[0].fileName || 'uploaded_image.jpg');
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
      });

      if (result.canceled) return;

      if (result.assets && result.assets.length > 0) {
        setDocumentUri(result.assets[0].uri);
        setDocumentName(result.assets[0].name);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow camera access');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setDocumentUri(result.assets[0].uri);
      setDocumentName('camera_photo.jpg');
    }
  };

  const handleUpload = async () => {
    if (!documentUri) return;
    setIsUploading(true);

    try {
      // TODO: Actually upload via API here to backend storage
      // const formData = new FormData();
      // formData.append('file', { uri: documentUri, name: documentName, type: 'image/jpeg' });
      // await providerApi.uploadDocument(docId, formData);

      // Simulate network request
      await new Promise(resolve => setTimeout(resolve, 1500));

      Alert.alert('Success', 'Document uploaded successfully! It is now pending verification.');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to upload document. Try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{docTitle}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.instructionsBox}>
          <Ionicons name="information-circle" size={24} color={COLORS.info} />
          <Text style={styles.instructionsText}>
            Please upload a clear, legible copy of your {docTitle}. Ensure all corners are visible and the text is readable. Supported formats: JPEG, PNG, PDF.
          </Text>
        </View>

        {docStatus === 'Completed' && (
          <View style={styles.statusBox}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} style={{ marginRight: 8 }} />
            <Text style={styles.statusText}>You have previously uploaded this document. You can upload a new one to replace it.</Text>
          </View>
        )}

        <View style={styles.uploadOptions}>
          <TouchableOpacity style={styles.optionBtn} onPress={handleTakePhoto} activeOpacity={0.7}>
            <Ionicons name="camera-outline" size={28} color={COLORS.electricTeal} />
            <Text style={styles.optionText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionBtn} onPress={handlePickImage} activeOpacity={0.7}>
            <Ionicons name="image-outline" size={28} color={COLORS.electricTeal} />
            <Text style={styles.optionText}>Photo Library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionBtn} onPress={handlePickDocument} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={28} color={COLORS.electricTeal} />
            <Text style={styles.optionText}>Choose File</Text>
          </TouchableOpacity>
        </View>

        {documentUri && (
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Ionicons name="document-attach" size={20} color={COLORS.textPrimary} />
              <Text style={styles.previewName} numberOfLines={1}>{documentName}</Text>
              <TouchableOpacity onPress={() => setDocumentUri(null)}>
                <Ionicons name="close-circle" size={22} color={COLORS.error} />
              </TouchableOpacity>
            </View>
            {documentName?.toLowerCase().match(/\.(jpg|jpeg|png)$/) ? (
              <Image source={{ uri: documentUri }} style={styles.imagePreview} />
            ) : (
              <View style={styles.docPreview}>
                <Ionicons name="document-text" size={64} color={COLORS.electricTeal} />
                <Text style={styles.docPreviewText}>PDF Document</Text>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, (!documentUri || isUploading) && styles.submitBtnDisabled]}
          onPress={handleUpload}
          disabled={!documentUri || isUploading}
        >
          {isUploading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>Upload Document</Text>
          )}
        </TouchableOpacity>
      </View>
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
    backgroundColor: COLORS.background,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: {
    color: COLORS.textPrimary, fontSize: 18, fontWeight: FONT_WEIGHTS.bold, flex: 1, textAlign: 'center', marginHorizontal: SPACING.md,
  },
  content: { padding: SPACING.lg },
  instructionsBox: {
    flexDirection: 'row', backgroundColor: '#F0F9FF', padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: '#BAE6FD',
    marginBottom: SPACING.lg, alignItems: 'flex-start'
  },
  instructionsText: {
    flex: 1, color: '#0369A1', fontSize: 14, marginLeft: SPACING.sm, lineHeight: 20,
  },
  statusBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: `${COLORS.success}10`,
    padding: SPACING.md, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.success,
    marginBottom: SPACING.lg,
  },
  statusText: { flex: 1, color: COLORS.success, fontSize: 13, lineHeight: 18 },
  uploadOptions: {
    flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm, marginBottom: SPACING.xl,
  },
  optionBtn: {
    flex: 1, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  optionText: { color: COLORS.textPrimary, fontSize: 13, fontWeight: FONT_WEIGHTS.medium, marginTop: SPACING.sm },
  previewContainer: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.electricTeal,
  },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm, marginBottom: SPACING.sm,
  },
  previewName: { flex: 1, color: COLORS.textPrimary, fontSize: 14, marginHorizontal: SPACING.sm },
  imagePreview: { width: '100%', height: 250, borderRadius: BORDER_RADIUS.md, resizeMode: 'cover' },
  docPreview: { width: '100%', height: 250, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  docPreviewText: { color: COLORS.textSecondary, marginTop: SPACING.sm, fontSize: 16 },
  footer: {
    padding: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background,
  },
  submitBtn: {
    backgroundColor: COLORS.electricTeal, paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.md, alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: COLORS.textTertiary },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
});
