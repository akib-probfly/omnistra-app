import type { WhatsappTemplate } from '../api/whatsappTemplates';
import type { BroadcastTemplateHeaderMedia, BroadcastTemplateHeaderMediaMap } from '../api/broadcast';

const VARIABLE_TOKEN = /\{\{([^}]+)\}\}/g;

export const CONTACT_FIELD_OPTIONS = [
  { value: 'displayName', label: 'Contact name' },
  { value: 'primaryPhone', label: 'Phone number' },
  { value: 'primaryEmail', label: 'Email' },
  { value: 'country', label: 'Country' },
  { value: 'city', label: 'City' },
  { value: 'companyName', label: 'Company name' },
] as const;

export function extractVariableNames(value: string | null | undefined) {
  if (!value) return [];
  return Array.from(value.matchAll(VARIABLE_TOKEN), (match) => match[1].trim()).filter(Boolean);
}

export function getTemplateVariableNames(template: WhatsappTemplate) {
  const names = new Set<string>();
  template.variables.forEach((variable) => names.add(String(variable.index)));
  [
    template.header.type === 'TEXT' ? template.header.content : '',
    template.body,
    ...template.buttons.flatMap((button) => [button.label, button.url ?? '']),
  ].forEach((value) => {
    extractVariableNames(value).forEach((name) => names.add(name));
  });

  return Array.from(names).sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    return Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
      ? leftNumber - rightNumber
      : left.localeCompare(right);
  });
}

export function hasMappedValue(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isContactRef(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith('@contact:');
}

export function contactFieldFromVal(value: string | null | undefined) {
  return isContactRef(value) ? value!.slice(9) : 'displayName';
}

export function areTemplateVariablesMapped(
  templates: WhatsappTemplate[],
  mappings: Record<string, Record<string, string>>,
) {
  return templates.every((template) =>
    getTemplateVariableNames(template).every((variable) => hasMappedValue(mappings[template.id]?.[variable])),
  );
}

export function isTemplateMediaHeaderType(
  headerType: WhatsappTemplate['header']['type'],
): headerType is 'IMAGE' | 'VIDEO' | 'DOCUMENT' {
  return headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT';
}

export function areTemplateHeadersMapped(
  templates: WhatsappTemplate[],
  headerMediaMap: BroadcastTemplateHeaderMediaMap,
) {
  return templates.every((template) => {
    if (!isTemplateMediaHeaderType(template.header.type)) return true;
    const media = headerMediaMap[template.id];
    return Boolean(media?.attachmentId) && media.headerType === template.header.type;
  });
}

export function headerMediaLabel(media?: BroadcastTemplateHeaderMedia | null) {
  return media?.fileName?.trim() || media?.attachmentId || 'Header media attached';
}
