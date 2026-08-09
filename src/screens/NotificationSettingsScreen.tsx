import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import {
  ArrowLeft,
  Bell,
  Clock3,
  MessageSquareMore,
  PhoneIncoming,
  Smartphone,
  Speaker,
  Volume2,
} from 'lucide-react-native';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  fetchNotificationPreferences,
  notificationQueryKeys,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '../api/notifications';
import { fetchMyWorkspaces } from '../api/workspaces';
import { AppToggle } from '../components/AppToggle';
import { ErrorState } from '../components/ErrorState';

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
    description: 'Show live badges and drawer updates while you are inside Omnistra.',
    icon: Bell,
  },
  {
    key: 'incomingCallAlertsEnabled',
    title: 'Incoming call alerts',
    description: 'Show incoming call notifications when a call arrives.',
    icon: PhoneIncoming,
  },
  {
    key: 'browserNotificationsEnabled',
    title: 'Push notifications',
    description: 'Deliver device alerts when Omnistra is in the background.',
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
      Alert.alert('Could not save preferences', error instanceof Error ? error.message : 'Please try again.');
    },
    onSuccess: (next) => {
      if (!workspaceId) return;
      queryClient.setQueryData(notificationQueryKeys.preferences(workspaceId), next);
    },
  });

  const save = useCallback((updater: (current: NotificationPreferences) => NotificationPreferences) => {
    if (!workspaceId || !preferencesQuery.isSuccess) return;
    const next = updater(preferences);
    queryClient.setQueryData(notificationQueryKeys.preferences(workspaceId), next);
    void persistMutation.mutateAsync(next).catch(() => undefined);
  }, [persistMutation, preferences, preferencesQuery.isSuccess, queryClient, workspaceId]);

  const toggle = async (key: PreferenceKey, push = false) => {
    const nextValue = !preferences[key];
    if (push && nextValue) {
      const current = await Notifications.getPermissionsAsync();
      let status = current.status;
      if (status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Enable notifications for Omnistra in your device settings to receive push alerts.');
        return;
      }
    }
    save((current) => ({ ...current, [key]: nextValue }));
  };

  const busy = !preferencesQuery.isSuccess || persistMutation.isPending;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <ArrowLeft color="#0f172a" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>
            {preferencesQuery.isSuccess ? 'Preferences saved to workspace' : 'Loading workspace preferences'}
          </Text>
        </View>
      </View>

      {workspacesQuery.isLoading || preferencesQuery.isLoading ? (
        <ActivityIndicator color="#2563eb" style={styles.loader} />
      ) : workspacesQuery.isError || !workspaceId ? (
        <ErrorState
          message={workspacesQuery.error instanceof Error ? workspacesQuery.error.message : 'Unable to load workspace.'}
          onRetry={() => workspacesQuery.refetch()}
        />
      ) : preferencesQuery.isError ? (
        <ErrorState
          message={preferencesQuery.error instanceof Error ? preferencesQuery.error.message : 'Unable to load notification preferences.'}
          onRetry={() => preferencesQuery.refetch()}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <Text style={styles.sectionLabel}>Delivery channels</Text>
          <Text style={styles.sectionHint}>Keep the channels you actually use, and mute the rest.</Text>
          <View style={styles.card}>
            {DELIVERY_ROWS.map((row, index) => {
              const Icon = row.icon;
              const enabled = preferences[row.key];
              return (
                <View key={row.key} style={[styles.row, index < DELIVERY_ROWS.length - 1 && styles.rowBorder]}>
                  <View style={styles.rowIcon}>
                    <Icon color="#2563eb" size={18} />
                  </View>
                  <View style={styles.rowCopy}>
                    <View style={styles.titleLine}>
                      <Text style={styles.rowTitle}>{row.title}</Text>
                      <Text style={[styles.badge, enabled ? styles.badgeOn : styles.badgeOff]}>{enabled ? 'On' : 'Off'}</Text>
                    </View>
                    <Text style={styles.rowBody}>{row.description}</Text>
                  </View>
                  <AppToggle
                    value={enabled}
                    disabled={busy}
                    onValueChange={() => void toggle(row.key, row.push)}
                    accessibilityLabel={row.title}
                  />
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Alert scope</Text>
          <Text style={styles.sectionHint}>Keep live alerts focused on the activity that matters most.</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <MessageSquareMore color="#2563eb" size={18} />
              </View>
              <View style={styles.rowCopy}>
                <View style={styles.titleLine}>
                  <Text style={styles.rowTitle}>Mentions and assignments only</Text>
                  <Text style={[styles.badge, preferences.mentionsAndAssignmentsOnly ? styles.badgeOn : styles.badgeOff]}>
                    {preferences.mentionsAndAssignmentsOnly ? 'On' : 'Off'}
                  </Text>
                </View>
                <Text style={styles.rowBody}>
                  Limit live alerts to direct mentions and reassigned work. Other activity stays in the inbox.
                </Text>
              </View>
              <AppToggle
                value={preferences.mentionsAndAssignmentsOnly}
                disabled={busy}
                onValueChange={() => toggle('mentionsAndAssignmentsOnly')}
                accessibilityLabel="Mentions and assignments only"
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>More options</Text>
          <View style={styles.card}>
            <View style={[styles.row, styles.rowBorder]}>
              <View style={styles.rowIcon}>
                <Speaker color="#2563eb" size={18} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Background sound</Text>
                <Text style={styles.rowBody}>Keep tones available when the app is inactive.</Text>
              </View>
              <AppToggle
                value={preferences.backgroundSoundEnabled}
                disabled={busy}
                onValueChange={() => toggle('backgroundSoundEnabled')}
                accessibilityLabel="Background sound"
              />
            </View>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Clock3 color="#2563eb" size={18} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Daily summary digest</Text>
                <Text style={styles.rowBody}>Send a compact recap so you can catch up later.</Text>
              </View>
              <AppToggle
                value={preferences.dailySummaryDigestEnabled}
                disabled={busy}
                onValueChange={() => toggle('dailySummaryDigestEnabled')}
                accessibilityLabel="Daily summary digest"
              />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f8fafc', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingBottom: 12, paddingHorizontal: 14 },
  backButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#64748b', fontSize: 12, marginTop: 2 },
  loader: { marginTop: 60 },
  content: { padding: 16 },
  sectionLabel: { color: '#0f172a', fontSize: 16, fontWeight: '800', marginBottom: 4, marginTop: 8 },
  sectionHint: { color: '#64748b', fontSize: 13, marginBottom: 10 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, marginBottom: 18, overflow: 'hidden' },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  rowBorder: { borderBottomColor: '#eef2f7', borderBottomWidth: 1 },
  rowIcon: { alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 14, height: 40, justifyContent: 'center', width: 40 },
  rowCopy: { flex: 1, minWidth: 0, paddingRight: 4 },
  titleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowTitle: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  rowBody: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 4 },
  badge: { borderRadius: 999, fontSize: 10, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, textTransform: 'uppercase' },
  badgeOn: { backgroundColor: '#ecfdf5', color: '#047857' },
  badgeOff: { backgroundColor: '#f1f5f9', color: '#64748b' },
});
