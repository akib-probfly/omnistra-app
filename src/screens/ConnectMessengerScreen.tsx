import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, usePreventRemove, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Check, LockKeyhole } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { confirmMessengerConnect, previewMessengerConnect, startMessengerManualConnect, startMessengerBusinessConnect, type Channel, type MessengerConnectPreview } from '../api/channels';
import { authorizeMessengerBusiness } from '../lib/messenger-business-connect';
import { useAuth } from '../auth/AuthContext';
import { ChannelLogo } from '../components/ChannelLogo';
import { workspaceIdFromAccessToken } from '../lib/jwt-workspace';
import { useWorkspaceAccess } from '../lib/workspace-access';
import type { ChannelsStackParamList } from '../navigation/ChannelsStack';
import { useTheme } from '../theme/ThemeContext';
import { opacity, radius, spacing } from '../theme/tokens';
import { AppButton, AppCard, AppText, AppTextField, ScreenHeader } from '../ui';

export function ConnectMessengerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ChannelsStackParamList>>();
  const route = useRoute<RouteProp<ChannelsStackParamList, 'ConnectMessenger'>>();
  const businessManager = route.params?.mode === 'business_manager';
  const browserAbort = useRef<AbortController | null>(null);
  useEffect(() => () => browserAbort.current?.abort(), []);
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { session } = useAuth();
  const { canManage } = useWorkspaceAccess();
  const workspaceId = workspaceIdFromAccessToken(session?.accessToken);
  const [accessToken, setAccessToken] = useState('');
  const [preview, setPreview] = useState<MessengerConnectPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [expired, setExpired] = useState(false);
  const [completed, setCompleted] = useState<Channel[] | null>(null);
  useEffect(() => {
    if (!preview) return;
    const remaining = Date.parse(preview.expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) { setExpired(true); return; }
    const timer = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [preview]);
  const loadPages = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!workspaceId || !canManage) throw new Error('Workspace admin or manager access is required.');
      let result: MessengerConnectPreview;
      if (businessManager) {
        const controller = new AbortController();
        browserAbort.current = controller;
        try {
          const launch = await startMessengerBusinessConnect(workspaceId);
          const code = await authorizeMessengerBusiness(launch, controller.signal);
          result = await previewMessengerConnect({ state: launch.state, code, codeSource: 'sdk' });
        } finally { browserAbort.current = null; }
      } else {
        const launch = await startMessengerManualConnect(workspaceId);
        result = await previewMessengerConnect({ state: launch.state, accessToken: accessToken.trim() });
      }
      if (result.workspaceId !== workspaceId) throw new Error('Workspace changed. Start the connection again.');
      return result;
    },
    onSuccess: result => {
      setPreview(result);
      setSelected(result.pages.filter(page => page.isConnectedInWorkspace && !page.isConnectedElsewhere).map(page => page.id));
      setExpired(false);
      setAccessToken('');
    },
  });
  const selectedNewCount = preview?.pages.filter(page => selected.includes(page.id) && !page.isConnectedInWorkspace).length ?? 0;
  const overLimit = preview?.remainingChannelSlots != null && selectedNewCount > preview.remainingChannelSlots;
  const connect = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!preview || preview.workspaceId !== workspaceId || !canManage || !selected.length || overLimit || Date.parse(preview.expiresAt) <= Date.now()) throw new Error('Review your Page selection or start again if the session has expired.');
      const result = await confirmMessengerConnect({ state: preview.state, previewToken: preview.previewToken, selectedPageIds: selected });
      if (!result.channels.length) throw new Error('No channels were returned. Refresh your channels before trying again.');
      return result;
    },
    onSuccess: result => {
      setCompleted(result.channels);
      setPreview(null);
      setSelected([]);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['channels'] }),
        queryClient.invalidateQueries({ queryKey: ['billing-usage', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        ...result.channels.map(channel => queryClient.invalidateQueries({ queryKey: ['channel-details', channel.id] })),
      ]);
    },
  });
  const busy = loadPages.isPending || connect.isPending;
  usePreventRemove(busy, () => {});
  const restart = () => { setPreview(null); setSelected([]); setExpired(false); loadPages.reset(); connect.reset(); };
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <ScreenHeader title="Connect Messenger" subtitle={businessManager ? 'Business Manager' : 'Manual setup'} onBack={busy ? undefined : () => navigation.goBack()} />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <ChannelLogo type="MESSENGER" />
        {completed ? <AppCard><View style={styles.fields}>
          <AppText variant="heading">Messenger setup completed</AppText>
          <AppText tone="secondary">Review the connection status of your selected Pages.</AppText>
          {completed.map(channel => <AppButton key={channel.id} label={channel.name} variant="secondary" onPress={() => navigation.replace('ChannelDetails', { channelId: channel.id, channelName: channel.name })} />)}
          <AppButton label="Back to channels" onPress={() => navigation.popTo('ChannelsList')} />
        </View></AppCard> : preview ? <>
          <AppText variant="heading">Select Facebook Pages</AppText>
          <AppText tone="secondary">Choose the Pages you want to connect. Existing workspace channels can be reused.</AppText>
          {preview.remainingChannelSlots != null ? <AppText variant="caption" tone="secondary">{preview.remainingChannelSlots} channel slots available · {selectedNewCount} new Pages selected</AppText> : null}
          {!preview.pages.length ? <AppText tone="secondary">No Facebook Pages are available for this token. Check its Page access and permissions, then try again.</AppText> : null}
          {preview.pages.map(page => {
            const checked = selected.includes(page.id);
            const quotaBlocked = !checked && !page.isConnectedInWorkspace && preview.remainingChannelSlots != null && selectedNewCount >= preview.remainingChannelSlots;
            const disabled = busy || expired || page.isConnectedElsewhere || quotaBlocked;
            return <Pressable key={page.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => setSelected(current => checked ? current.filter(id => id !== page.id) : [...current, page.id])} style={[styles.page, { backgroundColor: colors.surface, borderColor: checked ? colors.primary : colors.cardBorder, opacity: disabled ? opacity.disabled : 1 }]}>
              <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.cardBorder }]}>{checked ? <Check size={18} color={colors.primary} /> : page.isConnectedElsewhere ? <LockKeyhole size={16} color={colors.textMuted} /> : null}</View>
              <View style={styles.copy}><AppText variant="bodyStrong">{page.name || 'Facebook Page'}</AppText><AppText variant="caption" tone="muted">{page.id}</AppText><AppText variant="caption" tone="secondary">{page.isConnectedElsewhere ? 'Connected to another workspace' : page.isConnectedInWorkspace ? 'Already connected in this workspace' : 'Available to connect'}</AppText></View>
            </Pressable>;
          })}
          {expired ? <AppText tone="error">This setup session has expired. Start again to reload your Pages.</AppText> : null}
          {overLimit ? <AppText tone="error">Your selection exceeds the available channel slots.</AppText> : null}
          {connect.isError ? <AppText tone="error">{connect.error.message}</AppText> : null}
          <AppButton label="Connect selected Pages" block loading={connect.isPending} loadingLabel="Connecting..." disabled={!selected.length || expired || overLimit || !canManage} onPress={() => { if (!busy) connect.mutate(); }} />
          <AppButton label="Start again" variant="secondary" disabled={busy} onPress={restart} />
        </> : <AppCard><View style={styles.fields}>
          <AppText variant="heading">{businessManager ? 'Connect through Facebook' : 'Connect with a user access token'}</AppText>
          <AppText tone="secondary">{businessManager ? 'Sign in with Facebook Business Manager in the authentication window, then select your Pages here.' : 'Enter a Meta user access token with access to your Facebook Pages. You can review and select Pages before connecting them.'}</AppText>
          {!businessManager ? <AppTextField label="User Access Token" required value={accessToken} onChangeText={setAccessToken} secureTextEntry autoCapitalize="none" autoComplete="off" editable={!busy} placeholder="Enter your Meta user access token" helpText="Use a user token with Page messaging and management permissions." /> : null}
          {!workspaceId || !canManage ? <AppText tone="error">Workspace admin or manager access is required.</AppText> : null}
          {loadPages.isError ? <AppText tone="error">{loadPages.error.message}</AppText> : null}
          <AppButton label={businessManager ? "Continue with Facebook" : "Load Facebook Pages"} block disabled={!workspaceId || !canManage || (!businessManager && !accessToken.trim())} loading={loadPages.isPending} loadingLabel={businessManager ? "Waiting for Facebook..." : "Loading Pages..."} onPress={() => { if (!busy) loadPages.mutate(); }} />
          {businessManager && loadPages.isPending ? <AppButton label="Cancel sign-in" variant="secondary" onPress={() => browserAbort.current?.abort()} /> : null}
        </View></AppCard>}
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }, fields: { gap: spacing.lg }, page: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderRadius: radius.xl }, checkbox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: radius.xs, borderWidth: 1 }, copy: { flex: 1, gap: spacing.xs } });
