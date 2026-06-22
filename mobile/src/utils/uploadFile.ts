import { Platform } from 'react-native';
import { useAuthStore } from '@/store/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';

export async function uploadFileToS3(
  uri: string,
  fileName: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const token = useAuthStore.getState().token;
  const formData = new FormData();
  formData.append('file', {
    uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
    name: fileName,
    type: mimeType,
  } as any);

  const response = await fetch(`${API_BASE_URL}/users/upload-file`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok || !data?.success || !data?.url) {
    throw new Error(data?.message || `Upload failed with HTTP ${response.status}`);
  }

  return data.url as string;
}
