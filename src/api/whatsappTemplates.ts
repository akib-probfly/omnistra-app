import { apiFetch } from './client';
import { mapRemoteTemplate } from '../lib/whatsapp-template-utils';

export type WhatsappTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type WhatsappTemplateStatus =
  | 'DRAFT'
  | 'PROCESSING'
  | 'FAILED'
  | 'DELETED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | (string & {});
export type WhatsappTemplateHeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
export type WhatsappTemplateButtonType =
  | 'QUICK_REPLY'
  | 'URL'
  | 'PHONE_NUMBER'
  | 'CALL_TO_WHATSAPP'
  | 'COPY_CODE'
  | 'OTP';
export type WhatsappMarketingTemplateType = 'DEFAULT' | 'CATALOG' | 'CALL_PERMISSION_REQUEST';
export type WhatsappAuthCodeDeliveryMethod = 'ONE_TAP' | 'COPY_CODE';
export type WhatsappTemplateVariableSection = 'HEADER' | 'BODY' | 'BUTTON';

export type WhatsappTemplateButton = {
  id: string;
  type: WhatsappTemplateButtonType;
  label: string;
  url?: string;
  phoneNumber?: string;
  offerCode?: string;
};

export type WhatsappTemplateVariable = {
  index: number;
  label: string;
  sampleValue: string;
  section: WhatsappTemplateVariableSection;
};

export type WhatsappTemplateHeader = {
  enabled: boolean;
  type: WhatsappTemplateHeaderType;
  content: string;
};

export type WhatsappTemplate = {
  id: string;
  name: string;
  category: WhatsappTemplateCategory;
  marketingTemplateType?: WhatsappMarketingTemplateType;
  authCodeDeliveryMethod?: WhatsappAuthCodeDeliveryMethod;
  authIncludeSecurityRecommendation?: boolean;
  authIncludeExpirationNotice?: boolean;
  authCodeExpirationMinutes?: number;
  language: string;
  status: WhatsappTemplateStatus;
  header: WhatsappTemplateHeader;
  body: string;
  footer: string;
  buttons: WhatsappTemplateButton[];
  variables: WhatsappTemplateVariable[];
  version: number;
  metaId: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  source: 'draft' | 'remote';
};

export type WhatsappTemplatesListResponse = {
  items: WhatsappTemplate[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
};

export type WhatsappTemplateSyncResponse = {
  workspaceId: string;
  channelId: string;
  wabaId: string;
  syncedAt: string;
  fetchedCount: number;
  upsertedCount: number;
  deletedCount: number;
  approvedCount: number;
  rejectedCount: number;
};

export type WhatsappTemplateFormValues = {
  name: string;
  language: string;
  category: WhatsappTemplateCategory;
  marketingTemplateType: WhatsappMarketingTemplateType;
  authCodeDeliveryMethod: WhatsappAuthCodeDeliveryMethod;
  authIncludeSecurityRecommendation: boolean;
  authIncludeExpirationNotice: boolean;
  authCodeExpirationMinutes?: number;
  header: WhatsappTemplateHeader;
  body: string;
  footer: string;
  buttons: WhatsappTemplateButton[];
  variables: WhatsappTemplateVariable[];
  version: number;
};

function buildButtonsJson(template: WhatsappTemplateFormValues) {
  if (template.buttons.length === 0) return undefined;
  return [
    {
      type: 'BUTTONS',
      buttons: template.buttons.map((button) => ({
        type: button.type,
        text: button.label,
        ...(button.type === 'URL' && button.url ? { url: button.url } : {}),
        ...(button.type === 'PHONE_NUMBER' && button.phoneNumber ? { phone_number: button.phoneNumber } : {}),
        ...(button.type === 'COPY_CODE' && button.offerCode ? { example: button.offerCode } : {}),
      })),
    },
  ];
}

function buildSampleVariablesJson(template: WhatsappTemplateFormValues) {
  const samples = [...template.variables];

  if (
    template.header.enabled
    && template.header.type !== 'NONE'
    && template.header.type !== 'TEXT'
    && template.header.content.trim()
  ) {
    samples.unshift({
      index: 1,
      label: 'header',
      sampleValue: template.header.content.trim(),
      section: 'HEADER' as const,
    });
  }

  return samples;
}

export function buildCreateTemplatePayload(template: WhatsappTemplateFormValues) {
  return {
    name: template.name.trim(),
    language: template.language,
    category: template.category,
    headerType: template.header.enabled && template.header.type !== 'NONE' ? template.header.type : undefined,
    headerText: template.header.enabled && template.header.type === 'TEXT' ? template.header.content : undefined,
    bodyText: template.body,
    footerText: template.footer || undefined,
    buttonsJson: buildButtonsJson(template),
    sampleVariablesJson: buildSampleVariablesJson(template),
  };
}

export function buildUpdateTemplatePayload(template: WhatsappTemplateFormValues) {
  return {
    category: template.category,
    headerType: template.header.enabled && template.header.type !== 'NONE' ? template.header.type : undefined,
    headerText: template.header.enabled && template.header.type === 'TEXT' ? template.header.content : undefined,
    bodyText: template.body,
    footerText: template.footer || undefined,
    buttonsJson: buildButtonsJson(template),
    sampleVariablesJson: buildSampleVariablesJson(template),
  };
}

export async function fetchWhatsappTemplates(channelId: string) {
  const response = await apiFetch<{
    items: Array<Record<string, unknown>>;
    pageInfo?: { nextCursor: string | null; hasMore: boolean };
  }>(`/channels/${channelId}/whatsapp/templates`);

  return {
    items: (response.items ?? []).map((item) => mapRemoteTemplate(item as never)),
    pageInfo: response.pageInfo ?? { nextCursor: null, hasMore: false },
  } satisfies WhatsappTemplatesListResponse;
}

export function syncWhatsappTemplates(channelId: string) {
  return apiFetch<WhatsappTemplateSyncResponse>(`/channels/${channelId}/whatsapp/templates/sync`, { method: 'POST' });
}

export function createWhatsappTemplate(channelId: string, template: WhatsappTemplateFormValues) {
  return apiFetch<WhatsappTemplate>(`/channels/${channelId}/whatsapp/templates`, {
    method: 'POST',
    body: JSON.stringify(buildCreateTemplatePayload(template)),
  });
}

export function updateWhatsappTemplate(channelId: string, templateId: string, template: WhatsappTemplateFormValues) {
  return apiFetch<WhatsappTemplate>(`/channels/${channelId}/whatsapp/templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify(buildUpdateTemplatePayload(template)),
  });
}

export function deleteWhatsappTemplate(channelId: string, templateId: string) {
  return apiFetch<{ success: boolean }>(`/channels/${channelId}/whatsapp/templates/${templateId}`, { method: 'DELETE' });
}

export function unlinkWhatsappTemplate(channelId: string, templateId: string) {
  return apiFetch<{ success: boolean }>(`/channels/${channelId}/whatsapp/templates/${templateId}/unlink`, { method: 'POST' });
}
