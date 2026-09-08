import { Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { apiUrl } from '../api/client';
import { downloadMedia } from '../components/AuthenticatedImage';

const ANDROID_GRANT_READ_URI_PERMISSION = 1;

function guessMimeType(uri: string, fallback?: string | null) {
  if (fallback) return fallback;
  const path = uri.toLowerCase().split('?')[0];
  if (path.endsWith('.pdf')) return 'application/pdf';
  if (path.endsWith('.txt')) return 'text/plain';
  if (path.endsWith('.csv')) return 'text/csv';
  if (path.endsWith('.doc')) return 'application/msword';
  if (path.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (path.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (path.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (path.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (path.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  return 'application/octet-stream';
}

export async function openDownloadedAttachment(downloadUrl?: string | null, mimeType?: string | null) {
  const resolvedUrl = apiUrl(downloadUrl ?? null);
  if (!resolvedUrl) {
    throw new Error('File is not available.');
  }

  const localUri = await downloadMedia(resolvedUrl);

  if (Platform.OS === 'android') {
    const contentUri = await FileSystem.getContentUriAsync(localUri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: guessMimeType(localUri, mimeType),
      flags: ANDROID_GRANT_READ_URI_PERMISSION,
    });
    return;
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri);
    return;
  }

  await Linking.openURL(localUri);
}
