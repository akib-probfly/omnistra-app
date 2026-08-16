import {
  BadgeCheck,
  ChevronLeft,
  Copy,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  List,
  LoaderCircle,
  MessageCircle,
  Mic,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Reply,
  Smile,
  Trash2,
  Video,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { showNotice } from './AppToast';
import { BottomSheet, SheetScrollView } from './BottomSheet';
import { AppToggle } from './AppToggle';
import type {
  WhatsappTemplate,
  WhatsappTemplateButton,
  WhatsappTemplateButtonType,
  WhatsappTemplateCategory,
  WhatsappTemplateFormValues,
  WhatsappTemplateHeaderType,
} from '../api/whatsappTemplates';
import {
  buildAuthenticationTemplateContent,
  insertBodyVariable,
  makeEmptyButton,
  makeDraftTemplate,
  mapTemplateToForm,
  renderTemplateTextWithSamples,
  renumberTemplateVariables,
  validateTemplateForm,
} from '../lib/whatsapp-template-utils';
import { useTheme } from '../theme/ThemeContext';

export type TemplateSheetMode = 'view' | 'edit' | 'create';

type Props = {
  visible: boolean;
  mode: TemplateSheetMode;
  template?: WhatsappTemplate | null;
  initialForm?: WhatsappTemplateFormValues | null;
  isSaving?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onSave?: (form: WhatsappTemplateFormValues) => void;
};

const CATEGORIES: Array<{ value: WhatsappTemplateCategory; label: string }> = [
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'UTILITY', label: 'Utility' },
  { value: 'AUTHENTICATION', label: 'Authentication' },
];

const LANGUAGES = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'Bengali' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ar', label: 'Arabic' },
  { value: 'es_ES', label: 'Spanish' },
];

const HEADER_TYPES: Array<{ value: WhatsappTemplateHeaderType; label: string }> = [
  { value: 'NONE', label: 'None' },
  { value: 'TEXT', label: 'Text' },
  { value: 'IMAGE', label: 'Image' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'DOCUMENT', label: 'Document' },
];

const BUTTON_TYPES: Array<{ value: WhatsappTemplateButtonType; label: string }> = [
  { value: 'QUICK_REPLY', label: 'Quick reply' },
  { value: 'URL', label: 'URL' },
  { value: 'PHONE_NUMBER', label: 'Phone' },
  { value: 'COPY_CODE', label: 'Copy code' },
];

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  APPROVED: { bg: '#e8fbf3', fg: '#047857' },
  PENDING: { bg: '#fff7df', fg: '#b45309' },
  PROCESSING: { bg: '#fff7df', fg: '#b45309' },
  FAILED: { bg: '#ffe4e6', fg: '#be123c' },
  REJECTED: { bg: '#ffe4e6', fg: '#be123c' },
  DELETED: { bg: '#f1f5f9', fg: '#64748b' },
  PAUSED: { bg: '#ffedd5', fg: '#c2410c' },
  DRAFT: { bg: '#f1f5f9', fg: '#64748b' },
};

function applyRenumber(form: WhatsappTemplateFormValues): WhatsappTemplateFormValues {
  const headerType = form.header.enabled ? form.header.type : 'NONE';
  const numbered = renumberTemplateVariables({
    headerType,
    headerContent: headerType === 'TEXT' ? form.header.content : '',
    body: form.body,
    buttons: form.buttons,
    variables: form.variables,
  });
  return {
    ...form,
    header: {
      ...form.header,
      content: headerType === 'TEXT' ? numbered.headerContent : form.header.content,
    },
    body: numbered.body,
    buttons: numbered.buttons,
    variables: numbered.variables,
  };
}

function getButtonIcon(type: WhatsappTemplateButtonType) {
  if (type === 'URL') return <Link2 color="#00A5F4" size={13} />;
  if (type === 'PHONE_NUMBER') return <Phone color="#00A5F4" size={13} />;
  if (type === 'QUICK_REPLY') return <Reply color="#00A5F4" size={13} />;
  if (type === 'OTP' || type === 'COPY_CODE') return <Copy color="#00A5F4" size={13} />;
  return <List color="#00A5F4" size={13} />;
}

function TemplatePreviewBubble({ form }: { form: WhatsappTemplateFormValues }) {
  const { colors } = useTheme();
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const hasContent = Boolean(form.body.trim() || (form.header.enabled && form.header.content.trim()) || form.buttons.length);
  const headerText = form.header.enabled && form.header.type === 'TEXT' && form.header.content
    ? renderTemplateTextWithSamples(form.header.content, form.variables)
    : null;
  const bodyText = renderTemplateTextWithSamples(form.body || '', form.variables);
  const mediaType = form.header.enabled && form.header.type !== 'NONE' && form.header.type !== 'TEXT'
    ? form.header.type
    : null;
  const visibleButtons = form.buttons.length >= 3 ? form.buttons.slice(0, 2) : form.buttons.slice(0, 3);
  const showAllOptions = form.buttons.length >= 3;

  return (
    <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <Text style={[styles.previewTitle, { color: colors.text }]}>Preview</Text>

      <View style={[styles.phoneShell, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={[styles.statusBar, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statusTime, { color: colors.text }]}>9:41</Text>
          <View style={styles.statusIcons}>
            <View style={styles.signalBars}>
              <View style={[styles.signalBar, { backgroundColor: colors.text, height: 4 }]} />
              <View style={[styles.signalBar, { backgroundColor: colors.text, height: 6 }]} />
              <View style={[styles.signalBar, { backgroundColor: colors.text, height: 8 }]} />
              <View style={[styles.signalBar, { backgroundColor: colors.text, height: 10 }]} />
            </View>
            <View style={[styles.wifiIcon, { borderColor: colors.text }]} />
            <View style={styles.batteryPill}>
              <Text style={styles.batteryText}>100</Text>
            </View>
          </View>
        </View>

        <View style={[styles.chatHeader, { backgroundColor: colors.surface, borderBottomColor: colors.separator }]}>
          <ChevronLeft color={colors.text} size={20} />
          <View style={styles.avatar}>
            <View style={[styles.avatarInner, { backgroundColor: colors.surface }]} />
          </View>
          <View style={styles.chatHeaderCopy}>
            <View style={styles.chatHeaderNameRow}>
              <Text style={[styles.chatHeaderName, { color: colors.text }]}>Omnistra</Text>
              <BadgeCheck color="#1DA1F2" fill="#1DA1F2" size={15} />
            </View>
          </View>
          <MoreVertical color={colors.textSecondary} size={18} />
        </View>

        <View style={[styles.chatBody, { backgroundColor: colors.surfaceSecondary }]}>
          <View style={styles.metaNotice}>
            <Text style={styles.metaNoticeText}>
              This business uses a secure service from Meta to manage this chat. Tap to learn more
            </Text>
          </View>

          <View style={[styles.timePill, { backgroundColor: colors.surface }]}>
            <Text style={[styles.timePillText, { color: colors.textSecondary }]}>{now}</Text>
          </View>

          {hasContent ? (
            <View style={[styles.messageCard, { backgroundColor: colors.surface }]}>
              {mediaType ? (
                <View style={[styles.mediaPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
                  {mediaType === 'IMAGE' ? <ImageIcon color={colors.textSecondary} size={18} /> : null}
                  {mediaType === 'VIDEO' ? <Video color={colors.textSecondary} size={18} /> : null}
                  {mediaType === 'DOCUMENT' ? <FileText color={colors.textSecondary} size={18} /> : null}
                  <Text style={[styles.mediaPlaceholderText, { color: colors.textSecondary }]}>
                    {mediaType.charAt(0) + mediaType.slice(1).toLowerCase()} preview
                  </Text>
                </View>
              ) : null}
              {headerText ? <Text style={[styles.bubbleHeader, { color: colors.text }]}>{headerText}</Text> : null}
              {bodyText ? <Text style={[styles.bubbleBody, { color: colors.text }]}>{bodyText}</Text> : null}
              {form.footer ? <Text style={[styles.bubbleFooter, { color: colors.textSecondary }]}>{form.footer}</Text> : null}
              <View style={styles.bubbleMeta}>
                <Text style={[styles.bubbleMetaTime, { color: colors.textSecondary }]}>{now}</Text>
                <Text style={styles.bubbleTicks}>✓✓</Text>
              </View>
              {visibleButtons.length > 0 ? (
                <View style={styles.bubbleButtons}>
                  {visibleButtons.map((button) => (
                    <View key={button.id} style={styles.bubbleButton}>
                      {getButtonIcon(button.type)}
                      <Text style={styles.bubbleButtonText} numberOfLines={1}>{button.label || 'Button'}</Text>
                    </View>
                  ))}
                  {showAllOptions ? (
                    <View style={styles.bubbleButton}>
                      <List color="#00A5F4" size={13} />
                      <Text style={styles.bubbleButtonText}>See all options</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={[styles.emptyPreviewCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.emptyPreviewIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <MessageCircle color={colors.primary} size={22} />
              </View>
              <View style={styles.emptyPreviewCopy}>
                <Text style={[styles.emptyPreviewTitle, { color: colors.text }]}>Your message preview</Text>
                <Text style={[styles.emptyPreviewBody, { color: colors.textSecondary }]}>Choose a message type and add content to see it here.</Text>
              </View>
            </View>
          )}
        </View>

        <View style={[styles.composerBar, { backgroundColor: colors.surfaceSecondary }]}>
          <View style={[styles.composerPlus, { backgroundColor: colors.surface }]}>
            <Plus color={colors.primary} size={18} />
          </View>
          <View style={[styles.composerInput, { backgroundColor: colors.surface }]}>
            <Text style={[styles.composerPlaceholder, { color: colors.textMuted }]}>Message</Text>
            <Smile color={colors.textMuted} size={18} />
          </View>
          <MessageCircle color={colors.textSecondary} size={20} />
          <Mic color={colors.textSecondary} size={20} />
        </View>
      </View>
    </View>
  );
}

export function WhatsappTemplateSheet({
  visible,
  mode,
  template,
  initialForm,
  isSaving = false,
  onClose,
  onEdit,
  onSave,
}: Props) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<'preview' | 'editor'>('preview');
  const [form, setForm] = useState<WhatsappTemplateFormValues>(() => makeDraftTemplate());
  const [sessionKey, setSessionKey] = useState<string | null>(null);

  const openKey = useMemo(() => {
    if (!visible) return null;
    if (mode === 'create') return 'create';
    if (mode === 'edit') return `edit:${template?.id ?? initialForm?.name ?? 'draft'}`;
    return `view:${template?.id ?? 'none'}`;
  }, [visible, mode, template?.id, initialForm?.name]);

  useEffect(() => {
    if (!visible || !openKey || openKey === sessionKey) return;
    if (mode === 'create') {
      setForm(makeDraftTemplate(initialForm ?? undefined));
      setTab('editor');
    } else if (mode === 'edit') {
      setForm(initialForm ? makeDraftTemplate(initialForm) : template ? mapTemplateToForm(template) : makeDraftTemplate());
      setTab('editor');
    } else if (template) {
      setForm(mapTemplateToForm(template));
      setTab('preview');
    }
    setSessionKey(openKey);
  }, [visible, openKey, sessionKey, mode, template, initialForm]);

  const patchForm = (updater: (current: WhatsappTemplateFormValues) => WhatsappTemplateFormValues) => {
    setForm((current) => applyRenumber(updater(current)));
  };

  const setCategory = (category: WhatsappTemplateCategory) => {
    patchForm((current) => {
      if (category !== 'AUTHENTICATION') {
        return { ...current, category };
      }
      const auth = buildAuthenticationTemplateContent({
        codeDeliveryMethod: current.authCodeDeliveryMethod,
        includeSecurityRecommendation: current.authIncludeSecurityRecommendation,
        includeExpirationNotice: current.authIncludeExpirationNotice,
        expirationMinutes: current.authCodeExpirationMinutes,
      });
      return {
        ...current,
        category,
        header: { enabled: false, type: 'NONE', content: '' },
        body: auth.body,
        footer: auth.footer,
        buttons: auth.buttons,
      };
    });
  };

  const updateAuth = (patch: Partial<WhatsappTemplateFormValues>) => {
    patchForm((current) => {
      const next = { ...current, ...patch };
      const auth = buildAuthenticationTemplateContent({
        codeDeliveryMethod: next.authCodeDeliveryMethod,
        includeSecurityRecommendation: next.authIncludeSecurityRecommendation,
        includeExpirationNotice: next.authIncludeExpirationNotice,
        expirationMinutes: next.authCodeExpirationMinutes,
      });
      return { ...next, body: auth.body, footer: auth.footer, buttons: auth.buttons };
    });
  };

  const updateButton = (buttonId: string, patch: Partial<WhatsappTemplateButton>) => {
    patchForm((current) => ({
      ...current,
      buttons: current.buttons.map((button) => (button.id === buttonId ? { ...button, ...patch } : button)),
    }));
  };

  const removeButton = (buttonId: string) => {
    patchForm((current) => ({
      ...current,
      buttons: current.buttons.filter((button) => button.id !== buttonId),
    }));
  };

  const addButton = (type: WhatsappTemplateButtonType) => {
    patchForm((current) => {
      if (current.buttons.length >= 10) return current;
      return { ...current, buttons: [...current.buttons, makeEmptyButton(type)] };
    });
  };

  const validationError = useMemo(() => validateTemplateForm(form), [form]);
  const canSubmit = !validationError && !isSaving;

  const handleSave = () => {
    const error = validateTemplateForm(form);
    if (error) {
      showNotice('Fix template', error);
      return;
    }
    onSave?.(form);
  };

  const title = mode === 'create' ? 'New template' : mode === 'edit' ? 'Edit template' : template?.name ?? 'Template';
  const tone = STATUS_TONE[template?.status ?? 'DRAFT'] ?? STATUS_TONE.DRAFT;
  const editable = mode === 'create' || mode === 'edit';

  return (
    <BottomSheet visible={visible} onClose={onClose} sheetStyle={styles.sheetHeight}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.header, { borderBottomColor: colors.separator }]}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
              {template ? (
                <View style={styles.metaRow}>
                  <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.badgeText, { color: tone.fg }]}>{template.status}</Text>
                  </View>
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>{template.category} · {template.language}</Text>
                </View>
              ) : (
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>Submit to Meta for review</Text>
              )}
            </View>
          </View>

          {editable ? (
            <View style={[styles.tabs, { backgroundColor: colors.surfaceSecondary }]}>
              <Pressable style={[styles.tab, tab === 'editor' && { backgroundColor: colors.surface }]} onPress={() => setTab('editor')}>
                <Pencil color={tab === 'editor' ? colors.primary : colors.textSecondary} size={14} />
                <Text style={[styles.tabText, tab === 'editor' && { color: colors.primary }]}>Editor</Text>
              </Pressable>
              <Pressable style={[styles.tab, tab === 'preview' && { backgroundColor: colors.surface }]} onPress={() => setTab('preview')}>
                <Eye color={tab === 'preview' ? colors.primary : colors.textSecondary} size={14} />
                <Text style={[styles.tabText, tab === 'preview' && { color: colors.primary }]}>Preview</Text>
              </Pressable>
            </View>
          ) : null}

          <SheetScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {(tab === 'preview' || !editable) ? <TemplatePreviewBubble form={form} /> : null}

            {editable && tab === 'editor' ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Basics</Text>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
                <TextInput
                  value={form.name}
                  editable={mode === 'create'}
                  onChangeText={(text) => setForm((current) => ({ ...current, name: text.toLowerCase().replace(/\s+/g, '_') }))}
                  placeholder="order_confirmation"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }, mode !== 'create' && styles.inputDisabled, mode !== 'create' && { backgroundColor: colors.surfaceSecondary, color: colors.textSecondary }]}
                />

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
                <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary }]}>
                  {CATEGORIES.map((option) => (
                    <Pressable
                      key={option.value}
                      onPress={() => setCategory(option.value)}
                      style={[styles.segmentOption, form.category === option.value && { backgroundColor: colors.surface }]}
                    >
                      <Text style={[styles.segmentText, { color: colors.textSecondary }, form.category === option.value && { color: colors.primary }]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Language</Text>
                <View style={styles.chipWrap}>
                  {LANGUAGES.map((lang) => (
                    <Pressable
                      key={lang.value}
                      onPress={() => setForm((current) => ({ ...current, language: lang.value }))}
                      style={[styles.chip, { borderColor: colors.cardBorder }, form.language === lang.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    >
                      <Text style={[styles.chipText, { color: colors.textSecondary }, form.language === lang.value && { color: colors.surface }]}>{lang.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {form.category === 'AUTHENTICATION' ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Authentication</Text>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Code delivery</Text>
                    <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary }]}>
                      {(['COPY_CODE', 'ONE_TAP'] as const).map((method) => (
                        <Pressable
                          key={method}
                          onPress={() => updateAuth({ authCodeDeliveryMethod: method })}
                          style={[styles.segmentOption, form.authCodeDeliveryMethod === method && { backgroundColor: colors.surface }]}
                        >
                          <Text style={[styles.segmentText, { color: colors.textSecondary }, form.authCodeDeliveryMethod === method && { color: colors.primary }]}>
                            {method === 'COPY_CODE' ? 'Copy code' : 'One tap'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={styles.toggleRow}>
                      <Text style={[styles.toggleLabel, { color: colors.text }]}>Security recommendation</Text>
                      <AppToggle
                        value={form.authIncludeSecurityRecommendation}
                        onValueChange={(value) => updateAuth({ authIncludeSecurityRecommendation: value })}
                        accessibilityLabel="Security recommendation"
                      />
                    </View>
                    <View style={styles.toggleRow}>
                      <Text style={[styles.toggleLabel, { color: colors.text }]}>Expiration notice</Text>
                      <AppToggle
                        value={form.authIncludeExpirationNotice}
                        onValueChange={(value) => updateAuth({
                          authIncludeExpirationNotice: value,
                          authCodeExpirationMinutes: value ? (form.authCodeExpirationMinutes ?? 10) : undefined,
                        })}
                        accessibilityLabel="Expiration notice"
                      />
                    </View>
                    {form.authIncludeExpirationNotice ? (
                      <>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Expires in (minutes)</Text>
                        <TextInput
                          value={String(form.authCodeExpirationMinutes ?? 10)}
                          onChangeText={(text) => {
                            const minutes = Number(text.replace(/[^0-9]/g, '')) || undefined;
                            updateAuth({ authCodeExpirationMinutes: minutes });
                          }}
                          keyboardType="number-pad"
                          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
                        />
                      </>
                    ) : null}
                    <Text style={[styles.helper, { color: colors.textMuted }]}>Auth body and OTP button are generated automatically.</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Header</Text>
                    <View style={styles.toggleRow}>
                      <Text style={[styles.toggleLabel, { color: colors.text }]}>Enable header</Text>
                      <AppToggle
                        value={form.header.enabled}
                        onValueChange={(value) => patchForm((current) => ({
                          ...current,
                          header: {
                            ...current.header,
                            enabled: value,
                            type: value ? (current.header.type === 'NONE' ? 'TEXT' : current.header.type) : 'NONE',
                          },
                        }))}
                        accessibilityLabel="Enable header"
                      />
                    </View>
                    {form.header.enabled ? (
                      <>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Header type</Text>
                        <View style={styles.chipWrap}>
                          {HEADER_TYPES.filter((item) => item.value !== 'NONE').map((item) => (
                            <Pressable
                              key={item.value}
                              onPress={() => patchForm((current) => ({
                                ...current,
                                header: { ...current.header, type: item.value, content: item.value === 'TEXT' ? current.header.content : '' },
                              }))}
                              style={[styles.chip, { borderColor: colors.cardBorder }, form.header.type === item.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                            >
                              <Text style={[styles.chipText, { color: colors.textSecondary }, form.header.type === item.value && { color: colors.surface }]}>{item.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        {form.header.type === 'TEXT' ? (
                          <>
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Header text</Text>
                            <TextInput
                              value={form.header.content}
                              onChangeText={(text) => patchForm((current) => ({
                                ...current,
                                header: { ...current.header, content: text },
                              }))}
                              placeholder="Order {{1}} update"
                              placeholderTextColor={colors.textMuted}
                              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
                            />
                          </>
                        ) : (
                          <Text style={[styles.helper, { color: colors.textMuted }]}>
                            Media headers use Meta sample media at submit time. Optional sample URL can be stored in variables.
                          </Text>
                        )}
                      </>
                    ) : null}

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Body</Text>
                    <TextInput
                      value={form.body}
                      onChangeText={(text) => patchForm((current) => ({ ...current, body: text }))}
                      placeholder="Hi {{1}}, your order is on the way."
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={[styles.inputMultiline, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
                    />
                    <View style={styles.inlineActions}>
                      <Pressable
                        style={[styles.secondaryButton, { backgroundColor: colors.surfaceSecondary }]}
                        onPress={() => patchForm((current) => ({
                          ...current,
                          body: insertBodyVariable(current.body, current.variables),
                        }))}
                      >
                        <Plus color={colors.primary} size={14} />
                        <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Add variable</Text>
                      </Pressable>
                      <Text style={[styles.charCount, { color: colors.textMuted }]}>{form.body.length}/1024</Text>
                    </View>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Footer</Text>
                    <TextInput
                      value={form.footer}
                      onChangeText={(text) => setForm((current) => ({ ...current, footer: text }))}
                      placeholder="Reply STOP to unsubscribe"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
                    />
                    <Text style={[styles.charCount, { color: colors.textMuted }]}>{form.footer.length}/60</Text>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Buttons</Text>
                    {form.buttons.map((button, index) => (
                      <View key={button.id} style={[styles.buttonCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                        <View style={styles.buttonCardHead}>
                          <Text style={[styles.buttonCardTitle, { color: colors.text }]}>Button {index + 1}</Text>
                          <Pressable onPress={() => removeButton(button.id)} hitSlop={8}>
                            <Trash2 color={colors.error} size={15} />
                          </Pressable>
                        </View>
                        <View style={styles.chipWrap}>
                          {BUTTON_TYPES.map((item) => (
                            <Pressable
                              key={item.value}
                              onPress={() => updateButton(button.id, { type: item.value })}
                              style={[styles.chip, { borderColor: colors.cardBorder }, button.type === item.value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                            >
                              <Text style={[styles.chipText, { color: colors.textSecondary }, button.type === item.value && { color: colors.surface }]}>{item.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Label</Text>
                        <TextInput
                          value={button.label}
                          onChangeText={(text) => updateButton(button.id, { label: text })}
                          placeholder="Track order"
                          placeholderTextColor={colors.textMuted}
                          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
                        />
                        {button.type === 'URL' ? (
                          <>
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>URL</Text>
                            <TextInput
                              value={button.url ?? ''}
                              onChangeText={(text) => updateButton(button.id, { url: text })}
                              placeholder="https://example.com/order/{{1}}"
                              placeholderTextColor={colors.textMuted}
                              autoCapitalize="none"
                              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
                            />
                          </>
                        ) : null}
                        {button.type === 'PHONE_NUMBER' ? (
                          <>
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Phone number</Text>
                            <TextInput
                              value={button.phoneNumber ?? ''}
                              onChangeText={(text) => updateButton(button.id, { phoneNumber: text })}
                              placeholder="+15551234567"
                              placeholderTextColor={colors.textMuted}
                              keyboardType="phone-pad"
                              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
                            />
                          </>
                        ) : null}
                        {button.type === 'COPY_CODE' ? (
                          <>
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Offer code sample</Text>
                            <TextInput
                              value={button.offerCode ?? ''}
                              onChangeText={(text) => updateButton(button.id, { offerCode: text })}
                              placeholder="SAVE20"
                              placeholderTextColor={colors.textMuted}
                              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
                            />
                          </>
                        ) : null}
                      </View>
                    ))}
                    <View style={styles.chipWrap}>
                      {BUTTON_TYPES.map((item) => (
                        <Pressable key={item.value} style={[styles.addChip, { backgroundColor: colors.surfaceSecondary }]} onPress={() => addButton(item.value)}>
                          <Plus color={colors.primary} size={13} />
                          <Text style={[styles.addChipText, { color: colors.primary }]}>{item.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

                {form.variables.length > 0 ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Sample variables</Text>
                    <Text style={[styles.helper, { color: colors.textMuted }]}>Meta requires sample values for each variable before review.</Text>
                    {form.variables.map((variable) => (
                      <View key={`${variable.section}-${variable.index}`} style={[styles.variableCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                        <Text style={[styles.variableTitle, { color: colors.textSecondary }]}>{`{{${variable.index}}}`} · {variable.section}</Text>
                        <TextInput
                          value={variable.label}
                          onChangeText={(text) => setForm((current) => ({
                            ...current,
                            variables: current.variables.map((item) =>
                              item.index === variable.index && item.section === variable.section
                                ? { ...item, label: text }
                                : item,
                            ),
                          }))}
                          placeholder="Label"
                          placeholderTextColor={colors.textMuted}
                          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
                        />
                        <TextInput
                          value={variable.sampleValue}
                          onChangeText={(text) => setForm((current) => ({
                            ...current,
                            variables: current.variables.map((item) =>
                              item.index === variable.index && item.section === variable.section
                                ? { ...item, sampleValue: text }
                                : item,
                            ),
                          }))}
                          placeholder="Sample value"
                          placeholderTextColor={colors.textMuted}
                          style={[styles.input, { marginTop: 8, backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
                        />
                      </View>
                    ))}
                  </>
                ) : null}
              </>
            ) : null}

            {!editable && template?.rejectionReason ? (
              <View style={styles.rejectionBox}>
                <Text style={styles.rejectionTitle}>Rejection reason</Text>
                <Text style={styles.rejectionText}>{template.rejectionReason}</Text>
              </View>
            ) : null}
          </SheetScrollView>

          <View style={[styles.footer, { borderTopColor: colors.separator }]}>
            {editable ? (
              <Pressable
                style={[
                  styles.primaryButton,
                  { backgroundColor: canSubmit ? colors.primary : colors.surfaceSecondary },
                  !canSubmit && styles.buttonDisabled,
                ]}
                onPress={handleSave}
                disabled={!canSubmit}
              >
                {isSaving ? <LoaderCircle color={colors.primaryText} size={16} /> : null}
                <Text style={[styles.primaryButtonText, { color: canSubmit ? colors.primaryText : colors.textMuted }]}>
                  {mode === 'create' ? 'Submit for review' : 'Update template'}
                </Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={onEdit}>
                <Pencil color={colors.primaryText} size={15} />
                <Text style={[styles.primaryButtonText, { color: colors.primaryText }]}>Edit template</Text>
              </Pressable>
            )}
          </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheetHeight: {
    flexShrink: 1,
    height: '92%',
    maxHeight: '96%',
    minHeight: '88%',
    paddingTop: 8,
  },
  header: {
    alignItems: 'flex-start',
    borderBottomColor: '#e8eef7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  metaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  metaText: { color: '#64748b', fontSize: 12, marginTop: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  tabs: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 9,
  },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#2563eb', fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { gap: 4, padding: 16, paddingBottom: 24 },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
    marginTop: 16,
  },
  fieldLabel: { color: '#64748b', fontSize: 12, fontWeight: '600', marginTop: 10 },
  helper: { color: '#94a3b8', fontSize: 12, lineHeight: 17, marginTop: 8 },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 14,
    height: 46,
    marginTop: 6,
    paddingHorizontal: 14,
  },
  inputDisabled: { backgroundColor: '#f1f5f9', color: '#64748b' },
  inputMultiline: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 14,
    marginTop: 6,
    minHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  segment: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 3,
    marginTop: 6,
    padding: 3,
  },
  segmentOption: { alignItems: 'center', borderRadius: 9, flex: 1, paddingVertical: 9 },
  segmentOptionActive: { backgroundColor: '#fff' },
  segmentText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: '#2563eb' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    borderColor: '#dbeafe',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  toggleLabel: { color: '#0f172a', flex: 1, fontSize: 14, fontWeight: '600', paddingRight: 12 },
  inlineActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: { color: '#2563eb', fontSize: 12, fontWeight: '700' },
  charCount: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  buttonCard: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  buttonCardHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  buttonCardTitle: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  addChip: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  addChipText: { color: '#2563eb', fontSize: 12, fontWeight: '700' },
  variableCard: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  variableTitle: { color: '#334155', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  rejectionBox: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    padding: 12,
  },
  rejectionTitle: { color: '#be123c', fontSize: 12, fontWeight: '700' },
  rejectionText: { color: '#9f1239', fontSize: 13, lineHeight: 18, marginTop: 4 },
  previewCard: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderColor: '#e8eef7',
    borderRadius: 28,
    borderWidth: 1,
    paddingBottom: 14,
    paddingHorizontal: 12,
    paddingTop: 14,
    width: '100%',
  },
  previewTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  phoneShell: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statusBar: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  statusTime: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  statusIcons: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  signalBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 1.5, height: 10 },
  signalBar: { backgroundColor: '#0f172a', borderRadius: 1, width: 2.5 },
  wifiIcon: {
    borderColor: '#0f172a',
    borderLeftWidth: 0,
    borderRadius: 8,
    borderRightWidth: 0,
    borderTopWidth: 2,
    borderBottomWidth: 0,
    height: 7,
    transform: [{ rotate: '-45deg' }],
    width: 10,
  },
  batteryPill: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  batteryText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  chatHeader: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomColor: '#eef2f7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#5b8cff',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  avatarInner: {
    backgroundColor: '#fff',
    borderRadius: 5,
    height: 12,
    width: 12,
  },
  chatHeaderCopy: { flex: 1, minWidth: 0 },
  chatHeaderNameRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  chatHeaderName: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  chatBody: {
    backgroundColor: '#F0EBE3',
    gap: 10,
    minHeight: 260,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  metaNotice: {
    alignSelf: 'center',
    backgroundColor: '#d9f5e7',
    borderRadius: 10,
    maxWidth: '96%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaNoticeText: {
    color: '#334155',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  timePill: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    elevation: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  timePillText: { color: '#667781', fontSize: 11, fontWeight: '600' },
  messageCard: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderTopLeftRadius: 4,
    elevation: 2,
    maxWidth: '92%',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    width: '88%',
  },
  emptyPreviewCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 2,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  emptyPreviewIcon: {
    alignItems: 'center',
    backgroundColor: '#e8f0ff',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  emptyPreviewCopy: { flex: 1, minWidth: 0 },
  emptyPreviewTitle: { color: '#0f172a', fontSize: 14, fontWeight: '800' },
  emptyPreviewBody: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 3 },
  mediaPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#dbe4f0',
    flexDirection: 'row',
    gap: 6,
    height: 88,
    justifyContent: 'center',
    marginBottom: 4,
  },
  mediaPlaceholderText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  bubbleHeader: { color: '#111b21', fontSize: 14, fontWeight: '700', paddingHorizontal: 12, paddingTop: 10 },
  bubbleBody: { color: '#111b21', fontSize: 14, lineHeight: 20, paddingHorizontal: 12, paddingTop: 6 },
  bubbleFooter: { color: '#667781', fontSize: 11, paddingHorizontal: 12, paddingTop: 6 },
  bubbleMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'flex-end',
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  bubbleMetaTime: { color: '#667781', fontSize: 10 },
  bubbleTicks: { color: '#53bdeb', fontSize: 10, fontWeight: '700' },
  bubbleButtons: { borderTopColor: 'rgba(0,0,0,0.08)', borderTopWidth: StyleSheet.hairlineWidth },
  bubbleButton: {
    alignItems: 'center',
    borderTopColor: 'rgba(0,0,0,0.06)',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 11,
  },
  bubbleButtonText: { color: '#00A5F4', fontSize: 13, fontWeight: '700' },
  composerBar: {
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  composerPlus: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  composerInput: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    flex: 1,
    flexDirection: 'row',
    height: 36,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  composerPlaceholder: { color: '#94a3b8', fontSize: 13 },
  footer: {
    borderTopColor: '#e8eef7',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  buttonDisabled: { opacity: 0.65 },
});
