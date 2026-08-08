// @ts-nocheck
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchChannelDetails,
  fetchWhatsappBusinessProfile,
  pauseChannel,
  removeChannel,
  restoreChannel,
  resumeChannel,
  syncWhatsappBusinessProfile,
  updateWhatsappBusinessProfile,
  type ChannelDetails,
} from '../api/channels';
import { ChannelLogo } from '../components/ChannelLogo';
import { QuickAutomationTab } from '../components/QuickAutomationTab';
import { TroubleshootTab } from '../components/TroubleshootTab';
import { WhatsappCallingTab } from '../components/WhatsappCallingTab';
import { WhatsappTemplatesTab } from '../components/WhatsappTemplatesTab';
import type { ChannelsStackParamList } from '../navigation/ChannelsStack';

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  CONNECTED: { bg: '#e8fbf3', fg: '#047857' },
  PENDING: { bg: '#fff7df', fg: '#b45309' },
  NEEDS_ACTION: { bg: '#ffe4e6', fg: '#be123c' },
  ERROR: { bg: '#ffe4e6', fg: '#be123c' },
  DISCONNECTED: { bg: '#f1f5f9', fg: '#64748b' },
};

const WHATSAPP_BUSINESS_VERTICAL_OPTIONS = [
  { value: 'ALCOHOL', label: 'Alcoholic Beverages' },
  { value: 'APPAREL', label: 'Clothing and Apparel' },
  { value: 'AUTO', label: 'Automotive' },
  { value: 'BEAUTY', label: 'Beauty, Spa and Salon' },
  { value: 'EDU', label: 'Education' },
  { value: 'ENTERTAIN', label: 'Entertainment' },
  { value: 'EVENT_PLAN', label: 'Event Planning and Service' },
  { value: 'FINANCE', label: 'Finance and Banking' },
  { value: 'GOVT', label: 'Public Service' },
  { value: 'GROCERY', label: 'Food and Grocery' },
  { value: 'HEALTH', label: 'Medical and Health' },
  { value: 'HOTEL', label: 'Hotel and Lodging' },
  { value: 'NONPROFIT', label: 'Non-profit' },
  { value: 'ONLINE_GAMBLING', label: 'Online Gambling & Gaming' },
  { value: 'OTC_DRUGS', label: 'Over-the-Counter Drugs' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PHYSICAL_GAMBLING', label: 'Non-Online Gambling & Gaming' },
  { value: 'PROF_SERVICES', label: 'Professional Services' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'RETAIL', label: 'Shopping and Retail' },
  { value: 'TRAVEL', label: 'Travel and Transportation' },
];

function formatDateLabel(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function ChannelDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ChannelsStackParamList, 'ChannelDetails'>>();
  const queryClient = useQueryClient();
  const channelId = route.params.channelId;
  const [tab, setTab] = useState<string>('overview');

  const details = useQuery({
    queryKey: ['channel-details', channelId],
    queryFn: () => fetchChannelDetails(channelId),
    staleTime: 30000,
  });
  const profile = useQuery({
    queryKey: ['channel-profile', channelId],
    queryFn: () => fetchWhatsappBusinessProfile(channelId),
    staleTime: 30000,
  });

  const channel: ChannelDetails | undefined = details.data;
  const lifecycle = channel?.lifecycle ?? {
    isPaused: false,
    pausedAt: null,
    pauseReason: null,
    isRemoved: false,
    removedAt: null,
    removeReason: null,
    purgeAt: null,
    canProcessEvents: channel?.status === 'CONNECTED',
  };
  const primaryAccount = channel?.accounts?.[0] ?? null;
  const profileData = profile.data ?? null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['channel-details', channelId], refetchType: 'active' });
    queryClient.invalidateQueries({ queryKey: ['channels'], refetchType: 'active' });
  };

  const pause = useMutation({ mutationFn: () => pauseChannel(channelId), onSuccess: () => { Alert.alert('Channel paused', 'App-side event handling is now turned off.'); invalidate(); } });
  const resume = useMutation({ mutationFn: () => resumeChannel(channelId), onSuccess: () => { Alert.alert('Channel resumed', 'Event handling has been re-enabled.'); invalidate(); } });
  const remove = useMutation({
    mutationFn: () => removeChannel(channelId),
    onSuccess: () => { Alert.alert('Removal scheduled', 'This channel will be permanently deleted in about 1 hour unless you restore it.'); invalidate(); },
  });
  const restore = useMutation({ mutationFn: () => restoreChannel(channelId), onSuccess: () => { Alert.alert('Channel restored', 'The pending deletion has been canceled.'); invalidate(); } });
  const sync = useMutation({
    mutationFn: () => syncWhatsappBusinessProfile(channelId),
    onSuccess: () => { profile.refetch(); Alert.alert('Profile synced', 'The business profile was refreshed from WhatsApp.'); },
  });

  const [draft, setDraft] = useState({ about: '', address: '', description: '', email: '', websites: '', vertical: '' });
  const [loaded, setLoaded] = useState(false);
  if (profileData && !loaded) {
    setDraft({
      about: profileData.about ?? '',
      address: profileData.address ?? '',
      description: profileData.description ?? '',
      email: profileData.email ?? '',
      websites: (profileData.websites ?? []).join('\n'),
      vertical: WHATSAPP_BUSINESS_VERTICAL_OPTIONS.some((option) => option.value === profileData.vertical) ? profileData.vertical ?? '' : profileData.vertical ? 'OTHER' : '',
    });
    setLoaded(true);
  }
  const save = useMutation({
    mutationFn: () => updateWhatsappBusinessProfile(channelId, {
      about: draft.about.trim() ? draft.about.trim() : null,
      address: draft.address.trim() ? draft.address.trim() : null,
      description: draft.description.trim() ? draft.description.trim() : null,
      email: draft.email.trim() ? draft.email.trim() : null,
      vertical: draft.vertical.trim() ? draft.vertical.trim() : null,
      websites: draft.websites.split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
    }),
    onSuccess: () => { profile.refetch(); Alert.alert('Profile saved', 'Your WhatsApp business profile was updated.'); },
  });

  const [verticalPicker, setVerticalPicker] = useState(false);
  const isBusy = pause.isPending || resume.isPending || remove.isPending || restore.isPending || sync.isPending || save.isPending;
  const statusTone = STATUS_TONE[channel?.status ?? 'PENDING'] ?? STATUS_TONE.PENDING;

  const confirmRemove = () => {
    Alert.alert('Remove this channel?', 'This will schedule the channel for permanent deletion in about 1 hour. You can restore it before then.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() }]);
  };
  const confirmPauseOrResume = (action: 'pause' | 'resume') => {
    Alert.alert(action === 'pause' ? 'Pause this channel?' : 'Resume this channel?', action === 'pause' ? 'Pausing stops app-side event handling while keeping the records intact.' : 'Resuming re-enables app-side event handling.', [{ text: 'Cancel', style: 'cancel' }, { text: action === 'pause' ? 'Pause' : 'Resume', onPress: () => (action === 'pause' ? pause.mutate() : resume.mutate()) }]);
  };

  if (details.isLoading) {
    return <View style={styles.screen}><ActivityIndicator color="#2563eb" size="large" style={{ marginTop: 80 }} /></View>;
  }
  if (details.isError || !channel) {
    return (
      <View style={styles.screen}>
        <HeaderBar insets={insets} onBack={() => navigation.goBack()} />
        <View style={{ alignItems: 'center', padding: 32, marginTop: 40 }}>
          <Text style={styles.msgTitle}>Could not load channel</Text>
          <Text style={styles.msgText}>{details.error instanceof Error ? details.error.message : 'Please try again or return to the list.'}</Text>
          <Pressable style={[styles.primaryButton, { alignSelf: 'center', marginTop: 20, paddingHorizontal: 18, paddingVertical: 9 }]} onPress={() => details.refetch()}><RefreshCw color="#fff" size={14} /><Text style={[styles.primaryButtonText, { fontSize: 13 }]}>Retry</Text></Pressable>
        </View>
      </View>
    );
  }

  const isMessenger = channel.type === 'MESSENGER';
  const isWhatsapp = channel.type === 'WHATSAPP';
  const tabs = isMessenger
    ? [{ key: 'overview', label: 'Configuration' }, { key: 'automation', label: 'Quick Automation' }, { key: 'access', label: 'Troubleshoot' }]
    : isWhatsapp
      ? [{ key: 'overview', label: 'Configuration' }, { key: 'templates', label: 'Templates' }, { key: 'business', label: 'Profile' }, { key: 'calling', label: 'Calls' }, { key: 'automation', label: 'Quick Automation' }, { key: 'access', label: 'Troubleshoot' }]
      : [{ key: 'overview', label: 'Configuration' }, { key: 'access', label: 'Troubleshoot' }];

  const renderOverview = () => {
    if (isMessenger) {
      const config = channel.configuration as { pageId?: string | null; pageName?: string | null; businessAccountId?: string | null; webhookSubscriptionStatus?: string | null; lastWebhookError?: string | null } | null;
      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
          <View style={styles.titleCard}>
            <ChannelLogo type={channel.type} box={52} glyph={26} radius={18} />
            <View style={styles.titleCopy}>
              <Text style={styles.channelName}>{channel.name}</Text>
              <View style={styles.badges}>
                <View style={[styles.badge, { backgroundColor: statusTone.bg }]}><Text style={[styles.badgeText, { color: statusTone.fg }]}>{channel.status}</Text></View>
                {lifecycle.isPaused ? <View style={[styles.badge, { backgroundColor: '#fff7df' }]}><Text style={[styles.badgeText, { color: '#b45309' }]}>Paused</Text></View> : null}
              </View>
            </View>
          </View>

          {lifecycle.isRemoved ? (
            <View style={styles.dangerCard}>
              <Text style={styles.dangerTitle}>Removal scheduled</Text>
              <Text style={styles.dangerText}>This channel is pending permanent deletion. {lifecycle.removeReason ? `Reason: ${lifecycle.removeReason}` : ''}</Text>
              <Pressable style={[styles.primaryButton, { marginTop: 12 }]} onPress={() => restore.mutate()}><RotateCcw color="#fff" size={15} /><Text style={styles.primaryButtonText}>Restore channel</Text></Pressable>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Overview</Text>
            <View style={styles.grid}>
              <Summary title="Page ID" value={config?.pageId ?? 'Not linked'} detail="Meta page identifier" />
              <Summary title="Webhook" value={config?.webhookSubscriptionStatus ?? 'UNKNOWN'} detail={config?.lastWebhookError ?? 'No recent webhook errors'} />
              <Summary title="Workspace" value={channel.workspaceName ?? '—'} detail="Parent workspace" />
              <Summary title="Inbox status" value={lifecycle.canProcessEvents ? 'Active' : 'Stopped'} detail={formatDateLabel(channel.updatedAt)} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Connection details</Text>
            <Field label="Current state" value={channel.status} />
            <Field label="Page name" value={config?.pageName ?? 'Not linked'} />
            <Field label="Page ID" value={config?.pageId ?? 'Not linked'} />
            <Field label="Webhook error" value={config?.lastWebhookError ?? 'None'} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Workspace snapshot</Text>
            <Field label="Workspace" value={channel.workspaceName ?? '—'} />
            <Field label="Channel type" value={channel.type} />
            <Field label="Accounts" value={String(channel.accounts.length)} />
            <Field label="Updated" value={formatDateLabel(channel.updatedAt)} />
            <Field label="Event processing" value={lifecycle.canProcessEvents ? 'Active' : 'Stopped'} />
          </View>
        </ScrollView>
      );
    }

    const config = channel.configuration as { displayPhoneNumber?: string | null; phoneNumberId?: string | null } | null;
    const templateCounts = channel.templateCounts;
    const callingSetting = channel.callBusinessCallingSetting;
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.titleCard}>
          <ChannelLogo type={channel.type} box={52} glyph={26} radius={18} />
          <View style={styles.titleCopy}>
            <Text style={styles.channelName}>{channel.name}</Text>
            <View style={styles.badges}>
              <View style={[styles.badge, { backgroundColor: statusTone.bg }]}><Text style={[styles.badgeText, { color: statusTone.fg }]}>{channel.status}</Text></View>
              {lifecycle.isPaused ? <View style={[styles.badge, { backgroundColor: '#fff7df' }]}><Text style={[styles.badgeText, { color: '#b45309' }]}>Paused</Text></View> : null}
              {lifecycle.isRemoved ? <View style={[styles.badge, { backgroundColor: '#ffe4e6' }]}><Text style={[styles.badgeText, { color: '#be123c' }]}>Removed</Text></View> : null}
            </View>
          </View>
        </View>

        {lifecycle.isRemoved ? (
          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>Removal scheduled</Text>
            <Text style={styles.dangerText}>This channel is pending permanent deletion. {lifecycle.removeReason ? `Reason: ${lifecycle.removeReason}` : ''}</Text>
            <Pressable style={[styles.primaryButton, { marginTop: 12 }]} onPress={() => restore.mutate()}><RotateCcw color="#fff" size={15} /><Text style={styles.primaryButtonText}>Restore channel</Text></Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Overview</Text>
          <View style={styles.grid}>
            <Summary title="Phone line" value={config?.displayPhoneNumber ?? primaryAccount?.displayPhoneNumber ?? 'Not linked'} detail={config?.phoneNumberId ?? primaryAccount?.phoneNumberId ?? 'Phone number id unavailable'} />
            <Summary title="Templates" value={templateCounts ? String(templateCounts.total) : '—'} detail={templateCounts ? `${templateCounts.approved} approved · ${templateCounts.pending} pending` : 'No template counts'} />
            <Summary title="Webhooks" value={primaryAccount?.webhookStatus ?? 'UNKNOWN'} detail={channel.lastWebhookError ?? primaryAccount?.lastWebhookError ?? 'No recent webhook errors'} />
            <Summary title="Business calling" value={callingSetting?.status ?? 'Not configured'} detail={callingSetting?.lastError ?? 'Managed by Meta'} />
            <Summary title="Event processing" value={lifecycle.canProcessEvents ? 'Active' : 'Stopped'} detail={formatDateLabel(channel.updatedAt)} />
            <Summary title="Messages 24h" value={channel.messagesLast24h != null ? String(channel.messagesLast24h) : '—'} detail={channel.type} />
          </View>
          <View style={styles.overviewActions}>
            {isWhatsapp ? <Pressable style={[styles.primaryButton, { flex: 1, paddingHorizontal: 14, paddingVertical: 9 }]} onPress={() => setTab('templates')}><FileText color="#fff" size={14} /><Text style={styles.primaryButtonText}>Open templates</Text></Pressable> : null}
            <Pressable style={[styles.outlineButton, { flex: 1, paddingHorizontal: 14, paddingVertical: 9 }]} onPress={() => details.refetch()}><RefreshCw color="#2563eb" size={14} /><Text style={styles.outlineButtonText}>Refresh details</Text></Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Business information</Text>
          <Text style={styles.cardSub}>Phone numbers and Meta-linked account details for this WhatsApp channel.</Text>
          {channel.accounts.length > 0 ? (
            channel.accounts.map((account) => (
              <View key={account.id} style={styles.account}>
                <View style={styles.accountHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accountName} numberOfLines={1}>{account.displayPhoneNumber ?? 'Linked WhatsApp account'}</Text>
                    <Text style={styles.accountMeta}>{account.provider}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: (STATUS_TONE[account.webhookStatus] ?? STATUS_TONE.PENDING).bg }]}><Text style={[styles.badgeText, { color: (STATUS_TONE[account.webhookStatus] ?? STATUS_TONE.PENDING).fg }]}>Webhook {account.webhookStatus}</Text></View>
                </View>
                <Field label="WABA ID" value={account.wabaId ?? 'Not linked'} />
                <Field label="Phone number ID" value={account.phoneNumberId ?? 'Not linked'} />
                <Field label="Connected" value={formatDateLabel(account.connectedAt)} />
                <Field label="Disconnected" value={formatDateLabel(account.disconnectedAt)} />
              </View>
            ))
          ) : (
            <Text style={styles.emptyField}>No business account is linked to this channel.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Workspace snapshot</Text>
          <Text style={styles.cardSub}>Channel facts and quick controls.</Text>
          <Field label="Workspace" value={channel.workspaceName ?? '—'} />
          <Field label="Channel type" value={channel.type} />
          <Field label="Status" value={channel.status} />
          <Field label="Accounts" value={String(channel.accounts.length)} />
          <Field label="Updated" value={formatDateLabel(channel.updatedAt)} />
          <Field label="Event processing" value={lifecycle.canProcessEvents ? 'Active' : 'Stopped'} />
        </View>
      </ScrollView>
    );
  };

  const renderBusiness = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>WhatsApp Business profile</Text>
          <Pressable style={styles.syncButton} onPress={() => sync.mutate()} disabled={isBusy}><RefreshCw color="#315efb" size={15} /><Text style={styles.syncText}>Sync</Text></Pressable>
        </View>
        <Text style={styles.cardSub}>The public profile of your WhatsApp Business API account.</Text>

        <FieldEdit label="About" value={draft.about} onChange={(text) => setDraft({ ...draft, about: text })} placeholder="What your business is about" multiline />
        <FieldEdit label="Email" value={draft.email} onChange={(text) => setDraft({ ...draft, email: text })} placeholder="business@email.com" keyboardType="email-address" />
        <FieldEdit label="Address" value={draft.address} onChange={(text) => setDraft({ ...draft, address: text })} placeholder="Add address" />
        <FieldEdit label="Website" value={draft.websites} onChange={(text) => setDraft({ ...draft, websites: text })} placeholder="https:// (one per line)" />
        <FieldEdit label="Description" value={draft.description} onChange={(text) => setDraft({ ...draft, description: text })} placeholder="Add description" multiline />

        <Text style={styles.fieldLabel}>Category</Text>
        <Pressable style={styles.select} onPress={() => setVerticalPicker(true)}>
          <Text style={draft.vertical ? styles.selectText : styles.selectPlaceholder}>{WHATSAPP_BUSINESS_VERTICAL_OPTIONS.find((option) => option.value === draft.vertical)?.label ?? 'Select category'}</Text>
        </Pressable>

        <Pressable style={[styles.primaryButton, { marginTop: 18 }]} onPress={() => save.mutate()} disabled={isBusy}>
          {save.isPending ? <LoaderCircle color="#fff" size={16} /> : null}
          <Text style={styles.primaryButtonText}>Save profile</Text>
        </Pressable>
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <HeaderBar
        insets={insets}
        onBack={() => navigation.goBack()}
        onRefresh={() => details.refetch()}
        refreshing={details.isFetching && !details.isLoading}
      />

      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent}>
          {tabs.map((item) => (
            <TabButton key={item.key} label={item.label} active={tab === item.key} onPress={() => setTab(item.key)} />
          ))}
        </ScrollView>
      </View>

      <View style={styles.tabContent}>
        {tab === 'overview' ? renderOverview() : null}
        {tab === 'business' ? renderBusiness() : null}
        {tab === 'templates' ? <WhatsappTemplatesTab channelId={channelId} /> : null}
        {tab === 'calling' ? <WhatsappCallingTab channelId={channelId} callingSetting={channel.callBusinessCallingSetting} callDisabledReason={channel.capabilities?.callDisabledReason} /> : null}
        {tab === 'automation' ? <QuickAutomationTab channelId={channelId} channelType={channel.type} /> : null}
        {tab === 'access' ? (
          <TroubleshootTab
            channel={channel}
            lifecycle={lifecycle}
            primaryAccount={primaryAccount}
            onRestore={() => restore.mutate()}
            onRemove={confirmRemove}
            onPauseResume={() => confirmPauseOrResume(lifecycle.isPaused ? 'resume' : 'pause')}
            onGoToOverview={() => setTab('overview')}
            isBusy={isBusy}
          />
        ) : null}
      </View>

      <Modal visible={verticalPicker} transparent animationType="fade" onRequestClose={() => setVerticalPicker(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setVerticalPicker(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select category</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {WHATSAPP_BUSINESS_VERTICAL_OPTIONS.map((option) => (
                <Pressable key={option.value} style={styles.modalRow} onPress={() => { setDraft({ ...draft, vertical: option.value }); setVerticalPicker(false); }}>
                  <Text style={draft.vertical === option.value ? styles.modalRowActive : styles.modalRowText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function HeaderBar({
  insets,
  onBack,
  onRefresh,
  refreshing = false,
}: {
  insets: { top: number };
  onBack: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!refreshing) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [refreshing, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={onBack} hitSlop={10}><ArrowLeft color="#334155" size={23} /></Pressable>
      <Text style={styles.headerTitle}>Channel details</Text>
      <Pressable onPress={onRefresh} hitSlop={10} disabled={refreshing} style={refreshing ? { opacity: 0.7 } : undefined}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <RefreshCw color="#334155" size={20} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Summary({ title, value, detail }: { title: string; value: string; detail?: string | null }) {
  return <View style={styles.summary}><Text style={styles.summaryTitle}>{title}</Text><Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>{detail ? <Text style={styles.summaryDetail} numberOfLines={2}>{detail}</Text> : null}</View>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value}</Text></View>;
}

function FieldEdit({ label, value, onChange, placeholder, multiline = false, keyboardType }: { label: string; value: string; onChange: (text: string) => void; placeholder: string; multiline?: boolean; keyboardType?: 'email-address' }) {
  return (
    <View style={styles.fieldEdit}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#94a3b8" multiline={multiline} numberOfLines={multiline ? 4 : 1} keyboardType={keyboardType ?? 'default'} style={multiline ? styles.inputMultiline : styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#eef4fb', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#dce8f7', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12, paddingHorizontal: 16 },
  headerTitle: { color: '#0f172a', fontSize: 17, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8 },
  tabBar: { backgroundColor: '#fff', borderBottomColor: '#dce8f7', borderBottomWidth: 1, paddingVertical: 10, paddingHorizontal: 12 },
  tabBarContent: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  tabContent: { flex: 1 },
  tab: { alignItems: 'center', borderRadius: 12, flexShrink: 0, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9 },
  tabActive: { backgroundColor: '#e7efff' },
  tabText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#2563eb', fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  titleCard: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 20, borderWidth: 1, flexDirection: 'row', padding: 16 },
  titleCopy: { flex: 1, marginLeft: 14 },
  channelName: { color: '#0f172a', fontSize: 19, fontWeight: '800' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 20, borderWidth: 1, marginTop: 16, padding: 16 },
  cardHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  cardSub: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  summary: { backgroundColor: '#f6f9ff', borderColor: '#d8e6fb', borderRadius: 14, borderWidth: 1, padding: 12, width: '48%' },
  summaryTitle: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  summaryValue: { color: '#0f172a', fontSize: 16, fontWeight: '800', marginTop: 4 },
  summaryDetail: { color: '#64748b', fontSize: 11, lineHeight: 16, marginTop: 2 },
  overviewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  account: { backgroundColor: '#f6f9ff', borderColor: '#d8e6fb', borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 14 },
  accountHead: { alignItems: 'flex-start', borderBottomColor: '#d8e6fb', borderBottomWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingBottom: 12 },
  accountName: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  accountMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  field: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 12 },
  fieldLabel: { color: '#64748b', fontSize: 12, marginTop: 12 },
  fieldValue: { color: '#334155', flex: 1, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  emptyField: { color: '#64748b', fontSize: 13, marginTop: 12 },
  dangerCard: { backgroundColor: '#fff1f2', borderColor: '#fecdd3', borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 14 },
  dangerTitle: { color: '#be123c', fontSize: 15, fontWeight: '700' },
  dangerText: { color: '#881337', fontSize: 13, lineHeight: 19, marginTop: 4 },
  primaryButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 14, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 12 },
  primaryButtonText: { color: '#fff', flexShrink: 1, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  outlineButton: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#cfe0fa', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  outlineButtonText: { color: '#2563eb', flexShrink: 1, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  mb: { marginBottom: 10 },
  syncButton: { alignItems: 'center', backgroundColor: '#f6f9ff', borderColor: '#d8e6fb', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 7 },
  syncText: { color: '#315efb', fontSize: 13, fontWeight: '700' },
  fieldEdit: { marginTop: 14 },
  input: { backgroundColor: '#f8fbff', borderColor: '#cfe1ff', borderRadius: 14, borderWidth: 1, color: '#0f172a', fontSize: 14, height: 46, paddingHorizontal: 14, marginTop: 6 },
  inputMultiline: { backgroundColor: '#f8fbff', borderColor: '#cfe1ff', borderRadius: 14, borderWidth: 1, color: '#0f172a', fontSize: 14, minHeight: 96, paddingHorizontal: 14, paddingVertical: 12, marginTop: 6, textAlignVertical: 'top' },
  select: { backgroundColor: '#f8fbff', borderColor: '#cfe1ff', borderRadius: 14, borderWidth: 1, height: 46, justifyContent: 'center', paddingHorizontal: 14, marginTop: 6 },
  selectText: { color: '#0f172a', fontSize: 14 },
  selectPlaceholder: { color: '#94a3b8', fontSize: 14 },
  modalBackdrop: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'center', padding: 24 },
  modalSheet: { backgroundColor: '#fff', borderRadius: 22, padding: 18 },
  modalTitle: { color: '#0f172a', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  modalRow: { paddingVertical: 12 },
  modalRowText: { color: '#334155', fontSize: 14 },
  modalRowActive: { color: '#2563eb', fontSize: 14, fontWeight: '700' },
  msgTitle: { color: '#0f172a', fontSize: 17, fontWeight: '700' },
  msgText: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
});
