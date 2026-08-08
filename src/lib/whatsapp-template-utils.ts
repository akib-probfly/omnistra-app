import type {
  WhatsappAuthCodeDeliveryMethod,
  WhatsappTemplate,
  WhatsappTemplateButton,
  WhatsappTemplateButtonType,
  WhatsappTemplateFormValues,
  WhatsappTemplateHeaderType,
  WhatsappTemplateVariable,
  WhatsappTemplateVariableSection,
} from '../api/whatsappTemplates';

const VARIABLE_TOKEN = /\{\{(\d+)\}\}/g;

export function makeId(prefix = 'tmp') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeEmptyButton(type: WhatsappTemplateButtonType = 'QUICK_REPLY'): WhatsappTemplateButton {
  return { id: makeId('btn'), type, label: '' };
}

function parseSectionVariables(value: string, section: WhatsappTemplateVariableSection) {
  return Array.from(value.matchAll(VARIABLE_TOKEN)).map((match) => ({
    index: Number(match[1]),
    section,
  }));
}

export function extractTemplateVariableDefinitions(input: {
  headerType: WhatsappTemplateHeaderType;
  headerContent: string;
  body: string;
  buttons: WhatsappTemplateButton[];
  existingVariables?: WhatsappTemplateVariable[];
}) {
  const ordered = [
    ...(input.headerType === 'TEXT' ? parseSectionVariables(input.headerContent, 'HEADER') : []),
    ...parseSectionVariables(input.body, 'BODY'),
    ...input.buttons.flatMap((button) =>
      button.type === 'URL' && button.url ? parseSectionVariables(button.url, 'BUTTON') : [],
    ),
  ];

  const seen = new Map<number, WhatsappTemplateVariableSection>();
  ordered.forEach((item) => {
    if (!seen.has(item.index)) seen.set(item.index, item.section);
  });

  const existing = new Map((input.existingVariables ?? []).map((variable) => [variable.index, variable]));

  return Array.from(seen.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, section]) => {
      const current = existing.get(index);
      return {
        index,
        section,
        label: current?.label ?? '',
        sampleValue: current?.sampleValue ?? '',
      } satisfies WhatsappTemplateVariable;
    });
}

export function renumberTemplateVariables(input: {
  headerType: WhatsappTemplateHeaderType;
  headerContent: string;
  body: string;
  buttons: WhatsappTemplateButton[];
  variables?: WhatsappTemplateVariable[];
}) {
  const placements = [
    ...(input.headerType === 'TEXT' ? parseSectionVariables(input.headerContent, 'HEADER') : []),
    ...parseSectionVariables(input.body, 'BODY'),
    ...input.buttons.flatMap((button) =>
      button.type === 'URL' && button.url ? parseSectionVariables(button.url, 'BUTTON') : [],
    ),
  ];

  const uniqueSorted = Array.from(new Set(placements.map((item) => item.index))).sort((a, b) => a - b);
  const mapping = new Map(uniqueSorted.map((value, index) => [value, index + 1]));

  const replaceByMapping = (value: string) =>
    value.replace(VARIABLE_TOKEN, (_, token) => {
      const mapped = mapping.get(Number(token));
      return mapped ? `{{${mapped}}}` : '';
    });

  const nextHeaderContent = input.headerType === 'TEXT' ? replaceByMapping(input.headerContent) : input.headerContent;
  const nextBody = replaceByMapping(input.body);
  const nextButtons = input.buttons.map((button) =>
    button.type === 'URL' && button.url ? { ...button, url: replaceByMapping(button.url) } : button,
  );

  const nextVariables = extractTemplateVariableDefinitions({
    headerType: input.headerType,
    headerContent: nextHeaderContent,
    body: nextBody,
    buttons: nextButtons,
    existingVariables: (input.variables ?? []).map((variable) => ({
      ...variable,
      index: mapping.get(variable.index) ?? variable.index,
    })),
  });

  return {
    headerContent: nextHeaderContent,
    body: nextBody,
    buttons: nextButtons,
    variables: nextVariables,
  };
}

export function makeDraftTemplate(seed?: Partial<WhatsappTemplateFormValues>): WhatsappTemplateFormValues {
  const body = seed?.body ?? 'Hello {{1}},';
  const headerType = seed?.header?.type ?? 'NONE';
  const buttons = seed?.buttons ?? [];
  const numbered = renumberTemplateVariables({
    headerType,
    headerContent: headerType === 'TEXT' ? seed?.header?.content ?? '' : '',
    body,
    buttons,
    variables: seed?.variables,
  });

  return {
    name: seed?.name ?? '',
    category: seed?.category ?? 'UTILITY',
    marketingTemplateType: seed?.marketingTemplateType ?? 'DEFAULT',
    authCodeDeliveryMethod: seed?.authCodeDeliveryMethod ?? 'COPY_CODE',
    authIncludeSecurityRecommendation: seed?.authIncludeSecurityRecommendation ?? true,
    authIncludeExpirationNotice: seed?.authIncludeExpirationNotice ?? false,
    authCodeExpirationMinutes: seed?.authCodeExpirationMinutes,
    language: seed?.language ?? 'en_US',
    header: {
      enabled: seed?.header?.enabled ?? false,
      type: headerType,
      content: headerType === 'TEXT' ? numbered.headerContent : '',
    },
    body: numbered.body,
    footer: seed?.footer ?? '',
    buttons: numbered.buttons,
    variables: numbered.variables,
    version: seed?.version ?? 1,
  };
}

export function mapTemplateToForm(template: WhatsappTemplate): WhatsappTemplateFormValues {
  return makeDraftTemplate({
    name: template.name,
    category: template.category,
    marketingTemplateType: template.marketingTemplateType ?? 'DEFAULT',
    authCodeDeliveryMethod: template.authCodeDeliveryMethod ?? 'COPY_CODE',
    authIncludeSecurityRecommendation: template.authIncludeSecurityRecommendation ?? true,
    authIncludeExpirationNotice: template.authIncludeExpirationNotice ?? false,
    authCodeExpirationMinutes: template.authCodeExpirationMinutes,
    language: template.language,
    header: template.header,
    body: template.body,
    footer: template.footer,
    buttons: template.buttons ?? [],
    variables: template.variables ?? [],
    version: template.version,
  });
}

export function buildAuthenticationTemplateContent(input: {
  codeDeliveryMethod: WhatsappAuthCodeDeliveryMethod;
  includeSecurityRecommendation: boolean;
  includeExpirationNotice: boolean;
  expirationMinutes?: number;
}) {
  const bodyParts = ['{{1}} is your verification code.'];
  if (input.includeSecurityRecommendation) bodyParts.push('For your security, do not share this code.');
  if (input.includeExpirationNotice && input.expirationMinutes) {
    bodyParts.push(`This code expires in ${input.expirationMinutes} minutes.`);
  }

  return {
    body: bodyParts.join(' '),
    footer: '',
    buttons: [
      {
        id: makeId('otp'),
        type: 'OTP' as const,
        label: input.codeDeliveryMethod === 'ONE_TAP' ? 'Autofill code' : 'Copy code',
      },
    ],
  };
}

export function renderTemplateTextWithSamples(value: string, variables: WhatsappTemplateVariable[]) {
  const variableMap = new Map(
    variables.map((variable) => [variable.index, variable.sampleValue || `{{${variable.index}}}`]),
  );
  return value.replace(VARIABLE_TOKEN, (_, token) => variableMap.get(Number(token)) ?? `{{${token}}}`);
}

export function insertBodyVariable(body: string, variables: WhatsappTemplateVariable[]) {
  const nextIndex = (variables.reduce((max, variable) => Math.max(max, variable.index), 0) || 0) + 1;
  const nextBody = `${body}${body && !body.endsWith(' ') && !body.endsWith('\n') ? ' ' : ''}{{${nextIndex}}}`;
  return nextBody;
}

export function validateTemplateForm(form: WhatsappTemplateFormValues): string | null {
  if (!form.name.trim()) return 'Template name is required.';
  if (!/^[a-z0-9_]+$/.test(form.name.trim())) return 'Name must be lowercase letters, numbers, and underscores.';
  if (!form.language.trim()) return 'Language is required.';
  if (!form.body.trim()) return 'Body text is required.';
  if (form.body.length > 1024) return 'Body must be 1024 characters or fewer.';
  if (form.footer.length > 60) return 'Footer must be 60 characters or fewer.';
  if (form.header.enabled && form.header.type === 'TEXT' && !form.header.content.trim()) {
    return 'Header text is required when text header is enabled.';
  }
  if (form.buttons.length > 10) return 'A template can have at most 10 buttons.';
  for (const button of form.buttons) {
    if (!button.label.trim() && button.type !== 'OTP') return 'Each button needs a label.';
    if (button.type === 'URL' && button.url && !/^https?:\/\//i.test(button.url)) {
      return 'URL buttons must use http:// or https://.';
    }
    if (button.type === 'PHONE_NUMBER' && button.phoneNumber && !/^\+?[1-9]\d{6,14}$/.test(button.phoneNumber)) {
      return 'Phone buttons need a valid international number.';
    }
  }
  const missingSample = form.variables.find((variable) => !variable.sampleValue.trim());
  if (missingSample) return `Add a sample value for variable {{${missingSample.index}}}.`;
  return null;
}

export function formatTemplateUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
