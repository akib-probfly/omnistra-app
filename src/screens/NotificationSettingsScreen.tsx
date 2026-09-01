import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Bell, Clock3, MessageSquareMore, PhoneIncoming, Smartphone, Speaker, Volume2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { showNotice } from '../components/AppToast';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { ScreenHeader } from '../ui';
import { DEFAULT_NOTIFICATION_PREFERENCES, fetchNotificationPreferences, notificationQueryKeys, updateNotificationPreferences, type NotificationPreferences } from '../api/notifications';
import { fetchMyWorkspaces } from '../api/workspaces';
import { AppToggle } from '../components/AppToggle';
import { ErrorState } from '../components/ErrorState';
import { FormSkeleton } from '../components/Skeleton';
import { registerMobilePushDeviceIfPermitted } from '../lib/mobilePushRegistration';

type PreferenceKey = keyof NotificationPreferences;

const DELIVERY_ROWS: Array<{
  key: PreferenceKey;
  title: string;
  description: string;
  icon: typeof Bell;
  push?: boolean;
}> = [
  {
    key: 'newConversationAlertsEnabled',
    title: 'In-app alerts',
    description: 'Show live badges and drawer updates while you are inside Zurvis.',
    icon: Bell,
  },
  {
    key: 'incomingCallAlertsEnabled',
    title: 'Incoming call alerts',
    description: 'Show incoming call notifications when a call arrives.',
    icon: PhoneIncoming,
  },
  {
    key: 'mobilePushNotificationsEnabled',
    title: 'Mobile push notifications',
    description: 'Deliver device alerts when Zurvis is in the background.',
    icon: Smartphone,
    push: true,
  },
  {
    key: 'soundEnabled',
    title: 'Sound alerts',
    description: 'Play the notification tone for new conversations and assignments.',
    icon: Volume2,
  },
];

export function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { colors } = useTheme();

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });
  const workspaceId = workspacesQuery.data?.items?.[0]?.id;

  const preferencesQuery = useQuery({
    queryKey: workspaceId ? notificationQueryKeys.preferences(workspaceId) : ['notifications', 'preferences', 'disabled'],
    queryFn: () => fetchNotificationPreferences(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
  });

  const preferences = preferencesQuery.data ?? DEFAULT_NOTIFICATION_PREFERENCES;
  const [pushPending, setPushPending] = useState(false);
  const controlsReady = preferencesQuery.isSuccess;

  const persistMutation = useMutation({
    mutationFn: (next: NotificationPreferences) => updateNotificationPreferences(workspaceId!, next),
    onMutate: async (next) => {
      if (!workspaceId) return { previous: null as NotificationPreferences | null };
      const key = notificationQueryKeys.preferences(workspaceId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferences>(key) ?? DEFAULT_NOTIFICATION_PREFERENCES;
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (error, _next, context) => {
      if (workspaceId && context?.previous) {
        queryClient.setQueryData(notificationQueryKeys.preferences(workspaceId), context.previous);
      }
      showNotice('Could not save preferences', error instanceof Error ? error.message : 'Please try again.');
    },
    onSuccess: (next) => {
      if (!workspaceId) return;
      queryClient.setQueryData(notificationQueryKeys.preferences(workspaceId), next);
    },
  });

  const save = useCallback(
    (updater: (current: NotificationPreferences) => NotificationPreferences) => {
      if (!workspaceId || !preferencesQuery.isSuccess) return;
      const current = queryClient.getQueryData<NotificationPreferences>(notificationQueryKeys.preferences(workspaceId)) ?? DEFAULT_NOTIFICATION_PREFERENCES;
      const next = updater(current);
      queryClient.setQueryData(notificationQueryKeys.preferences(workspaceId), next);
      persistMutation.mutate(next);
    },
    [persistMutation, preferencesQuery.isSuccess, queryClient, workspaceId],
  );

  const toggle = async (key: PreferenceKey, push = false) => {
    if (!controlsReady) return;
    const current = workspaceId ? (queryClient.getQueryData<NotificationPreferences>(notificationQueryKeys.preferences(workspaceId)) ?? preferences) : preferences;
    const nextValue = !current[key];
    if (push && nextValue) {
      setPushPending(true);
      try {
        const permission = await Notifications.getPermissionsAsync();
        let status = permission.status;
        if (status !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (status !== 'granted') {
          showNotice('Permission required', 'Enable notifications for Zurvis in your device settings to receive push alerts.');
          return;
        }
        await registerMobilePushDeviceIfPermitted();
      } finally {
        setPushPending(false);
      }
    }
    save((prefs) => ({ ...prefs, [key]: nextValue }));
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Notifications" subtitle={preferencesQuery.isSuccess ? 'Preferences saved to workspace' : 'Loading workspace preferences'} onBack={() => navigation.goBack()} />

      {workspacesQuery.isLoading || preferencesQuery.isLoading ? (
        <FormSkeleton fields={6} />
      ) : workspacesQuery.isError || !workspaceId ? (
        <ErrorState message={workspacesQuery.error instanceof Error ? workspacesQuery.error.message : 'Unable to load workspace.'} onRetry={() => workspacesQuery.refetch()} />
      ) : preferencesQuery.isError ? (
        <ErrorState message={preferencesQuery.error instanceof Error ? preferencesQuery.error.message : 'Unable to load notification preferences.'} onRetry={() => preferencesQuery.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Delivery channels</Text>
          <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>Keep the channels you actually use, and mute the rest.</Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            {DELIVERY_ROWS.map((row, index) => {
              const Icon = row.icon;
              const enabled = preferences[row.key];
              return (
                <View
                  key={row.key}
                  style={[
                    styles.row,
                    index < DELIVERY_ROWS.length - 1 && {
                      borderBottomColor: colors.separator,
                      borderBottomWidth: 1,
                    },
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: colors.surfaceSecondary }]}>
                    <Icon color={colors.primary} size={18} />
                  </View>
                  <View style={styles.rowCopy}>
                    <View style={styles.titleLine}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>{row.title}</Text>
                      <Text
                        style={[
                          styles.badge,
                          enabled
                            ? styles.badgeOn
                            : {
                                backgroundColor: colors.surfaceSecondary,
                                color: colors.textSecondary,
                              },
                        ]}
                      >
                        {enabled ? 'On' : 'Off'}
                      </Text>
                    </View>
                    <Text style={[styles.rowBody, { color: colors.textSecondary }]}>{row.description}</Text>
                  </View>
                  <AppToggle value={enabled} disabled={!controlsReady || (Boolean(row.push) && pushPending)} onValueChange={() => void toggle(row.key, row.push)} accessibilityLabel={row.title} />
                </View>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.text }]}>Alert scope</Text>
          <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>Keep live alerts focused on the activity that matters most.</Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <MessageSquareMore color={colors.primary} size={18} />
              </View>
              <View style={styles.rowCopy}>
                <View style={styles.titleLine}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>Mentions and assignments only</Text>
                  <Text
                    style={[
                      styles.badge,
                      preferences.mentionsAndAssignmentsOnly
                        ? styles.badgeOn
                        : {
                            backgroundColor: colors.surfaceSecondary,
                            color: colors.textSecondary,
                          },
                    ]}
                  >
                    {preferences.mentionsAndAssignmentsOnly ? 'On' : 'Off'}
                  </Text>
                </View>
                <Text style={[styles.rowBody, { color: colors.textSecondary }]}>Limit live alerts to direct mentions and reassigned work. Other activity stays in the inbox.</Text>
              </View>
              <AppToggle value={preferences.mentionsAndAssignmentsOnly} disabled={!controlsReady} onValueChange={() => void toggle('mentionsAndAssignmentsOnly')} accessibilityLabel="Mentions and assignments only" />
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.text }]}>More options</Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <View style={[styles.row, { borderBottomColor: colors.separator, borderBottomWidth: 1 }]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <Speaker color={colors.primary} size={18} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Background sound</Text>
                <Text style={[styles.rowBody, { color: colors.textSecondary }]}>Keep tones available when the app is inactive.</Text>
              </View>
              <AppToggle value={preferences.backgroundSoundEnabled} disabled={!controlsReady} onValueChange={() => void toggle('backgroundSoundEnabled')} accessibilityLabel="Background sound" />
            </View>
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <Clock3 color={colors.primary} size={18} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Daily summary digest</Text>
                <Text style={[styles.rowBody, { color: colors.textSecondary }]}>Send a compact recap so you can catch up later.</Text>
              </View>
              <AppToggle value={preferences.dailySummaryDigestEnabled} disabled={!controlsReady} onValueChange={() => void toggle('dailySummaryDigestEnabled')} accessibilityLabel="Daily summary digest" />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f8fafc', flex: 1 },
  loader: { marginTop: 60 },
  content: { padding: 16 },
  sectionLabel: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
    marginTop: 8,
  },
  sectionHint: { color: '#64748b', fontSize: 13, marginBottom: 10 },
  card: {
    backgroundColor: '#fff',
    borderColor: '#d8e6fb',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowBorder: { borderBottomColor: '#eef2f7', borderBottomWidth: 1 },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  rowCopy: { flex: 1, minWidth: 0, paddingRight: 4 },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowTitle: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  rowBody: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 4 },
  badge: {
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
    textTransform: 'uppercase',
  },
  badgeOn: { backgroundColor: '#ecfdf5', color: '#047857' },
  badgeOff: { backgroundColor: '#f1f5f9', color: '#64748b' },
});
