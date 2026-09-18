import * as FileSystem from 'expo-file-system/legacy';
import { useAuthStore } from '@/store/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';

function mimeFromFileName(fileName: string, fallback = 'image/jpeg') {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return fallback;
}

/**
 * Upload a local file with Expo's native multipart API.
 * RN 0.81+ / Expo SDK 53+ throws "unsupported FormDataPart" if we append { uri, name, type }.
 */
export async function uploadLocalFile(
  endpoint: '/users/upload-file' | '/provider/upload-document',
  uri: string,
  fileName: string,
  mimeType?: string,
): Promise<{ success: boolean; url?: string; message?: string }> {
  const token = useAuthStore.getState().token;
  const type = mimeType || mimeFromFileName(fileName);
  const url = `${API_BASE_URL}${endpoint}`;

  const result = await FileSystem.uploadAsync(url, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: type,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let data: { success?: boolean; url?: string; message?: string } = {};
  try {
    data = result.body ? JSON.parse(result.body) : {};
  } catch {
    throw new Error(`Server returned non-JSON response (HTTP ${result.status})`);
  }

  if (result.status < 200 || result.status >= 300 || !data?.success || !data?.url) {
    throw new Error(data?.message || `Upload failed with HTTP ${result.status}`);
  }

  return data;
}

export async function uploadFileToS3(
  uri: string,
  fileName: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const data = await uploadLocalFile('/users/upload-file', uri, fileName, mimeType);
  return data.url as string;
}
