import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  Check,
  ChevronRight,
  Paperclip,
  Plus,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showNotice } from '../components/AppToast';
import { AppToggle } from '../components/AppToggle';
import { BottomSheet, SheetFlatList } from '../components/BottomSheet';
import { ErrorState } from '../components/ErrorState';
import { FormSkeleton } from '../components/Skeleton';
import {
  createCampaign,
  createCampaignDraft,
  EMPTY_AUDIENCE_FILTER,
  estimateBroadcastAudience,
  fetchCampaign,
  scheduleCampaign,
  sendCampaignNow,
  toLocalDateTimeInput,
  updateCampaign,
  type BroadcastAudienceFilter,
  type BroadcastTemplateHeaderMediaMap,
  type CampaignContentType,
  type CreateCampaignInput,
} from '../api/broadcast';
import { fetchChannels } from '../api/channels';
import { fetchWorkspaceTags, type ConversationTag } from '../api/conversationDetails';
import { fetchMyWorkspaces } from '../api/workspaces';
import { fetchWhatsappTemplates, type WhatsappTemplate, type WhatsappTemplateCategory } from '../api/whatsappTemplates';
import { uploadFile } from '../api/client';
import {
  areTemplateHeadersMapped,
  areTemplateVariablesMapped,
  CONTACT_FIELD_OPTIONS,
  contactFieldFromVal,
  extractVariableNames,
  getTemplateVariableNames,
  hasMappedValue,
  headerMediaLabel,
  isContactRef,
  isTemplateMediaHeaderType,
} from '../lib/broadcast-template-utils';
import { listCountryCallingCodes } from '../lib/countryFromPhone';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { AppButton, AppChip, AppSearchField, AppSegmentedControl, ScreenHeader } from '../ui';

type StepKey = 'details' | 'message' | 'mapping' | 'audience' | 'review';
type ScheduleType = 'now' | 'schedule';
type PickerKind = 'channel' | 'includeTags' | 'excludeTags' | 'assignTags' | 'countries' | 'contactField' | null;

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'details', label: 'Name' },
  { key: 'message', label: 'Message' },
  { key: 'mapping', label: 'Variables' },
  { key: 'audience', label: 'Audience' },
  { key: 'review', label: 'Send' },
];
const DELAY_OPTIONS = [1, 2, 3, 5, 10];
const COUNTRIES = listCountryCallingCodes();

function tomorrowNoon() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function BroadcastCreateScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const route = useRoute<RouteProp<SettingsStackParamList, 'BroadcastCreate'>>();
  const campaignId = route.params?.campaignId;
  const isEditing = Boolean(campaignId);
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const [step, setStep] = useState<StepKey>('details');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelId, setChannelId] = useState('');
  const [contentType, setContentType] = useState<CampaignContentType>('TEMPLATE');
  const [templateCategory, setTemplateCategory] = useState<WhatsappTemplateCategory>('MARKETING');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [templateVarsMap, setTemplateVarsMap] = useState<Record<string, Record<string, string>>>({});
  const [templateHeaderMediaMap, setTemplateHeaderMediaMap] = useState<BroadcastTemplateHeaderMediaMap>({});
  const [bodyText, setBodyText] = useState('');
  const [textVariables, setTextVariables] = useState<Record<string, string>>({});
  const [audienceFilter, setAudienceFilter] = useState<BroadcastAudienceFilter>(EMPTY_AUDIENCE_FILTER);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('now');
  const [scheduledAt, setScheduledAt] = useState(tomorrowNoon);
  const [smartDelayEnabled, setSmartDelayEnabled] = useState(true);
  const [delaySeconds, setDelaySeconds] = useState(1);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [activeVariable, setActiveVariable] = useState<{ templateId?: string; key: string } | null>(null);
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(null);
  const [uploadingTemplateId, setUploadingTemplateId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!isEditing);

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });
  const workspace = workspacesQuery.data?.items?.[0];
  const workspaceId = workspace?.id;
  const multiTemplate = workspace?.broadcastMultipleTemplateEnabled === true;
  const smartDelayAvailable = workspace?.broadcastSmartDelayEnabled === true;
  const workspaceDelay = workspace?.broadcastDelaySeconds ?? 1;

  const channelsQuery = useQuery({
    queryKey: ['channels'],
    queryFn: fetchChannels,
    staleTime: 30_000,
  });
  const whatsappChannels = useMemo(
    () => (channelsQuery.data?.items ?? []).filter((channel) => channel.type === 'WHATSAPP' && channel.status === 'CONNECTED'),
    [channelsQuery.data],
  );

  const templatesQuery = useQuery({
    queryKey: ['whatsapp-templates', channelId],
    queryFn: () => fetchWhatsappTemplates(channelId),
    enabled: Boolean(channelId),
    staleTime: 30_000,
  });
  const approvedTemplates = useMemo(
    () => (templatesQuery.data?.items ?? []).filter((template) => String(template.status).toUpperCase() === 'APPROVED'),
    [templatesQuery.data],
  );
  const filteredTemplates = approvedTemplates.filter((template) => template.category === templateCategory);
  const selectedTemplates = selectedTemplateIds
    .map((id) => approvedTemplates.find((template) => template.id === id))
    .filter((template): template is WhatsappTemplate => Boolean(template));

  const tagsQuery = useQuery({
    queryKey: ['workspace-tags', workspaceId],
    queryFn: () => fetchWorkspaceTags(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
  const tags = tagsQuery.data?.items ?? [];

  const existingQuery = useQuery({
    queryKey: ['broadcast', 'detail', campaignId],
    queryFn: () => fetchCampaign(campaignId as string),
    enabled: Boolean(campaignId),
  });

  const estimateQuery = useQuery({
    queryKey: ['broadcast', 'audience-estimate', channelId, contentType, audienceFilter],
    queryFn: () => estimateBroadcastAudience({ channelId, contentType, audienceFilter }),
    enabled: Boolean(channelId),
    staleTime: 10_000,
  });

  useEffect(() => {
    if (smartDelayAvailable) setDelaySeconds(workspaceDelay);
  }, [smartDelayAvailable, workspaceDelay]);

  useEffect(() => {
    if (!existingQuery.data || hydrated) return;
    const campaign = existingQuery.data;
    const message = campaign.messages?.[0];
    setName(campaign.name ?? '');
    setDescription(campaign.description ?? '');
    setContentType((message?.contentType ?? 'TEMPLATE') as CampaignContentType);
    setBodyText(message?.bodyText ?? '');
    setTextVariables(message?.templateVariables ?? {});
    const ids = campaign.templateIds?.length ? campaign.templateIds : message?.templateId ? [message.templateId] : [];
    setSelectedTemplateIds(ids);
    setTemplateVarsMap(
      campaign.templateVariablesMap
      ?? (message?.templateId ? { [message.templateId]: message.templateVariables ?? {} } : {}),
    );
    setTemplateHeaderMediaMap(campaign.templateHeaderMediaMap ?? {});
    if (campaign.audienceFilter) setAudienceFilter({ ...EMPTY_AUDIENCE_FILTER, ...campaign.audienceFilter });
    if (campaign.scheduledAt) {
      setScheduleType('schedule');
      const next = new Date(campaign.scheduledAt);
      if (Number.isFinite(next.getTime())) setScheduledAt(next);
    }
    if (campaign.broadcastSmartDelayEnabled != null) setSmartDelayEnabled(campaign.broadcastSmartDelayEnabled);
    if (campaign.broadcastDelaySeconds != null) setDelaySeconds(campaign.broadcastDelaySeconds);
    if (message?.channelId) setChannelId(message.channelId);
    setHydrated(true);
  }, [existingQuery.data, hydrated]);

  const textVars = useMemo(() => extractVariableNames(bodyText), [bodyText]);
  const mappingsValid = contentType === 'TEMPLATE'
    ? selectedTemplates.length === selectedTemplateIds.length
      && areTemplateVariablesMapped(selectedTemplates, templateVarsMap)
      && areTemplateHeadersMapped(selectedTemplates, templateHeaderMediaMap)
    : textVars.every((variable) => hasMappedValue(textVariables[variable]));
  const hasMessage = contentType === 'TEXT' ? Boolean(bodyText.trim()) : selectedTemplateIds.length > 0;
  const detailsComplete = name.trim().length > 0 && Boolean(channelId);
  const completed = {
    details: detailsComplete,
    message: hasMessage,
    mapping: mappingsValid,
    audience: true,
    review: hasMessage && mappingsValid && detailsComplete,
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['broadcast'] });
  };

  const publishMutation = useMutation({
    mutationFn: async (asDraft: boolean) => {
      if (!channelId) throw new Error('Select a WhatsApp channel first.');
      const isMulti = multiTemplate && selectedTemplateIds.length > 1;
      const singleTemplateId = isMulti ? null : (selectedTemplateIds[0] ?? null);
      const singleVars = singleTemplateId ? (templateVarsMap[singleTemplateId] ?? textVariables) : textVariables;
      const payload: CreateCampaignInput = {
        name: name.trim() || 'Untitled campaign',
        description: description.trim() || null,
        channelType: 'WHATSAPP',
        channelId,
        contentType,
        templateId: contentType === 'TEMPLATE' && !isMulti ? singleTemplateId : null,
        templateVariables: contentType === 'TEMPLATE' && !isMulti && singleVars && Object.keys(singleVars).length > 0
          ? Object.fromEntries(Object.entries(singleVars).filter(([, value]) => value))
          : contentType === 'TEXT' && Object.values(textVariables).some(Boolean)
            ? Object.fromEntries(Object.entries(textVariables).filter(([, value]) => value))
            : null,
        templateIds: isMulti ? selectedTemplateIds : undefined,
        templateVariablesMap: isMulti ? templateVarsMap : undefined,
        templateHeaderMediaMap: contentType === 'TEMPLATE' ? templateHeaderMediaMap : null,
        broadcastSmartDelayEnabled: smartDelayAvailable ? smartDelayEnabled : null,
        broadcastDelaySeconds: smartDelayAvailable ? delaySeconds : null,
        bodyText: contentType === 'TEXT' ? bodyText.trim() || null : null,
        contactIds: [],
        audienceFilter,
      };

      if (isEditing && campaignId) {
        await updateCampaign(campaignId, payload);
        if (asDraft) return campaignId;
        if (scheduleType === 'schedule') await scheduleCampaign(campaignId, toLocalDateTimeInput(scheduledAt));
        else await sendCampaignNow(campaignId);
        return campaignId;
      }

      const created = asDraft ? await createCampaignDraft(payload) : await createCampaign(payload);
      if (!asDraft) {
        if (scheduleType === 'schedule') await scheduleCampaign(created.id, toLocalDateTimeInput(scheduledAt));
        else await sendCampaignNow(created.id);
      }
      return created.id;
    },
    onSuccess: async (_id, asDraft) => {
      await invalidate();
      showNotice(asDraft ? 'Draft saved' : 'Campaign published');
      navigation.navigate('Broadcast');
    },
    onError: (error: Error) => showNotice(error.message || 'Could not save campaign'),
  });

  const goNext = () => {
    const index = STEPS.findIndex((item) => item.key === step);
    const next = STEPS[index + 1];
    if (next) setStep(next.key);
  };
  const canContinue = step === 'details' ? detailsComplete
    : step === 'message' ? hasMessage
      : step === 'mapping' ? mappingsValid
        : true;

  const toggleTemplate = (template: WhatsappTemplate) => {
    setSelectedTemplateIds((current) => {
      if (multiTemplate) {
        return current.includes(template.id)
          ? current.filter((id) => id !== template.id)
          : [...current, template.id];
      }
      return current[0] === template.id ? [] : [template.id];
    });
    setTemplateCategory(template.category);
  };

  const setVariable = (templateId: string | undefined, key: string, value: string) => {
    if (templateId) {
      setTemplateVarsMap((current) => ({ ...current, [templateId]: { ...(current[templateId] ?? {}), [key]: value } }));
      return;
    }
    setTextVariables((current) => ({ ...current, [key]: value }));
  };

  const pickHeaderMedia = async (template: WhatsappTemplate) => {
    if (!workspaceId || !isTemplateMediaHeaderType(template.header.type)) return;
    const headerType = template.header.type;
    try {
      let picked: { uri: string; name: string; mimeType: string } | null = null;
      if (headerType === 'IMAGE' || headerType === 'VIDEO') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showNotice('Permission required', 'Allow photo library access to attach header media.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: headerType === 'IMAGE' ? ['images'] : ['videos'],
          quality: 0.9,
        });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        picked = {
          uri: asset.uri,
          name: asset.fileName ?? `template-header-${Date.now()}`,
          mimeType: asset.mimeType ?? (headerType === 'IMAGE' ? 'image/jpeg' : 'video/mp4'),
        };
      } else {
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        picked = {
          uri: asset.uri,
          name: asset.name ?? `template-header-${Date.now()}.pdf`,
          mimeType: asset.mimeType ?? 'application/pdf',
        };
      }
      setUploadingTemplateId(template.id);
      const uploaded = await uploadFile('/files/upload', picked.uri, picked.name, picked.mimeType, { workspaceId }) as { id: string; mimeType?: string };
      setTemplateHeaderMediaMap((current) => ({
        ...current,
        [template.id]: {
          attachmentId: uploaded.id,
          headerType,
          fileName: picked.name,
          mimeType: uploaded.mimeType ?? picked.mimeType,
        },
      }));
    } catch (error) {
      showNotice('Could not upload header media', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setUploadingTemplateId(null);
    }
  };

  const matchingTags = tags.filter((tag) =>
    !tag.isArchived && tag.text.toLowerCase().includes(pickerSearch.trim().toLowerCase()),
  );
  const matchingCountries = COUNTRIES.filter((country) => {
    const query = pickerSearch.trim().toLowerCase();
    if (!query) return true;
    return country.name.toLowerCase().includes(query) || country.dialCode.includes(query.replace(/\D/g, ''));
  }).slice(0, 80);

  const openPicker = (kind: PickerKind) => {
    setPickerSearch('');
    setPicker(kind);
  };

  if ((isEditing && existingQuery.isLoading) || workspacesQuery.isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title={isEditing ? 'Edit campaign' : 'Create campaign'} onBack={() => navigation.goBack()} />
        <FormSkeleton fields={6} />
      </View>
    );
  }

  if (workspacesQuery.isError || !workspaceId) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Create campaign" onBack={() => navigation.goBack()} />
        <ErrorState message="Unable to load workspace." onRetry={() => workspacesQuery.refetch()} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={isEditing ? 'Edit campaign' : 'Create campaign'}
        subtitle="WhatsApp broadcast"
        onBack={() => navigation.goBack()}
      />

      <View style={[styles.progress, { borderBottomColor: colors.cardBorder }]}>
        {STEPS.map((item, index) => {
          const active = item.key === step;
          const done = completed[item.key] && !active;
          return (
            <Pressable key={item.key} style={styles.progressItem} onPress={() => {
              const allowed = STEPS.slice(0, index).every((entry) => completed[entry.key]);
              if (allowed) setStep(item.key);
            }}>
              <View style={[styles.progressDot, { backgroundColor: active || done ? colors.primary : colors.surfaceSecondary }]}>
                <Text style={styles.progressIndex}>{index + 1}</Text>
              </View>
              <Text style={[styles.progressLabel, { color: active ? colors.primary : colors.textMuted }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 28) }]} keyboardShouldPersistTaps="handled">
        {step === 'details' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Campaign name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="August promo"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional notes"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.textArea, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
              multiline
              textAlignVertical="top"
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>WhatsApp channel</Text>
            <Pressable style={[styles.inputButton, { backgroundColor: colors.background, borderColor: colors.inputBorder }]} onPress={() => openPicker('channel')}>
              <Text style={[styles.inputButtonText, { color: channelId ? colors.text : colors.textMuted }]} numberOfLines={1}>
                {whatsappChannels.find((channel) => channel.id === channelId)?.name ?? 'Select a connected channel'}
              </Text>
              <ChevronRight color={colors.textMuted} size={16} />
            </Pressable>
          </View>
        ) : null}

        {step === 'message' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Content type</Text>
            <AppSegmentedControl
              value={contentType === 'TEXT' ? 'TEXT' : 'TEMPLATE'}
              onChange={(value) => setContentType(value)}
              options={[
                { value: 'TEMPLATE', label: 'Template' },
                { value: 'TEXT', label: 'Session text' },
              ]}
            />
            {contentType === 'TEXT' ? (
              <>
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  Session messages only reach contacts whose 24-hour WhatsApp window is open.
                </Text>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Message</Text>
                <TextInput
                  value={bodyText}
                  onChangeText={setBodyText}
                  placeholder="Hi {{1}}, thanks for chatting with us."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.textArea, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  multiline
                  textAlignVertical="top"
                />
              </>
            ) : (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
                <View style={styles.chipWrap}>
                  {(['MARKETING', 'UTILITY', 'AUTHENTICATION'] as WhatsappTemplateCategory[]).map((category) => (
                    <AppChip key={category} label={category[0] + category.slice(1).toLowerCase()} selected={templateCategory === category} onPress={() => setTemplateCategory(category)} />
                  ))}
                </View>
                {templatesQuery.isLoading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} /> : null}
                {filteredTemplates.length === 0 && !templatesQuery.isLoading ? (
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>No approved {templateCategory.toLowerCase()} templates on this channel.</Text>
                ) : null}
                {filteredTemplates.map((template) => {
                  const selected = selectedTemplateIds.includes(template.id);
                  return (
                    <Pressable
                      key={template.id}
                      style={[styles.templateRow, { borderColor: selected ? colors.primary : colors.cardBorder, backgroundColor: colors.background }]}
                      onPress={() => toggleTemplate(template)}
                    >
                      <View style={styles.templateCopy}>
                        <Text style={[styles.templateName, { color: colors.text }]} numberOfLines={1}>{template.name}</Text>
                        <Text style={[styles.templateBody, { color: colors.textSecondary }]} numberOfLines={2}>{template.body}</Text>
                      </View>
                      {selected ? <Check color={colors.primary} size={18} /> : null}
                    </Pressable>
                  );
                })}
                {multiTemplate ? <Text style={[styles.hint, { color: colors.textMuted }]}>Multiple templates are enabled for this workspace.</Text> : null}
              </>
            )}
          </View>
        ) : null}

        {step === 'mapping' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            {contentType === 'TEMPLATE' && selectedTemplates.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>Select a template first.</Text>
            ) : contentType === 'TEXT' && textVars.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>No variables detected. Use {'{{variable}}'} in the message to map values.</Text>
            ) : (
              (contentType === 'TEMPLATE' ? selectedTemplates : [null]).map((template) => {
                const vars = template ? getTemplateVariableNames(template) : textVars;
                const templateId = template?.id;
                return (
                  <View key={templateId ?? 'text'} style={styles.mapBlock}>
                    {template ? <Text style={[styles.templateName, { color: colors.text }]}>{template.name}</Text> : null}
                    {template && isTemplateMediaHeaderType(template.header.type) ? (
                      <Pressable style={[styles.mediaButton, { borderColor: colors.cardBorder }]} onPress={() => void pickHeaderMedia(template)}>
                        <Paperclip color={colors.primary} size={16} />
                        <Text style={[styles.mediaButtonText, { color: colors.primary }]}>
                          {uploadingTemplateId === template.id
                            ? 'Uploading…'
                            : templateHeaderMediaMap[template.id]
                              ? headerMediaLabel(templateHeaderMediaMap[template.id])
                              : `Attach ${template.header.type.toLowerCase()} header`}
                        </Text>
                      </Pressable>
                    ) : null}
                    {vars.map((variable) => {
                      const raw = templateId ? templateVarsMap[templateId]?.[variable] : textVariables[variable];
                      const contactMode = isContactRef(raw);
                      return (
                        <View key={variable} style={styles.varBlock}>
                          <Text style={[styles.varName, { color: colors.primary }]}>{`{{${variable}}}`}</Text>
                          <AppSegmentedControl
                            value={contactMode ? 'contact' : 'static'}
                            onChange={(mode) => setVariable(templateId, variable, mode === 'contact' ? '@contact:displayName' : '')}
                            options={[
                              { value: 'static', label: 'Static' },
                              { value: 'contact', label: 'From contact' },
                            ]}
                          />
                          {contactMode ? (
                            <Pressable
                              style={[styles.inputButton, { backgroundColor: colors.background, borderColor: colors.inputBorder }]}
                              onPress={() => {
                                setActiveVariable({ templateId, key: variable });
                                openPicker('contactField');
                              }}
                            >
                              <Text style={[styles.inputButtonText, { color: colors.text }]}>
                                {CONTACT_FIELD_OPTIONS.find((item) => item.value === contactFieldFromVal(raw))?.label ?? 'Contact name'}
                              </Text>
                              <ChevronRight color={colors.textMuted} size={16} />
                            </Pressable>
                          ) : (
                            <TextInput
                              value={contactMode ? '' : (raw ?? '')}
                              onChangeText={(value) => setVariable(templateId, variable, value)}
                              placeholder={`Value for ${variable}`}
                              placeholderTextColor={colors.textMuted}
                              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                            />
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {step === 'audience' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {contentType === 'TEXT'
                ? 'Filters are combined with the 24-hour customer-service window.'
                : 'Approved templates can reach contacts outside the 24-hour window.'}
            </Text>
            <Text style={[styles.audienceCount, { color: colors.text }]}>
              {estimateQuery.isFetching ? 'Estimating audience…' : `${(estimateQuery.data?.totalCount ?? 0).toLocaleString()} contacts match`}
            </Text>
            <FilterRow label="Include tags" value={audienceFilter.includeTagIds.length ? `${audienceFilter.includeTagIds.length} selected` : 'Any'} onPress={() => openPicker('includeTags')} colors={colors} />
            <FilterRow label="Exclude tags" value={audienceFilter.excludeTagIds.length ? `${audienceFilter.excludeTagIds.length} selected` : 'None'} onPress={() => openPicker('excludeTags')} colors={colors} />
            <FilterRow label="Countries" value={audienceFilter.countryCodes.length ? `${audienceFilter.countryCodes.length} selected` : 'All'} onPress={() => openPicker('countries')} colors={colors} />
            <FilterRow label="Assign tags after send" value={audienceFilter.assignTagIds.length ? `${audienceFilter.assignTagIds.length} selected` : 'None'} onPress={() => openPicker('assignTags')} colors={colors} />
          </View>
        ) : null}

        {step === 'review' ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>When to send</Text>
            <AppSegmentedControl
              value={scheduleType}
              onChange={setScheduleType}
              options={[
                { value: 'now', label: 'Send now' },
                { value: 'schedule', label: 'Schedule' },
              ]}
            />
            {scheduleType === 'schedule' ? (
              <Pressable
                style={[styles.inputButton, { backgroundColor: colors.background, borderColor: colors.inputBorder }]}
                onPress={() => {
                  if (Platform.OS === 'android') setAndroidPicker('date');
                }}
              >
                <Text style={[styles.inputButtonText, { color: colors.text }]}>{formatCampaignSchedule(scheduledAt)}</Text>
              </Pressable>
            ) : null}
            {scheduleType === 'schedule' && (Platform.OS === 'ios' || androidPicker) ? (
              <DateTimePicker
                value={scheduledAt}
                mode={Platform.OS === 'ios' ? 'datetime' : androidPicker === 'time' ? 'time' : 'date'}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(event, date) => {
                  if (Platform.OS === 'android') {
                    if (event.type !== 'set' || !date) {
                      setAndroidPicker(null);
                      return;
                    }
                    setScheduledAt((current) => mergePickerDate(current, date, androidPicker === 'time' ? 'time' : 'date'));
                    setAndroidPicker(androidPicker === 'date' ? 'time' : null);
                    return;
                  }
                  if (date) setScheduledAt(date);
                }}
              />
            ) : null}
            {smartDelayAvailable ? (
              <>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleCopy}>
                    <Text style={[styles.templateName, { color: colors.text }]}>Smart delay</Text>
                    <Text style={[styles.hint, { color: colors.textSecondary }]}>Space messages so sending stays under WhatsApp limits.</Text>
                  </View>
                  <AppToggle value={smartDelayEnabled} onValueChange={setSmartDelayEnabled} />
                </View>
                {smartDelayEnabled ? (
                  <View style={styles.chipWrap}>
                    {DELAY_OPTIONS.map((value) => (
                      <AppChip key={value} label={`${value}s`} selected={delaySeconds === value} onPress={() => setDelaySeconds(value)} />
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {name.trim() || 'Untitled campaign'} · {(estimateQuery.data?.totalCount ?? 0).toLocaleString()} recipients
            </Text>
          </View>
        ) : null}

        {step !== 'review' ? (
          <AppButton block label="Continue" disabled={!canContinue} onPress={goNext} />
        ) : (
          <View style={styles.reviewActions}>
            <AppButton
              block
              variant="secondary"
              label="Save draft"
              loading={publishMutation.isPending}
              disabled={publishMutation.isPending || !channelId}
              onPress={() => void publishMutation.mutateAsync(true)}
            />
            <AppButton
              block
              icon={Plus}
              label={scheduleType === 'schedule' ? 'Schedule campaign' : 'Publish campaign'}
              loading={publishMutation.isPending}
              disabled={publishMutation.isPending || !completed.review}
              onPress={() => void publishMutation.mutateAsync(false)}
            />
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={picker !== null} onClose={() => setPicker(null)} sheetStyle={styles.sheetSurface}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>
          {picker === 'channel' ? 'WhatsApp channel'
            : picker === 'countries' ? 'Countries'
              : picker === 'contactField' ? 'Contact field'
                : picker === 'excludeTags' ? 'Exclude tags'
                  : picker === 'assignTags' ? 'Assign tags'
                    : 'Include tags'}
        </Text>
        {picker === 'channel' ? (
          <SheetFlatList
            data={whatsappChannels}
            keyExtractor={(item) => item.id}
            style={styles.sheetList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = channelId === item.id;
              const phone = item.accounts?.[0]?.displayPhoneNumber;
              return (
                <Pressable
                  style={[styles.sheetRow, selected && { backgroundColor: colors.surfaceSecondary }]}
                  onPress={() => {
                    setChannelId(item.id);
                    setSelectedTemplateIds([]);
                    setPicker(null);
                  }}
                >
                  <View style={styles.sheetRowCopy}>
                    <Text style={[styles.sheetRowText, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    {phone ? <Text style={[styles.sheetRowMeta, { color: colors.textSecondary }]} numberOfLines={1}>{phone}</Text> : null}
                  </View>
                  {selected ? <Check color={colors.primary} size={18} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={[styles.sheetEmpty, { color: colors.textMuted }]}>No connected WhatsApp channels.</Text>}
          />
        ) : picker === 'contactField' ? (
          <SheetFlatList
            data={[...CONTACT_FIELD_OPTIONS]}
            keyExtractor={(item) => item.value}
            style={styles.sheetList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={styles.sheetRow}
                onPress={() => {
                  if (activeVariable) setVariable(activeVariable.templateId, activeVariable.key, `@contact:${item.value}`);
                  setPicker(null);
                }}
              >
                <Text style={[styles.sheetRowText, { color: colors.text }]}>{item.label}</Text>
              </Pressable>
            )}
          />
        ) : picker === 'countries' ? (
          <>
            <AppSearchField fill={false} value={pickerSearch} onChangeText={setPickerSearch} placeholder="Search countries" size="sm" tone="background" />
            <SheetFlatList
              data={matchingCountries}
              keyExtractor={(item) => item.dialCode}
              style={styles.sheetList}
              contentContainerStyle={styles.sheetListContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = audienceFilter.countryCodes.includes(item.dialCode);
                return (
                  <Pressable
                    style={[styles.sheetRow, selected && { backgroundColor: colors.surfaceSecondary }]}
                    onPress={() => setAudienceFilter((current) => ({
                      ...current,
                      countryCodes: selected
                        ? current.countryCodes.filter((code) => code !== item.dialCode)
                        : [...current.countryCodes, item.dialCode],
                    }))}
                  >
                    <Text style={[styles.sheetRowText, { color: colors.text }]}>{item.name} (+{item.dialCode})</Text>
                    {selected ? <Check color={colors.primary} size={16} /> : null}
                  </Pressable>
                );
              }}
            />
          </>
        ) : picker === 'includeTags' || picker === 'excludeTags' || picker === 'assignTags' ? (
          <TagPickerSheet
            tags={matchingTags}
            allTags={tags.filter((tag) => !tag.isArchived)}
            selectedIds={
              picker === 'excludeTags'
                ? audienceFilter.excludeTagIds
                : picker === 'assignTags'
                  ? audienceFilter.assignTagIds
                  : audienceFilter.includeTagIds
            }
            search={pickerSearch}
            onSearch={setPickerSearch}
            onToggle={(tagId) => {
              const key = picker === 'excludeTags' ? 'excludeTagIds' : picker === 'assignTags' ? 'assignTagIds' : 'includeTagIds';
              setAudienceFilter((current) => ({
                ...current,
                [key]: current[key].includes(tagId)
                  ? current[key].filter((id) => id !== tagId)
                  : [...current[key], tagId],
              }));
            }}
            colors={colors}
          />
        ) : null}
        {picker === 'countries' || picker === 'includeTags' || picker === 'excludeTags' || picker === 'assignTags' ? (
          <AppButton block label="Done" onPress={() => setPicker(null)} style={{ marginTop: 12 }} />
        ) : null}
      </BottomSheet>
    </View>
  );
}

function FilterRow({
  label,
  value,
  onPress,
  colors,
}: {
  label: string;
  value: string;
  onPress: () => void;
  colors: { text: string; textSecondary: string; background: string; inputBorder: string; textMuted: string };
}) {
  return (
    <View>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Pressable style={[styles.inputButton, { backgroundColor: colors.background, borderColor: colors.inputBorder }]} onPress={onPress}>
        <Text style={[styles.inputButtonText, { color: colors.text }]}>{value}</Text>
        <ChevronRight color={colors.textMuted} size={16} />
      </Pressable>
    </View>
  );
}

function TagPickerSheet({
  tags,
  allTags,
  selectedIds,
  search,
  onSearch,
  onToggle,
  colors,
}: {
  tags: ConversationTag[];
  allTags: ConversationTag[];
  selectedIds: string[];
  search: string;
  onSearch: (value: string) => void;
  onToggle: (tagId: string) => void;
  colors: { text: string; textSecondary: string; textMuted: string; primary: string; background: string; surfaceSecondary: string; cardBorder: string };
}) {
  const chips = allTags.filter((tag) => selectedIds.includes(tag.id));

  return (
    <View>
      {chips.length > 0 ? (
        <View style={styles.selectedChipWrap}>
          {chips.map((tag) => (
            <Pressable
              key={tag.id}
              style={[styles.selectedChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}
              onPress={() => onToggle(tag.id)}
            >
              <View style={[styles.tagDot, { backgroundColor: tag.color?.trim() || colors.primary }]} />
              <Text style={[styles.selectedChipText, { color: colors.text }]} numberOfLines={1}>{tag.text}</Text>
              <X color={colors.textMuted} size={12} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <AppSearchField fill={false} value={search} onChangeText={onSearch} placeholder="Search tags" size="sm" tone="background" />
      <SheetFlatList
        data={tags}
        keyExtractor={(item) => item.id}
        style={styles.sheetList}
        contentContainerStyle={styles.sheetListContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          return (
            <Pressable
              style={[styles.sheetRow, selected && { backgroundColor: colors.surfaceSecondary }]}
              onPress={() => onToggle(item.id)}
            >
              <View style={[styles.tagDot, { backgroundColor: item.color?.trim() || '#64748b' }]} />
              <Text style={[styles.sheetRowText, { color: selected ? colors.primary : colors.text, flex: 1 }]} numberOfLines={1}>
                {item.text}
              </Text>
              {selected ? <Check color={colors.primary} size={16} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.sheetEmpty, { color: colors.textMuted }]}>
            {search.trim() ? 'No matching tags.' : 'No workspace tags yet.'}
          </Text>
        }
      />
    </View>
  );
}

function formatCampaignSchedule(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function mergePickerDate(current: Date, next: Date, part: 'date' | 'time') {
  const merged = new Date(current);
  if (part === 'date') {
    merged.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
  } else {
    merged.setHours(next.getHours(), next.getMinutes(), 0, 0);
  }
  return merged;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  progress: { borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10 },
  progressItem: { alignItems: 'center', flex: 1, gap: 4 },
  progressDot: { alignItems: 'center', borderRadius: 11, height: 22, justifyContent: 'center', width: 22 },
  progressIndex: { color: '#fff', fontSize: 11, fontWeight: '800' },
  progressLabel: { fontSize: 10, fontWeight: '700' },
  content: { gap: 12, padding: 16 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  textArea: { minHeight: 110 },
  inputButton: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  inputButtonText: { flex: 1, fontSize: 14, marginRight: 8 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  templateRow: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 10, padding: 12 },
  templateCopy: { flex: 1, minWidth: 0 },
  templateName: { fontSize: 14, fontWeight: '800' },
  templateBody: { fontSize: 12, marginTop: 4 },
  mapBlock: { gap: 10 },
  varBlock: { marginTop: 4 },
  varName: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 13, fontWeight: '700' },
  mediaButton: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 8, padding: 12 },
  mediaButtonText: { flex: 1, fontSize: 13, fontWeight: '700' },
  audienceCount: { fontSize: 16, fontWeight: '800', marginTop: 8 },
  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 16 },
  toggleCopy: { flex: 1 },
  reviewActions: { gap: 10 },
  sheetSurface: { paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  sheetList: { marginTop: 8, maxHeight: 320 },
  sheetListContent: { flexGrow: 0, paddingBottom: 4 },
  sheetRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 12 },
  sheetRowCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  sheetRowText: { fontSize: 15, fontWeight: '700' },
  sheetRowMeta: { fontSize: 12, marginTop: 2 },
  sheetEmpty: { fontSize: 13, paddingVertical: 16, textAlign: 'center' },
  selectedChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  selectedChip: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 6 },
  selectedChipText: { flexShrink: 1, fontSize: 12, fontWeight: '700' },
  tagDot: { borderRadius: 5, height: 10, width: 10 },
});
