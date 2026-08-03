export type ChannelType =
  | 'WHATSAPP'
  | 'MESSENGER'
  | 'INSTAGRAM'
  | 'EMAIL'
  | 'WEBCHAT'
  | 'SMS'
  | 'TELEGRAM'
  | 'TIKTOK';

export type ChannelConnectionStatus =
  | 'PENDING'
  | 'CONNECTED'
  | 'NEEDS_ACTION'
  | 'DISCONNECTED'
  | 'ERROR';

export type ChannelAccount = {
  id: string;
  provider: string;
  externalAccountId: string;
  displayName: string | null;
  pageId: string | null;
  pageName: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  lastWebhookError: string | null;
  webhookStatus: ChannelConnectionStatus;
  isEnabled: boolean;
  connectedAt: string | null;
  disconnectedAt: string | null;
};

export type ChannelLifecycle = {
  isPaused: boolean;
  pausedAt: string | null;
  pauseReason: string | null;
  isRemoved: boolean;
  removedAt: string | null;
  removeReason: string | null;
  purgeAt: string | null;
  canProcessEvents: boolean;
};

export type ChannelCapabilities = {
  canStartCalls: boolean;
  callDisabledReason: string | null;
  callSettingStatus: 'PENDING' | 'ENABLED' | 'FAILED' | 'DISABLED' | null;
};

export type WhatsappCallingSetting = {
  id: string;
  status: 'PENDING' | 'ENABLED' | 'FAILED' | 'DISABLED';
  whatsappCallingEnabled: boolean;
  whatsappCallingStatus: 'ENABLED' | 'DISABLED' | null;
  whatsappCallingLastSyncedAt: string | null;
  lastError: string | null;
};

export type Channel = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  type: ChannelType;
  name: string;
  status: ChannelConnectionStatus;
  createdAt: string;
  updatedAt: string;
  accounts: ChannelAccount[];
  messagesLast24h?: number;
  lifecycle?: ChannelLifecycle | null;
  capabilities?: ChannelCapabilities | null;
  templateCounts?: WhatsappChannelTemplateCounts | null;
  lastWebhookError?: string | null;
  callBusinessCallingSetting?: WhatsappCallingSetting | null;
};

export type WhatsappChannelTemplateCounts = {
  total: number;
  approved: number;
  pending: number;
  failed: number;
  rejected: number;
};

export type WhatsappChannelConfiguration = {
  provider: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  businessAccountId: string | null;
};

export type MessengerChannelConfiguration = {
  provider: string;
  pageId: string | null;
  pageName: string | null;
  businessAccountId: string | null;
  webhookSubscriptionStatus: ChannelConnectionStatus | null;
  lastWebhookError: string | null;
};

export type ChannelDetails = Channel & {
  configuration?: WhatsappChannelConfiguration | MessengerChannelConfiguration | null;
  lifecycle: ChannelLifecycle;
  capabilities?: ChannelCapabilities | null;
  templateCounts?: WhatsappChannelTemplateCounts | null;
  lastWebhookError?: string | null;
  businessProfile?: WhatsappBusinessProfile | null;
};

export type ChannelsListSummary = {
  connectedCount: number;
  activeTodayCount: number;
  issuesCount: number;
  messagesLast24h: number;
};

export type ChannelsListResponse = {
  items: Channel[];
  meta?: { page: number; limit: number; total: number; totalPages: number };
  summary?: ChannelsListSummary;
};

export type WhatsappBusinessProfile = {
  messagingProduct: 'whatsapp';
  about: string | null;
  address: string | null;
  description: string | null;
  email: string | null;
  websites: string[];
  vertical: string | null;
  profilePictureUrl: string | null;
  profilePictureHandle: string | null;
};

export type WhatsappBusinessProfileUpdateInput = {
  about?: string | null;
  address?: string | null;
  description?: string | null;
  email?: string | null;
  websites?: string[] | null;
  vertical?: string | null;
  profilePictureHandle?: string | null;
};

export type WhatsAppConnectLaunch = {
  provider: 'meta_whatsapp_embedded_signup';
  channelType: 'WHATSAPP';
  workspaceId: string;
  workspaceName: string;
  state: string;
  launchUrl: string;
  redirectUri: string;
  expiresAt: string;
};

import { apiFetch } from './client';

export function fetchChannels() {
  return apiFetch<ChannelsListResponse>(
    '/channels?page=1&limit=100&sortBy=createdAt&sortOrder=desc',
  );
}

export function fetchChannelDetails(channelId: string) {
  return apiFetch<ChannelDetails>(`/channels/${channelId}`);
}

export function fetchWhatsappBusinessProfile(channelId: string) {
  return apiFetch<WhatsappBusinessProfile | null>(
    `/channels/${channelId}/whatsapp/business-profile`,
  );
}

export function updateWhatsappBusinessProfile(
  channelId: string,
  values: WhatsappBusinessProfileUpdateInput,
) {
  return apiFetch<WhatsappBusinessProfile | null>(
    `/channels/${channelId}/whatsapp/business-profile`,
    {
      method: 'POST',
      body: JSON.stringify(values),
    },
  );
}

export function syncWhatsappBusinessProfile(channelId: string) {
  return apiFetch<WhatsappBusinessProfile | null>(
    `/channels/${channelId}/whatsapp/business-profile/sync`,
    { method: 'POST' },
  );
}

export function pauseChannel(channelId: string) {
  return apiFetch<ChannelDetails>(`/channels/${channelId}/pause`, {
    method: 'PATCH',
  });
}

export function resumeChannel(channelId: string) {
  return apiFetch<ChannelDetails>(`/channels/${channelId}/resume`, {
    method: 'PATCH',
  });
}

export function restoreChannel(channelId: string) {
  return apiFetch<ChannelDetails>(`/channels/${channelId}/restore`, {
    method: 'PATCH',
  });
}

export function removeChannel(channelId: string, retentionHours = 1) {
  return apiFetch<ChannelDetails>(
    `/channels/${channelId}?retentionHours=${retentionHours}`,
    { method: 'DELETE' },
  );
}

export function startWhatsAppConnect(workspaceId: string) {
  return apiFetch<WhatsAppConnectLaunch>('/channels/whatsapp/connect', {
    method: 'POST',
    body: JSON.stringify({ workspaceId }),
  });
}

export function startMessengerConnect(workspaceId: string) {
  return apiFetch<{ state: string; launchUrl: string }>(
    '/channels/messenger/connect',
    {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    },
  );
}

export type ChannelQuickAutomationDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type ChannelQuickAutomationBusinessHour = { enabled: boolean; from: string; to: string };
export type ChannelQuickAutomationBusinessHours = Record<ChannelQuickAutomationDay, ChannelQuickAutomationBusinessHour>;

export type ChannelQuickAutomationSettings = {
  channelId: string;
  workspaceId: string;
  channelType: ChannelType;
  hasStoredSettings: boolean;
  welcomeEnabled: boolean;
  welcomeMessage: string | null;
  welcomeAttachments: unknown[];
  welcomeSendFrequency: 'LIFETIME' | 'TWENTY_FOUR_HOURS' | 'EVERY_TIME';
  offHourEnabled: boolean;
  offHourMessage: string | null;
  offHourAttachments: unknown[];
  timezone: string;
  businessHours: ChannelQuickAutomationBusinessHours;
  channelSpecific: unknown | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ChannelQuickAutomationSettingsUpdateInput = {
  welcomeEnabled: boolean;
  welcomeMessage: string | null;
  welcomeAttachments: unknown[];
  welcomeSendFrequency: 'LIFETIME' | 'TWENTY_FOUR_HOURS' | 'EVERY_TIME';
  offHourEnabled: boolean;
  offHourMessage: string | null;
  offHourAttachments: unknown[];
  businessHours: ChannelQuickAutomationBusinessHours;
  channelSpecific?: unknown | null;
};

export function fetchChannelQuickAutomationSettings(channelId: string) {
  return apiFetch<ChannelQuickAutomationSettings>(`/channels/${channelId}/automation-settings`);
}

export function updateChannelQuickAutomationSettings(channelId: string, values: ChannelQuickAutomationSettingsUpdateInput) {
  return apiFetch<ChannelQuickAutomationSettings>(`/channels/${channelId}/automation-settings`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  });
}

export type WhatsappCallingUpdateResponse = {
  success: true;
  calling: {
    enabled: boolean;
    status: 'ENABLED' | 'DISABLED' | null;
    callIconVisibility: string | null;
    callbackPermissionStatus: string | null;
    lastSyncedAt: string | null;
    syncStatus: 'SUCCESS' | 'FAILED';
    syncError: string | null;
  };
};

export function updateWhatsappChannelCalling(channelId: string, enabled: boolean) {
  return apiFetch<WhatsappCallingUpdateResponse>(`/channels/whatsapp/${channelId}/calling-settings`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export function syncWhatsappChannelCallingSettings(channelId: string) {
  return apiFetch<WhatsappCallingUpdateResponse>(`/calls/whatsapp/channels/${channelId}/calling-settings/sync`, {
    method: 'POST',
  });
}