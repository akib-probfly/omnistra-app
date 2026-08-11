import type { WhatsappTemplate } from '../api/whatsappTemplates';

type HeaderMedia = {
  downloadUrl: string;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  originalName?: string | null;
};

function getTokenIndices(value: string): number[] {
  return Array.from(value.matchAll(/\{\{(\d+)\}\}/g)).map((match) => Number(match[1]));
}

export function isMediaHeaderType(
  headerType?: string | null,
): headerType is 'IMAGE' | 'VIDEO' | 'DOCUMENT' {
  return headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT';
}

export function getTemplateButtonVariables(template: WhatsappTemplate) {
  const buttonVariables: Array<{
    buttonIndex: number;
    buttonLabel: string;
    variable: NonNullable<WhatsappTemplate['variables']>[number];
  }> = [];

  (template.buttons ?? []).forEach((button, buttonIndex) => {
    if (button.type !== 'URL' || !button.url) return;
    const tokenIndices = getTokenIndices(button.url);
    tokenIndices.forEach((tokenIndex) => {
      const variable = (template.variables ?? []).find((item) => item.index === tokenIndex);
      if (!variable) return;
      buttonVariables.push({
        buttonIndex,
        buttonLabel: button.label || `Button ${buttonIndex + 1}`,
        variable,
      });
    });
  });

  return buttonVariables;
}

export function buildTemplateSendComponents(
  template: WhatsappTemplate,
  values: Record<number, string>,
  headerMedia: HeaderMedia | null,
) {
  const components: Array<Record<string, unknown>> = [];
  const header = template.header;

  if (header?.enabled && isMediaHeaderType(header.type) && headerMedia) {
    const parameterType = header.type.toLowerCase();
    const mediaPayload: Record<string, unknown> = {
      link: headerMedia.downloadUrl,
    };
    if (headerMedia.previewUrl) mediaPayload.previewUrl = headerMedia.previewUrl;
    if (header.type === 'DOCUMENT') {
      mediaPayload.filename = headerMedia.originalName ?? 'document';
    }
    components.push({
      type: 'header',
      parameters: [{ type: parameterType, [parameterType]: mediaPayload }],
    });
  } else if (header?.enabled && header.type === 'TEXT') {
    const headerTokenIndices = getTokenIndices(header.content ?? '');
    if (headerTokenIndices.length > 0) {
      components.push({
        type: 'header',
        parameters: headerTokenIndices.map((tokenIndex) => ({
          type: 'text',
          text: values[tokenIndex] ?? '',
        })),
      });
    }
  }

  const bodyTokenIndices = getTokenIndices(template.body ?? '');
  if (bodyTokenIndices.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyTokenIndices.map((tokenIndex) => ({
        type: 'text',
        text: values[tokenIndex] ?? '',
      })),
    });
  }

  (template.buttons ?? []).forEach((button, buttonIndex) => {
    if (button.type !== 'URL' || !button.url) return;
    const buttonTokenIndices = getTokenIndices(button.url);
    if (buttonTokenIndices.length === 0) return;
    components.push({
      type: 'button',
      sub_type: 'url',
      index: buttonIndex.toString(),
      parameters: buttonTokenIndices.map((tokenIndex) => ({
        type: 'text',
        text: values[tokenIndex] ?? '',
      })),
    });
  });

  return components;
}

export function renderTemplateTextWithValues(
  value: string,
  values: Record<number, string>,
  fallbackVariables?: WhatsappTemplate['variables'],
) {
  const fallback = new Map(
    (fallbackVariables ?? [])
      .filter((variable) => variable.index != null)
      .map((variable) => [variable.index as number, variable.sampleValue ?? '']),
  );
  return value.replace(/\{\{(\d+)\}\}/g, (match, index) => {
    const tokenIndex = Number(index);
    const filled = values[tokenIndex]?.trim();
    if (filled) return filled;
    const sample = fallback.get(tokenIndex);
    return sample || match;
  });
}
