import { getInfoAsync } from 'expo-file-system/legacy';

export type AttachmentChannelType = 'WHATSAPP' | 'MESSENGER' | 'INSTAGRAM' | 'TIKTOK' | string;

export const COMPOSER_MAX_ATTACHMENT_COUNT = 100;

const KB = 1024;
const MB = 1024 * KB;

const COMPOSER_MAX_FILE_SIZE = {
  document: 100 * MB,
  audio: 16 * MB,
  messengerAttachment: 25 * MB,
  video: 16 * MB,
  image: 5 * MB,
  tiktokImage: 3 * MB,
} as const;

const WHATSAPP_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'video/mp4',
  'video/3gpp',
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
  'audio/opus',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
] as const;

const MESSENGER_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4',
  'video/3gpp',
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
] as const;

const INSTAGRAM_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4',
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
] as const;

const TIKTOK_ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  '3gpp': 'video/3gpp',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  amr: 'audio/amr',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  webm: 'audio/webm',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
};

export function formatAttachmentSize(sizeBytes: number | null | undefined) {
  if (typeof sizeBytes !== 'number' || Number.isNaN(sizeBytes)) return null;
  if (sizeBytes < KB) return `${sizeBytes} B`;
  if (sizeBytes < MB) return `${(sizeBytes / KB).toFixed(sizeBytes < 10 * KB ? 1 : 0)} KB`;
  return `${(sizeBytes / MB).toFixed(1)} MB`;
}

export function normalizeComposerMimeType(
  mimeType: string | null | undefined,
  fileName?: string | null,
  fallback = 'application/octet-stream',
) {
  const raw = (mimeType ?? '').trim().toLowerCase();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw) return raw;
  const ext = fileName?.split('.').pop()?.toLowerCase();
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return fallback;
}

function acceptedMimeTypes(channelType: AttachmentChannelType) {
  const channel = String(channelType ?? 'WHATSAPP').toUpperCase();
  if (channel === 'MESSENGER') return MESSENGER_ACCEPTED_MIME_TYPES;
  if (channel === 'INSTAGRAM') return INSTAGRAM_ACCEPTED_MIME_TYPES;
  if (channel === 'TIKTOK') return TIKTOK_ACCEPTED_MIME_TYPES;
  return WHATSAPP_ACCEPTED_MIME_TYPES;
}

export function isComposerMimeTypeAccepted(mimeType: string, channelType: AttachmentChannelType = 'WHATSAPP') {
  return (acceptedMimeTypes(channelType) as readonly string[]).includes(mimeType);
}

function isDocumentMimeType(mimeType: string) {
  return (
    mimeType === 'application/pdf'
    || mimeType === 'application/msword'
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mimeType === 'application/vnd.ms-excel'
    || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || mimeType === 'application/vnd.ms-powerpoint'
    || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    || mimeType === 'text/plain'
    || mimeType === 'text/csv'
  );
}

export async function resolveAttachmentSizeBytes(uri: string, reportedSize?: number | null) {
  if (typeof reportedSize === 'number' && Number.isFinite(reportedSize) && reportedSize >= 0) {
    return reportedSize;
  }
  try {
    const info = await getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number') return info.size;
  } catch {
    // ignore — size checks will be skipped when unknown
  }
  return null;
}

export async function getComposerAttachmentValidationError(input: {
  mimeType: string;
  sizeBytes?: number | null;
  channelType?: AttachmentChannelType;
}) {
  const channelType = String(input.channelType ?? 'WHATSAPP').toUpperCase();
  const mimeType = normalizeComposerMimeType(input.mimeType);

  if (!isComposerMimeTypeAccepted(mimeType, channelType)) {
    if (channelType === 'MESSENGER') {
      return 'Messenger supports image, video, audio, and file attachments up to 25 MB.';
    }
    if (channelType === 'INSTAGRAM') {
      return 'Instagram messaging supports image, GIF, video, and audio attachments; document files are not supported.';
    }
    if (channelType === 'TIKTOK') {
      return 'TikTok Business Messaging supports JPEG and PNG image attachments up to 3 MB.';
    }
    return 'WhatsApp supports JPEG/PNG images, MP4/3GPP video, supported audio, PDF, Word, Excel, PowerPoint, and plain-text documents.';
  }

  const size = input.sizeBytes;
  if (size == null) return null;

  if (channelType === 'MESSENGER') {
    return size > COMPOSER_MAX_FILE_SIZE.messengerAttachment
      ? `Messenger attachments must be ${formatAttachmentSize(COMPOSER_MAX_FILE_SIZE.messengerAttachment)} or smaller.`
      : null;
  }

  if (channelType === 'TIKTOK') {
    return size > COMPOSER_MAX_FILE_SIZE.tiktokImage
      ? `TikTok images must be ${formatAttachmentSize(COMPOSER_MAX_FILE_SIZE.tiktokImage)} or smaller.`
      : null;
  }

  if (mimeType.startsWith('image/')) {
    return size > COMPOSER_MAX_FILE_SIZE.image
      ? `Images must be ${formatAttachmentSize(COMPOSER_MAX_FILE_SIZE.image)} or smaller.`
      : null;
  }
  if (mimeType.startsWith('video/')) {
    return size > COMPOSER_MAX_FILE_SIZE.video
      ? `Videos must be ${formatAttachmentSize(COMPOSER_MAX_FILE_SIZE.video)} or smaller.`
      : null;
  }
  if (mimeType.startsWith('audio/')) {
    return size > COMPOSER_MAX_FILE_SIZE.audio
      ? `Audio and voice messages must be ${formatAttachmentSize(COMPOSER_MAX_FILE_SIZE.audio)} or smaller.`
      : null;
  }
  if (!isDocumentMimeType(mimeType)) return null;
  return size > COMPOSER_MAX_FILE_SIZE.document
    ? `Documents must be ${formatAttachmentSize(COMPOSER_MAX_FILE_SIZE.document)} or smaller.`
    : null;
}
