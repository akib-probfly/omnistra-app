// @ts-nocheck
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LoaderCircle, Save, Zap } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppToggle } from './AppToggle';
import {
  fetchChannelQuickAutomationSettings,
  updateChannelQuickAutomationSettings,
  type ChannelQuickAutomationBusinessHours,
  type ChannelQuickAutomationSettings,
  type ChannelType,
} from '../api/channels';
import { useTheme } from '../theme/ThemeContext';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const FREQUENCIES = [
  { value: 'LIFETIME', label: 'Once ever' },
  { value: 'TWENTY_FOUR_HOURS', label: 'Once every 24 hours' },
  { value: 'EVERY_TIME', label: 'Every time' },
] as const;

const DEFAULT_BUSINESS_HOURS: ChannelQuickAutomationBusinessHours = {
  Mon: { enabled: true, from: '09:00', to: '18:00' },
  Tue: { enabled: true, from: '09:00', to: '18:00' },
  Wed: { enabled: true, from: '09:00', to: '18:00' },
  Thu: { enabled: true, from: '09:00', to: '18:00' },
  Fri: { enabled: true, from: '09:00', to: '18:00' },
  Sat: { enabled: false, from: '10:00', to: '16:00' },
  Sun: { enabled: false, from: '10:00', to: '16:00' },
};

function parseTimeToDate(value: string, hourOfDay: 'from' | 'to') {
  const [hour, minute] = (value ?? '09:00').split(':').map((part) => Number.parseInt(part, 10));
  const date = new Date();
  date.setHours(Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 9, Number.isFinite(minute) ? minute : 0, 0, 0);
  return date;
}

function toTimeString(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function QuickAutomationTab({ channelId, channelType }: { channelId: string; channelType: ChannelType }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['channel-automation', channelId],
    queryFn: () => fetchChannelQuickAutomationSettings(channelId),
    staleTime: 30000,
  });
  const settings: ChannelQuickAutomationSettings | undefined = settingsQuery.data;

  const [draft, setDraft] = useState(() => ({
    welcomeEnabled: false,
    welcomeMessage: '',
    welcomeSendFrequency: 'LIFETIME' as const,
    offHourEnabled: false,
    offHourMessage: '',
    businessHours: DEFAULT_BUSINESS_HOURS,
  }));

  useEffect(() => {
    if (!settings) return;
    setDraft({
      welcomeEnabled: settings.welcomeEnabled,
      welcomeMessage: settings.welcomeMessage ?? '',
      welcomeSendFrequency: settings.welcomeSendFrequency,
      offHourEnabled: settings.offHourEnabled,
      offHourMessage: settings.offHourMessage ?? '',
      businessHours: { ...DEFAULT_BUSINESS_HOURS, ...(settings.businessHours ?? {}) },
    });
  }, [settings]);

  const [picker, setPicker] = useState<{ day: (typeof DAYS)[number]; slot: 'from' | 'to' } | null>(null);

  const save = useMutation({
    mutationFn: () =>
      updateChannelQuickAutomationSettings(channelId, {
        welcomeEnabled: draft.welcomeEnabled,
        welcomeMessage: draft.welcomeMessage.trim() ? draft.welcomeMessage.trim() : null,
        welcomeAttachments: settings?.welcomeAttachments ?? [],
        welcomeSendFrequency: draft.welcomeSendFrequency,
        offHourEnabled: draft.offHourEnabled,
        offHourMessage: draft.offHourMessage.trim() ? draft.offHourMessage.trim() : null,
        offHourAttachments: settings?.offHourAttachments ?? [],
        businessHours: draft.businessHours,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-automation', channelId] });
      Alert.alert('Automation saved', 'Your quick automation settings were updated.');
    },
    onError: (error) => Alert.alert('Could not save', error instanceof Error ? error.message : undefined),
  });

  const setHour = (day: (typeof DAYS)[number], slot: 'from' | 'to', time: string) => {
    setDraft((current) => ({
      ...current,
      businessHours: { ...current.businessHours, [day]: { ...current.businessHours[day], [slot]: time } },
    }));
  };

  const channelLabel = channelType === 'MESSENGER' ? 'Messenger' : 'WhatsApp';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={styles.cardHead}>
          <Zap color={colors.primary} size={18} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Welcome message</Text>
        </View>
        <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
          Sent automatically when a customer messages this {channelLabel} channel for the first time.
        </Text>

        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>Enabled</Text>
          <AppToggle value={draft.welcomeEnabled} onValueChange={(value) => setDraft({ ...draft, welcomeEnabled: value })} accessibilityLabel="Welcome message enabled" />
        </View>

        {draft.welcomeEnabled ? (
          <>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Message</Text>
            <TextInput
              value={draft.welcomeMessage}
              onChangeText={(text) => setDraft({ ...draft, welcomeMessage: text })}
              placeholder="Hi {{name}}! Thanks for reaching out..."
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.inputMultiline, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
            />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Send frequency</Text>
            <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary }]}>
              {FREQUENCIES.map((option) => (
                <Pressable key={option.value} onPress={() => setDraft({ ...draft, welcomeSendFrequency: option.value })} style={[styles.segmentOption, draft.welcomeSendFrequency === option.value && { backgroundColor: colors.surface }]}>
                  <Text style={[styles.segmentText, { color: colors.textSecondary }, draft.welcomeSendFrequency === option.value && { color: colors.primary }]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={styles.cardHead}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Off-hour message</Text>
        </View>
        <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Sent when a customer messages outside your business hours.</Text>

        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>Enabled</Text>
          <AppToggle value={draft.offHourEnabled} onValueChange={(value) => setDraft({ ...draft, offHourEnabled: value })} accessibilityLabel="Off-hour message enabled" />
        </View>

        {draft.offHourEnabled ? (
          <>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Message</Text>
            <TextInput
              value={draft.offHourMessage}
              onChangeText={(text) => setDraft({ ...draft, offHourMessage: text })}
              placeholder="We are currently closed. We will reply during business hours."
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.inputMultiline, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
            />
          </>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Business hours</Text>
        <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Used to decide when the off-hour message should apply.</Text>
        {DAYS.map((day) => (
          <View key={day} style={styles.dayRow}>
            <AppToggle
              value={draft.businessHours[day].enabled}
              onValueChange={(value) => setDraft({ ...draft, businessHours: { ...draft.businessHours, [day]: { ...draft.businessHours[day], enabled: value } } })}
              accessibilityLabel={`${day} business hours enabled`}
            />
            <Text style={[styles.dayLabel, { color: colors.textSecondary }]}>{day}</Text>
            <Pressable disabled={!draft.businessHours[day].enabled} onPress={() => setPicker({ day, slot: 'from' })} style={[styles.timeChip, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, !draft.businessHours[day].enabled && styles.timeChipDisabled]}>
              <Text style={[styles.timeChipText, { color: colors.text }]}>{draft.businessHours[day].from}</Text>
            </Pressable>
            <Text style={[styles.dayDash, { color: colors.textMuted }]}>—</Text>
            <Pressable disabled={!draft.businessHours[day].enabled} onPress={() => setPicker({ day, slot: 'to' })} style={[styles.timeChip, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, !draft.businessHours[day].enabled && styles.timeChipDisabled]}>
              <Text style={[styles.timeChipText, { color: colors.text }]}>{draft.businessHours[day].to}</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {picker ? (
        <DateTimePicker
          value={parseTimeToDate(draft.businessHours[picker.day][picker.slot], picker.slot)}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            if (Platform.OS === 'android') setPicker(null);
            if (event.type === 'set' && date) setHour(picker.day, picker.slot, toTimeString(date));
            if (Platform.OS === 'ios' && date) setHour(picker.day, picker.slot, toTimeString(date));
          }}
        />
      ) : null}

      <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }, save.isPending && styles.primaryButtonDisabled]} onPress={() => save.mutate()} disabled={save.isPending || settingsQuery.isLoading}>
        {save.isPending ? <LoaderCircle color={colors.primaryText} size={16} /> : <Save color={colors.primaryText} size={16} />}
        <Text style={styles.primaryButtonText}>Save automation</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 20, borderWidth: 1, marginBottom: 14, padding: 16 },
  cardHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  cardTitle: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  cardSub: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 4 },
  toggleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  toggleLabel: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  fieldLabel: { color: '#64748b', fontSize: 12, marginTop: 14 },
  inputMultiline: { backgroundColor: '#f8fbff', borderColor: '#cfe1ff', borderRadius: 14, borderWidth: 1, color: '#0f172a', fontSize: 14, minHeight: 88, paddingHorizontal: 14, paddingVertical: 12, marginTop: 6, textAlignVertical: 'top' },
  segment: { backgroundColor: '#eef2fb', borderRadius: 12, flexDirection: 'row', marginTop: 6, padding: 3 },
  segmentOption: { alignItems: 'center', borderRadius: 9, flex: 1, paddingVertical: 8 },
  segmentOptionActive: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segmentText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: '#2563eb' },
  dayRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 12 },
  dayLabel: { color: '#334155', flex: 1, fontSize: 14, fontWeight: '600' },
  timeChip: { alignItems: 'center', backgroundColor: '#f8fbff', borderColor: '#cfe1ff', borderRadius: 10, borderWidth: 1, minWidth: 64, paddingHorizontal: 10, paddingVertical: 7 },
  timeChipDisabled: { opacity: 0.45 },
  timeChipText: { color: '#0f172a', fontSize: 13, fontWeight: '600' },
  dayDash: { color: '#94a3b8', fontSize: 13 },
  primaryButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 14, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 12 },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', flexShrink: 1, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
