import { Platform } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import Constants from 'expo-constants';

// ✅ FIX: Use the same API URL pattern as your other API files
// Never use localhost as fallback for mobile apps
const API_BASE_URL = 
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'https://www.gleezip.com/api'; // Use production fallback instead of localhost

export async function uploadFileToS3(
  uri: string,
  fileName: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const token = useAuthStore.getState().token;
  
  if (!token) {
    throw new Error('No authentication token found. Please log in again.');
  }

  const formData = new FormData();
  
  // ✅ FIX: Properly handle file URI for different platforms
  const fileUri = Platform.OS === 'ios' ? uri.replace('file://', '') : uri;
  
  formData.append('file', {
    uri: fileUri,
    name: fileName || 'upload.jpg',
    type: mimeType,
  } as any);

  console.log(`📤 Uploading file to: ${API_BASE_URL}/users/upload-file`);
  console.log(`📄 File: ${fileName}, Type: ${mimeType}, Size: ${uri.length}`);

  try {
    const response = await fetch(`${API_BASE_URL}/users/upload-file`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    let data: any;
    const responseText = await response.text();
    
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('❌ Non-JSON response:', responseText);
      throw new Error(`Server returned non-JSON response (HTTP ${response.status})`);
    }

    if (!response.ok) {
      console.error('❌ Upload failed:', data);
      throw new Error(data?.message || `Upload failed with HTTP ${response.status}`);
    }

    if (!data?.success) {
      throw new Error(data?.message || 'Upload failed: Server returned unsuccessful response');
    }

    if (!data?.url) {
      throw new Error('Upload failed: No URL returned from server');
    }

    console.log('✅ File uploaded successfully:', data.url);
    return data.url as string;
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    
    // Provide more helpful error messages
    if (error.message?.includes('Network request failed') || error.message?.includes('fetch')) {
      throw new Error(
        `Cannot connect to server at ${API_BASE_URL}. ` +
        'Please check your internet connection and that the server is running.'
      );
    }
    
    throw error;
  }
}

// Optional: Add a helper for multiple file uploads
export async function uploadMultipleFiles(
  files: Array<{ uri: string; name: string; type?: string }>
): Promise<string[]> {
  const token = useAuthStore.getState().token;
  
  if (!token) {
    throw new Error('No authentication token found. Please log in again.');
  }

  const formData = new FormData();
  
  files.forEach((file, index) => {
    const fileUri = Platform.OS === 'ios' ? file.uri.replace('file://', '') : file.uri;
    formData.append('files', {
      uri: fileUri,
      name: file.name || `upload_${index}.jpg`,
      type: file.type || 'image/jpeg',
    } as any);
  });

  try {
    const response = await fetch(`${API_BASE_URL}/users/upload-multiple`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok || !data?.success) {
      throw new Error(data?.message || 'Upload failed');
    }

    if (!data?.urls || !Array.isArray(data.urls)) {
      throw new Error('No URLs returned from server');
    }

    return data.urls as string[];
  } catch (error: any) {
    console.error('❌ Multiple upload error:', error);
    throw error;
  }
}
