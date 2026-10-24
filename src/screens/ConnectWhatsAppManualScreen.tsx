import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { connectWhatsAppCloudApi } from '../api/channels';
import { fetchWorkspaceUsage } from '../api/billing';
import { useAuth } from '../auth/AuthContext';
import { ChannelLogo } from '../components/ChannelLogo';
import { workspaceIdFromAccessToken } from '../lib/jwt-workspace';
import { useWorkspaceAccess } from '../lib/workspace-access';
import type { ChannelsStackParamList } from '../navigation/ChannelsStack';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/tokens';
import { AppButton, AppCard, AppText, AppTextField, ScreenHeader } from '../ui';

export function ConnectWhatsAppManualScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ChannelsStackParamList>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { session } = useAuth();
  const { canManage } = useWorkspaceAccess();
  const workspaceId = workspaceIdFromAccessToken(session?.accessToken);
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [completed, setCompleted] = useState<{ id: string; name: string } | null>(null);
  const usage = useQuery({ queryKey: ['billing-usage', workspaceId], queryFn: () => fetchWorkspaceUsage(workspaceId!), enabled: Boolean(workspaceId), staleTime: 30_000 });
  const atLimit = usage.data?.channelLimit != null && usage.data.channelCount >= usage.data.channelLimit;
  const connect = useMutation({
    retry: false,
    mutationFn: () => {
      if (!workspaceId || !canManage) throw new Error('Workspace access is required to connect a channel.');
      return connectWhatsAppCloudApi({ workspaceId, wabaId: wabaId.trim(), phoneNumberId: phoneNumberId.trim(), accessToken: accessToken.trim() });
    },
    onSuccess: result => {
      setAccessToken('');
      setCompleted({ id: result.channel.id, name: result.channel.name });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['channels'] }),
        queryClient.invalidateQueries({ queryKey: ['billing-usage', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      Toast.show({ type: 'success', text1: 'WhatsApp setup completed', text2: 'Open the channel to check its connection status.' });
    },
  });
  usePreventRemove(connect.isPending, () => {});
  const ready = Boolean(workspaceId && canManage && usage.isSuccess && !atLimit && wabaId.trim() && phoneNumberId.trim() && accessToken.trim());
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <ScreenHeader title="WhatsApp Manual Setup" onBack={connect.isPending ? undefined : () => navigation.goBack()} />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.intro}><ChannelLogo type="WHATSAPP" /><AppText variant="heading">Connect with Meta Cloud API</AppText><AppText tone="secondary">Use the credentials from your Meta business account to connect your WhatsApp number.</AppText></View>
        {completed ? <AppCard>
          <AppText variant="heading">Channel setup completed</AppText>
          <AppText tone="secondary" style={styles.gap}>{completed.name} is ready to review. Check its status and configuration in channel details.</AppText>
          <AppButton label="View channel" block style={styles.gap} onPress={() => navigation.replace('ChannelDetails', { channelId: completed.id, channelName: completed.name })} />
        </AppCard> : <AppCard>
          <View style={styles.fields}>
            <AppTextField label="WhatsApp Business ID" required value={wabaId} onChangeText={setWabaId} keyboardType="number-pad" autoCapitalize="none" autoComplete="off" editable={!connect.isPending} placeholder="e.g. 102938475610293" />
            <AppTextField label="Phone Number ID" required value={phoneNumberId} onChangeText={setPhoneNumberId} keyboardType="number-pad" autoCapitalize="none" autoComplete="off" editable={!connect.isPending} placeholder="e.g. 108234556789012" />
            <AppTextField label="Access Token" required value={accessToken} onChangeText={setAccessToken} secureTextEntry autoCapitalize="none" autoComplete="off" editable={!connect.isPending} placeholder="Enter your Meta access token" helpText="Sent securely to connect your channel. It is not saved on this device." />
            {!workspaceId || !canManage ? <AppText tone="error">Workspace admin or manager access is required.</AppText> : usage.isPending ? <AppText tone="secondary">Checking channel availability...</AppText> : usage.isError ? <><AppText tone="error">Could not check your channel limit.</AppText><AppButton label="Retry" variant="secondary" onPress={() => { void usage.refetch(); }} /></> : atLimit ? <AppText tone="error">Your workspace has reached its channel limit ({usage.data.channelLimit}). Free up a channel or upgrade your plan.</AppText> : null}
            {connect.isError ? <AppText tone="error">{connect.error.message}</AppText> : null}
            <AppButton label="Connect channel" block disabled={!ready} loading={connect.isPending} loadingLabel="Connecting..." onPress={() => { if (ready && !connect.isPending) connect.mutate(); }} />
          </View>
        </AppCard>}
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }, intro: { gap: spacing.md }, fields: { gap: spacing.lg }, gap: { marginTop: spacing.md } });
