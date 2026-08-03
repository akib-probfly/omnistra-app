import { apiFetch } from './client';

export type WhatsappTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type WhatsappTemplateStatus = 'DRAFT' | 'PROCESSING' | 'FAILED' | 'DELETED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | (string & {});

export type WhatsappTemplate = {
  id: string;
  name: string;
  category: WhatsappTemplateCategory;
  language: string;
  status: WhatsappTemplateStatus;
  header: { enabled: boolean; type: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; content: string };
  body: string;
  footer: string;
  buttons: Array<{ id: string; type: string; label: string; url?: string; phoneNumber?: string; offerCode?: string }>;
  variables: Array<{ index: number; label: string; sampleValue: string; section: 'HEADER' | 'BODY' | 'BUTTON' }>;
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
  header: { enabled: boolean; type: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; content: string };
  body: string;
  footer: string;
  buttons: Array<{ id: string; type: string; label: string; url?: string; phoneNumber?: string; offerCode?: string }>;
  variables: Array<{ index: number; label: string; sampleValue: string; section: 'HEADER' | 'BODY' | 'BUTTON' }>;
};

export function buildCreateTemplatePayload(template: WhatsappTemplateFormValues) {
  const buttonsJson =
    template.buttons.length > 0
      ? [
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
        ]
      : undefined;

  return {
    name: template.name,
    language: template.language,
    category: template.category,
    headerType: template.header.enabled && template.header.type !== 'NONE' ? template.header.type : undefined,
    headerText: template.header.enabled && template.header.type === 'TEXT' ? template.header.content : undefined,
    bodyText: template.body,
    footerText: template.footer || undefined,
    buttonsJson,
    sampleVariablesJson: template.variables,
  };
}

export function buildUpdateTemplatePayload(template: WhatsappTemplateFormValues) {
  const buttonsJson =
    template.buttons.length > 0
      ? [
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
        ]
      : undefined;

  return {
    category: template.category,
    headerType: template.header.enabled && template.header.type !== 'NONE' ? template.header.type : undefined,
    headerText: template.header.enabled && template.header.type === 'TEXT' ? template.header.content : undefined,
    bodyText: template.body,
    footerText: template.footer || undefined,
    buttonsJson,
    sampleVariablesJson: template.variables,
  };
}

export function fetchWhatsappTemplates(channelId: string) {
  return apiFetch<WhatsappTemplatesListResponse>(`/channels/${channelId}/whatsapp/templates`);
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
