import type { ConversationCallSession, ConversationListItem, ConversationListLastMessage } from '../api/inbox';
import {
  formatCallDurationLabel,
  getCallSessionSidebarPreview,
  getMessageBody,
  type MessageLike,
} from './inbox-utils';

export type ConversationLastInteractionPresentation = {
  kind: 'message' | 'call';
  timestamp: string | null;
  preview: string | null;
  message: ConversationListLastMessage | null;
  call: ConversationCallSession | null;
  direction: 'INBOUND' | 'OUTBOUND' | null;
};

const LIVE_CALL_PREVIEWS = new Set([
  'in call',
  'ringing',
  'call requested',
  'waiting for approval',
  'permission granted',
]);

const TERMINAL_CALL_PREVIEWS = new Set([
  'call ended',
  'call cancelled',
  'missed call',
  'call declined',
  'call rejected',
  'call failed',
]);

function normalizePreview(preview: string | null | undefined) {
  return preview?.trim().toLowerCase() ?? '';
}

function formatTerminalConversationCallPreview(
  preview: string | null | undefined,
  call: ConversationCallSession,
): string | null {
  const normalizedPreview = normalizePreview(preview);
  if (normalizedPreview !== 'call ended' || call.durationSeconds === null) {
    return preview ?? null;
  }
  const durationLabel = formatCallDurationLabel(call.durationSeconds);
  return durationLabel ? `Call ended - ${durationLabel}` : preview ?? null;
}

function getConversationMessageTimestamp(message: ConversationListLastMessage) {
  return message.sentAt ?? message.createdAt ?? null;
}

function getConversationCallTimestamp(call: ConversationCallSession) {
  return (
    call.endedAt
    ?? call.permissionRespondedAt
    ?? call.connectedAt
    ?? call.startedAt
    ?? call.requestedPermissionAt
    ?? call.updatedAt
    ?? call.createdAt
  );
}

export function getConversationLastInteractionPresentation(
  conversation: ConversationListItem,
): ConversationLastInteractionPresentation | null {
  const interaction = conversation.lastInteraction;

  if (interaction?.kind === 'MESSAGE') {
    return {
      kind: 'message',
      timestamp: getConversationMessageTimestamp(interaction.message),
      preview: getMessageBody(interaction.message as MessageLike),
      message: interaction.message,
      call: null,
      direction: interaction.message.direction ?? null,
    };
  }

  if (interaction?.kind === 'CALL') {
    const callTimestamp = getConversationCallTimestamp(interaction.call);
    const callPreview = getCallSessionSidebarPreview(interaction.call);
    const normalizedCallPreview = normalizePreview(callPreview);
    const normalizedConversationPreview = normalizePreview(conversation.lastMessagePreview);
    const shouldPreferFlowPreview =
      LIVE_CALL_PREVIEWS.has(normalizedCallPreview)
      && TERMINAL_CALL_PREVIEWS.has(normalizedConversationPreview)
      && Boolean(conversation.lastMessageAt)
      && Date.parse(conversation.lastMessageAt ?? '') >= Date.parse(callTimestamp ?? '');

    return {
      kind: 'call',
      timestamp: shouldPreferFlowPreview
        ? (conversation.lastMessageAt ?? null)
        : (callTimestamp ?? null),
      preview: shouldPreferFlowPreview
        ? formatTerminalConversationCallPreview(conversation.lastMessagePreview, interaction.call)
        : callPreview,
      message: null,
      call: interaction.call,
      direction: interaction.call.direction ?? null,
    };
  }

  if (conversation.lastMessageAt || conversation.lastMessagePreview) {
    return {
      kind: 'message',
      timestamp: conversation.lastMessageAt ?? conversation.updatedAt ?? null,
      preview: conversation.lastMessagePreview ?? 'Waiting for the first message.',
      message: null,
      call: null,
      // Fallback when API omits lastInteraction: unreplied ≈ last activity inbound.
      direction: conversation.isUnreplied ? 'INBOUND' : 'OUTBOUND',
    };
  }

  return null;
}

export function isVoiceNotePreview(preview: string | null | undefined) {
  const value = normalizePreview(preview);
  return value === '[voice note]' || value === 'voice note';
}

export function isAudioPreview(preview: string | null | undefined) {
  const value = normalizePreview(preview);
  return value === '[audio]' || value === 'audio' || /\.(aac|amr|m4a|mp3|ogg|opus|wav|webm)$/i.test(value);
}

export function isImagePreview(preview: string | null | undefined) {
  const value = normalizePreview(preview);
  return value === '[image]' || value === 'image';
}

export function isVideoPreview(preview: string | null | undefined) {
  const value = normalizePreview(preview);
  return value === '[video]' || value === 'video';
}

export type CallPreviewChipConfig = {
  label: string;
  backgroundColor: string;
  textColor: string;
  tone: 'missed' | 'declined' | 'ended' | 'incoming' | 'live';
};

export function getCallPreviewChipConfig(preview: string | null | undefined): CallPreviewChipConfig | null {
  const normalizedPreview = normalizePreview(preview);

  if (normalizedPreview === 'missed call' || normalizedPreview === 'call missed') {
    return { label: 'Missed call', backgroundColor: '#fff1f2', textColor: '#be123c', tone: 'missed' };
  }
  if (normalizedPreview === 'call declined' || normalizedPreview === 'call rejected') {
    return { label: 'Call declined', backgroundColor: '#fff7ed', textColor: '#c2410c', tone: 'declined' };
  }
  if (normalizedPreview.startsWith('call ended') || normalizedPreview.startsWith('call cancelled')) {
    return {
      label: normalizedPreview.startsWith('call cancelled') ? 'Call cancelled' : (preview?.trim() || 'Call ended'),
      backgroundColor: '#f1f5f9',
      textColor: '#334155',
      tone: 'ended',
    };
  }
  if (normalizedPreview === 'incoming call' || normalizedPreview === 'ringing') {
    return {
      label: normalizedPreview === 'ringing' ? 'Ringing' : 'Incoming call',
      backgroundColor: '#f0f9ff',
      textColor: '#0369a1',
      tone: 'incoming',
    };
  }
  if (normalizedPreview === 'in call') {
    return { label: 'In call', backgroundColor: '#ecfdf5', textColor: '#047857', tone: 'live' };
  }
  return null;
}
