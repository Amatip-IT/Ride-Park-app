import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useAuthStore } from '@/store/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';
/** Stay under a 1MB reverse-proxy limit, including multipart overhead. */
const MAX_UPLOAD_BYTES = 800_000;

function mimeFromFileName(fileName: string, fallback = 'image/jpeg') {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return fallback;
}

async function fileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
}

/** Phone photos are often several MB. Shrink them before the server rejects the upload. */
async function shrinkImage(uri: string, fileName: string): Promise<{ uri: string; fileName: string; mimeType: string }> {
  const originalSize = await fileSize(uri);
  if (originalSize > 0 && originalSize <= MAX_UPLOAD_BYTES) {
    return { uri, fileName, mimeType: mimeFromFileName(fileName) };
  }

  let width = 1600;
  let compress = 0.6;
  let current = uri;

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width } }],
      { compress, format: SaveFormat.JPEG },
    );
    current = result.uri;
    const size = await fileSize(current);
    if (size > 0 && size <= MAX_UPLOAD_BYTES) break;
    width = Math.round(width * 0.7);
    compress = Math.max(0.35, compress - 0.15);
  }

  const jpegName = fileName.replace(/\.\w+$/i, '') + '.jpg';
  return { uri: current, fileName: jpegName, mimeType: 'image/jpeg' };
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
  const isImage = (mimeType || mimeFromFileName(fileName)).startsWith('image/');
  const prepared = isImage
    ? await shrinkImage(uri, fileName)
    : { uri, fileName, mimeType: mimeType || mimeFromFileName(fileName) };
  const type = prepared.mimeType;
  const url = `${API_BASE_URL}${endpoint}`;

  const result = await FileSystem.uploadAsync(url, prepared.uri, {
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
    if (result.status === 413) {
      throw new Error('That file is too large for the server. Try a smaller photo.');
    }
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
