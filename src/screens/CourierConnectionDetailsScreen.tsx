import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Check, Copy, Eye, EyeOff, KeyRound, Settings2, ShieldCheck, Trash2, Webhook } from 'lucide-react-native';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { disableCourierConnection, enableCourierConnection, getCourierDeliveryFees, getCourierWebhookConfig, listCourierConnections, updateCourierConnection, type CourierConnection } from '../api/couriers';
import { IntegrationLogo } from '../components/IntegrationLogo';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useWorkspaceAccess } from '../lib/workspace-access';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppButton, AppCard, AppText, AppTextField, ScreenHeader } from '../ui';

type DetailsTab = 'overview' | 'webhook' | 'diagnostics';

export function CourierConnectionDetailsScreen() {
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const route = useRoute<RouteProp<SettingsStackParamList, 'CourierConnectionDetails' | 'CourierConnectionConfigure'>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { canManage } = useWorkspaceAccess();
  const [activeTab, setActiveTab] = useState<DetailsTab>('overview');
  const isConfigurePage = route.name === 'CourierConnectionConfigure';
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [showVerificationKey, setShowVerificationKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [providerAccountId, setProviderAccountId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [insideDhakaFee, setInsideDhakaFee] = useState('50');
  const [outsideDhakaFee, setOutsideDhakaFee] = useState('100');
  const [editError, setEditError] = useState('');

  const connectionsQuery = useQuery({ queryKey: ['courier-connections'], queryFn: listCourierConnections });
  const connection = connectionsQuery.data?.items.find((item) => item.id === route.params.connectionId) ?? null;
  const webhookQuery = useQuery({
    queryKey: ['courier-webhook-config', route.params.connectionId],
    queryFn: () => getCourierWebhookConfig(route.params.connectionId),
    enabled: Boolean(connection),
  });
  const isPathao = connection?.provider.toUpperCase() === 'PATHAO';
  const webhookUrl = webhookQuery.data?.webhookUrl ?? connection?.webhookUrl ?? '';
  const verificationKey = webhookQuery.data?.verificationKey ?? '';

  useEffect(() => {
    if (!isConfigurePage || !connection) return;
    setDisplayName(connection.displayName);
    setProviderAccountId(connection.providerAccountId ?? '');
    setApiKey('');
    setApiSecret('');
    setUsername('');
    setPassword('');
    const fees = getCourierDeliveryFees(connection.providerConfig);
    setInsideDhakaFee(String(fees.insideDhaka));
    setOutsideDhakaFee(String(fees.outsideDhaka));
    setEditError('');
    setShowApiKey(false);
    setShowApiSecret(false);
    setShowPassword(false);
  }, [connection, isConfigurePage]);

  const cacheConnection = (updated: CourierConnection) => {
    queryClient.setQueryData<{ items: CourierConnection[] }>(['courier-connections'], (current) => {
      if (!current) return { items: [updated] };
      const found = current.items.some((item) => item.id === updated.id);
      return { items: found ? current.items.map((item) => item.id === updated.id ? updated : item) : [...current.items, updated] };
    });
  };

  const handleDisconnect = () => {
    if (!connection || actionBusy || !canManage) return;
    const disconnecting = connection.status !== 'DISABLED';
    Alert.alert(disconnecting ? 'Disconnect courier?' : 'Enable courier?', disconnecting
      ? `Disconnect ${connection.displayName} from this workspace?`
      : `Enable ${connection.displayName} for this workspace?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: disconnecting ? 'Disconnect' : 'Enable',
        style: disconnecting ? 'destructive' : 'default',
        onPress: () => void updateConnectionState(disconnecting),
      },
    ]);
  };

  const copyToClipboard = async (value: string, label: string) => {
    if (!value) return;
    try {
      await Clipboard.setStringAsync(value);
      Alert.alert(`${label} copied`, 'The value is on your clipboard.');
    } catch {
      Alert.alert('Could not copy value', 'Please try again.');
    }
  };

  const updateConnectionState = async (disconnecting: boolean) => {
    if (!connection || actionBusy) return;
    setActionBusy(true);
    try {
      const updated = disconnecting
        ? await disableCourierConnection(connection.id)
        : await enableCourierConnection(connection.id);
      cacheConnection(updated);
      await queryClient.invalidateQueries({ queryKey: ['courier-connections'] });
      if (disconnecting) navigation.goBack();
    } catch (cause) {
      Alert.alert(disconnecting ? 'Could not disconnect courier' : 'Could not enable courier', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setActionBusy(false);
    }
  };

  const saveConfiguration = async () => {
    if (!connection || !canManage || saving) return;
    if (!displayName.trim()) {
      setEditError('Connection name is required.');
      return;
    }
    const insideFee = Number.parseFloat(insideDhakaFee);
    const outsideFee = Number.parseFloat(outsideDhakaFee);
    if (!Number.isFinite(insideFee) || insideFee < 0 || !Number.isFinite(outsideFee) || outsideFee < 0) {
      setEditError('Enter valid non-negative delivery fees.');
      return;
    }

    setSaving(true);
    setEditError('');
    try {
      const providerConfig: Record<string, unknown> = { ...(connection.providerConfig ?? {}) };
      if (isPathao) {
        delete providerConfig.senderName;
        delete providerConfig.senderPhone;
        providerConfig.environment = 'PRODUCTION';
      }
      providerConfig.deliveryFees = { insideDhaka: insideFee, outsideDhaka: outsideFee };
      const updated = await updateCourierConnection(connection.id, {
        displayName: displayName.trim(),
        providerConfig,
        ...(isPathao && providerAccountId.trim() ? { providerAccountId: providerAccountId.trim() } : {}),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(apiSecret.trim() ? { apiSecret: apiSecret.trim() } : {}),
        ...(isPathao && username.trim() ? { username: username.trim() } : {}),
        ...(isPathao && password.trim() ? { password: password.trim() } : {}),
      });
      cacheConnection(updated);
      await queryClient.invalidateQueries({ queryKey: ['courier-connections'] });
      if (updated.status !== 'CONNECTED') {
        setEditError(updated.lastErrorMessage ?? 'The courier could not verify these settings. Review the credentials and try again.');
        return;
      }
      navigation.goBack();
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : 'Could not save courier settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (connectionsQuery.isLoading && !connection) {
    return <View style={[styles.screen, styles.centered, { backgroundColor: colors.background }]}><ScreenHeader title="Courier account" onBack={() => navigation.goBack()} /><ActivityIndicator color={colors.primary} /><AppText tone="secondary">Loading connection details...</AppText></View>;
  }

  if (connectionsQuery.isError && !connection) {
    return <View style={[styles.screen, { backgroundColor: colors.background }]}><ScreenHeader title="Courier account" onBack={() => navigation.goBack()} /><View style={styles.notFound}><AppText variant="bodyStrong">Could not load integration</AppText><AppText variant="small" tone="secondary">{connectionsQuery.error instanceof Error ? connectionsQuery.error.message : 'Please try again.'}</AppText><AppButton label="Try again" onPress={() => void connectionsQuery.refetch()} /></View></View>;
  }

  if (!connection) {
    return <View style={[styles.screen, { backgroundColor: colors.background }]}><ScreenHeader title="Courier account" onBack={() => navigation.goBack()} /><View style={styles.notFound}><AppText variant="bodyStrong">Integration not found</AppText><AppText variant="small" tone="secondary">This courier account may have been disconnected or is no longer available.</AppText><AppButton label="Back to integrations" onPress={() => navigation.goBack()} /></View></View>;
  }

  if (isConfigurePage) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title={`Configure ${providerName(connection.provider)}`}
          subtitle={connection.displayName}
          onBack={() => navigation.goBack()}
        />
        <ScrollView contentContainerStyle={styles.editorForm} keyboardShouldPersistTaps="handled">
          <View style={styles.editorHeader}>
            <IntegrationLogo integrationId={connection.provider} size={42} />
            <View style={styles.summaryCopy}>
              <AppText variant="subheading">{isPathao ? 'Merchant credentials' : 'Account credentials'}</AppText>
              <AppText variant="small" tone="secondary">
                {isPathao
                  ? 'Update your Pathao developer credentials and merchant login.'
                  : 'Update your Steadfast merchant API credentials.'}
              </AppText>
            </View>
          </View>
          <View style={[styles.requiredBadge, { backgroundColor: colors.surfaceSecondary }]}>
            <AppText variant="tiny" tone="secondary">UPDATE</AppText>
          </View>
          <AppText variant="small" tone="secondary">
            Update the account label or replace credentials. Blank secret fields keep their current values.
          </AppText>
          <AppTextField label="Connection name" value={displayName} onChangeText={setDisplayName} placeholder="Courier account name" autoCapitalize="words" />
          {isPathao ? <AppTextField label="Store ID (optional)" value={providerAccountId} onChangeText={setProviderAccountId} placeholder="Leave blank to keep current store" /> : null}
          <AppTextField label={isPathao ? 'Client ID (optional)' : 'API key (optional)'} value={apiKey} onChangeText={setApiKey} placeholder="Leave blank to keep current value" autoCapitalize="none" secureTextEntry={!showApiKey} trailing={<Pressable onPress={() => setShowApiKey((visible) => !visible)} accessibilityLabel={showApiKey ? 'Hide API key' : 'Show API key'}>{showApiKey ? <EyeOff color={colors.textSecondary} size={17} /> : <Eye color={colors.textSecondary} size={17} />}</Pressable>} />
          <AppTextField label={isPathao ? 'Client secret (optional)' : 'Secret key (optional)'} value={apiSecret} onChangeText={setApiSecret} placeholder="Leave blank to keep current value" autoCapitalize="none" secureTextEntry={!showApiSecret} trailing={<Pressable onPress={() => setShowApiSecret((visible) => !visible)} accessibilityLabel={showApiSecret ? 'Hide secret key' : 'Show secret key'}>{showApiSecret ? <EyeOff color={colors.textSecondary} size={17} /> : <Eye color={colors.textSecondary} size={17} />}</Pressable>} />
          {isPathao ? <>
            <AppTextField label="Merchant email (optional)" value={username} onChangeText={setUsername} placeholder="Leave blank to keep current email" keyboardType="email-address" autoCapitalize="none" />
            <AppTextField label="Merchant password (optional)" value={password} onChangeText={setPassword} placeholder="Leave blank to keep current password" secureTextEntry={!showPassword} trailing={<Pressable onPress={() => setShowPassword((visible) => !visible)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff color={colors.textSecondary} size={17} /> : <Eye color={colors.textSecondary} size={17} />}</Pressable>} />
          </> : null}
          <View style={styles.formSectionHeading}>
            <AppText variant="bodyStrong">Delivery fees</AppText>
            <AppText variant="small" tone="secondary">Fees are added to the order total and selected by the recipient city.</AppText>
          </View>
          <View style={styles.feeRow}>
            <AppTextField style={styles.feeField} label="Inside Dhaka (BDT)" value={insideDhakaFee} onChangeText={setInsideDhakaFee} keyboardType="decimal-pad" />
            <AppTextField style={styles.feeField} label="Outside Dhaka (BDT)" value={outsideDhakaFee} onChangeText={setOutsideDhakaFee} keyboardType="decimal-pad" />
          </View>
          <View style={[styles.protectionCard, { backgroundColor: colors.primarySoft, borderColor: colors.cardBorder }]}>
            <ShieldCheck color={colors.primary} size={20} />
            <View style={styles.protectionCopy}>
              <AppText variant="small" style={styles.protectionTitle}>Credentials stay protected</AppText>
              <AppText variant="small" tone="secondary">
                Credentials are encrypted on the backend. The webhook URL and verification key are available in integration details.
              </AppText>
            </View>
          </View>
          {editError ? <AppText variant="small" tone="error">{editError}</AppText> : null}
          <AppButton label="Save changes" icon={Settings2} onPress={() => void saveConfiguration()} loading={saving} loadingLabel="Saving..." disabled={!canManage || !displayName.trim()} block />
        </ScrollView>
      </View>
    );
  }

  const connectedSince = new Date(connection.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const renderTab = (tab: DetailsTab, label: string, Icon: typeof Settings2) => (
    <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tabButton, { backgroundColor: activeTab === tab ? colors.primary : colors.surfaceSecondary }]} accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab }}>
      <Icon color={activeTab === tab ? colors.primaryText : colors.textSecondary} size={16} />
      <Text style={[styles.tabLabel, { color: activeTab === tab ? colors.primaryText : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Courier account" subtitle={connection.displayName} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppCard style={styles.summaryCard}>
          <View style={styles.summaryHeading}>
            <IntegrationLogo integrationId={connection.provider} size={54} />
            <View style={styles.summaryCopy}>
              <AppText variant="heading" numberOfLines={1}>{connection.displayName}</AppText>
              <AppText variant="small" tone="secondary">{providerName(connection.provider)} · Courier account</AppText>
            </View>
          </View>
          <View style={styles.summaryGrid}>
            <SummaryItem label="Provider" value={providerName(connection.provider)} />
            <SummaryItem label="Connection status" value={connection.status === 'CONNECTED' ? 'Connected' : connection.status} />
            <SummaryItem label="Credentials" value="Stored securely" />
            <SummaryItem label="Connected since" value={connectedSince} />
          </View>
          <View style={styles.summaryActions}>
            <AppButton label="Configure" icon={Settings2} variant="secondary" disabled={!canManage} onPress={() => navigation.navigate('CourierConnectionConfigure', { connectionId: connection.id })} />
            <AppButton label={connection.status === 'DISABLED' ? 'Enable' : 'Disconnect'} icon={connection.status === 'DISABLED' ? Check : Trash2} variant={connection.status === 'DISABLED' ? 'primary' : 'destructive'} disabled={!canManage || actionBusy} loading={actionBusy} onPress={handleDisconnect} />
          </View>
        </AppCard>

        <View style={styles.tabs}>{renderTab('overview', 'Overview', Settings2)}{renderTab('webhook', 'Webhook', Webhook)}{renderTab('diagnostics', 'Diagnostics', Activity)}</View>

        {activeTab === 'overview' ? (
          <AppCard style={styles.detailsCard}>
            <AppText variant="section">Connection overview</AppText>
            <AppText variant="small" tone="secondary">Review the connected courier account and its current workspace state.</AppText>
            <View style={styles.detailGrid}>
              <DetailItem label="Account name" value={connection.displayName} />
              <DetailItem label="Provider" value={providerName(connection.provider)} />
              <DetailItem label={isPathao ? 'Selected store ID' : 'Provider account ID'} value={connection.providerAccountId ?? 'Not available'} />
              {isPathao ? <DetailItem label="API environment" value={String(connection.providerConfig?.environment ?? 'Production')} /> : null}
              <DetailItem label="Last verified" value={connection.lastTestedAt ? new Date(connection.lastTestedAt).toLocaleString() : 'Not verified yet'} />
            </View>
          </AppCard>
        ) : null}

        {activeTab === 'webhook' ? (
          <View style={styles.tabContent}>
            <AppCard style={styles.detailsCard}>
              <View style={styles.sectionIconHeading}><Webhook color={colors.primary} size={18} /><AppText variant="section">Webhook configuration</AppText></View>
              <AppText variant="small" tone="secondary">{isPathao ? 'Add this URL to Pathao and use the verification key as the X-PATHAO-Signature value.' : 'Add this URL and verification key to your Steadfast webhook configuration.'}</AppText>
              <AppText variant="small" style={styles.fieldHeading}>Callback URL</AppText>
              <View style={styles.secretRow}>
                <View style={[styles.codeBox, styles.secretValue, { backgroundColor: colors.surfaceSecondary }]}><AppText variant="small" selectable>{webhookUrl || (webhookQuery.isLoading ? 'Loading webhook URL...' : 'Webhook URL unavailable')}</AppText></View>
                <Pressable disabled={!webhookUrl} onPress={() => void copyToClipboard(webhookUrl, 'Callback URL')} style={[styles.revealButton, { borderColor: colors.cardBorder }]} accessibilityLabel="Copy callback URL"><Copy color={colors.textSecondary} size={17} /></Pressable>
              </View>
              <View style={styles.sectionIconHeading}><KeyRound color={colors.warning} size={18} /><AppText variant="section">Verification key</AppText></View>
              <View style={styles.secretRow}>
                <View style={[styles.codeBox, styles.secretValue, { backgroundColor: colors.surfaceSecondary }]}><AppText variant="small" selectable>{verificationKey ? showVerificationKey ? verificationKey : '••••••••••••••••••••••••••••••••' : (webhookQuery.isLoading ? 'Loading verification key...' : 'Verification key unavailable')}</AppText></View>
                <Pressable disabled={!verificationKey} onPress={() => setShowVerificationKey((visible) => !visible)} style={[styles.revealButton, { borderColor: colors.cardBorder }]} accessibilityLabel={showVerificationKey ? 'Hide verification key' : 'Show verification key'}>{showVerificationKey ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}</Pressable>
                <Pressable disabled={!verificationKey} onPress={() => void copyToClipboard(verificationKey, 'Verification key')} style={[styles.revealButton, { borderColor: colors.cardBorder }]} accessibilityLabel="Copy verification key"><Copy color={colors.textSecondary} size={17} /></Pressable>
              </View>
              <AppText variant="small" tone="secondary">This key is generated securely for this courier account. Keep it private and use it as the {isPathao ? 'X-PATHAO-Signature header value in Pathao.' : 'Bearer token in Steadfast.'}</AppText>
              <View style={styles.detailGrid}>
                <DetailItem label="Authentication" value={connection.credentials.hasWebhookAuthToken ? (isPathao ? 'X-PATHAO-Signature configured' : 'Bearer token configured') : 'Needs attention'} />
                <DetailItem label="Delivery status" value="Ready to receive updates" />
              </View>
            </AppCard>
            {webhookQuery.isError ? <View style={styles.retryRow}><AppText tone="error" variant="small">Could not load webhook configuration.</AppText><AppButton label="Retry" variant="secondary" onPress={() => void webhookQuery.refetch()} /></View> : null}
          </View>
        ) : null}

        {activeTab === 'diagnostics' ? (
          <AppCard style={styles.detailsCard}>
            <View style={styles.sectionIconHeading}><Activity color={colors.primary} size={18} /><AppText variant="section">Access and diagnostics</AppText></View>
            <AppText variant="small" tone="secondary">Operational details and credential presence without exposing secret values.</AppText>
            <View style={styles.detailGrid}>
              <DiagnosticItem label="API key" present={connection.credentials.hasApiKey} />
              <DiagnosticItem label="Secret key" present={connection.credentials.hasApiSecret} />
              {isPathao ? <><DiagnosticItem label="Merchant email" present={connection.credentials.hasUsername} /><DiagnosticItem label="Merchant password" present={connection.credentials.hasPassword} /></> : null}
              <DiagnosticItem label="Verification key" present={connection.credentials.hasWebhookAuthToken} />
              <DiagnosticItem label="Last connection error" present={!connection.lastErrorMessage} value={connection.lastErrorMessage ?? 'No errors recorded'} />
            </View>
          </AppCard>
        ) : null}
      </ScrollView>

    </View>
  );
}

function providerName(provider: string) {
  if (provider.toUpperCase() === 'PATHAO') return 'Pathao Courier';
  if (provider.toUpperCase() === 'STEADFAST') return 'Steadfast Courier';
  return provider;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return <View style={[styles.summaryItem, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}><AppText variant="tiny" tone="secondary">{label.toUpperCase()}</AppText><AppText variant="small" style={styles.summaryValue}>{value}</AppText></View>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return <View style={[styles.detailItem, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}><AppText variant="tiny" tone="secondary">{label.toUpperCase()}</AppText><AppText variant="small" style={styles.detailValue}>{value}</AppText></View>;
}

function DiagnosticItem({ label, present, value }: { label: string; present: boolean; value?: string }) {
  const { colors } = useTheme();
  return <View style={[styles.diagnosticItem, { backgroundColor: present ? colors.successSoft : colors.warningSoft, borderColor: colors.cardBorder }]}><View style={styles.diagnosticHeading}><AppText variant="small" style={{ flex: 1 }}>{label}</AppText><AppText variant="tiny" style={{ color: present ? colors.success : colors.warning }}>{present ? 'PRESENT' : 'MISSING'}</AppText></View><AppText variant="small" tone="secondary">{value ?? (present ? 'Stored securely' : 'Not configured')}</AppText></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { alignItems: 'center', gap: spacing.md, justifyContent: 'flex-start' },
  content: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxxl },
  notFound: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xl },
  retryRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryCard: { gap: spacing.md },
  summaryHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  summaryCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryItem: { borderRadius: radius.md, borderWidth: 1, flexBasis: '48%', flexGrow: 1, gap: spacing.xs, minWidth: 140, padding: spacing.md },
  summaryValue: { fontWeight: fontWeight.semibold },
  summaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tabButton: { alignItems: 'center', borderRadius: radius.md, flexGrow: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 42, paddingHorizontal: spacing.md },
  tabLabel: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  tabContent: { gap: spacing.md },
  detailsCard: { gap: spacing.md },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailItem: { borderRadius: radius.md, borderWidth: 1, flexBasis: '48%', flexGrow: 1, gap: spacing.xs, minWidth: 140, padding: spacing.md },
  detailValue: { fontWeight: fontWeight.semibold },
  sectionIconHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  fieldHeading: { fontWeight: fontWeight.semibold, marginTop: spacing.xs },
  codeBox: { borderRadius: radius.md, padding: spacing.md },
  secretRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  secretValue: { flex: 1 },
  revealButton: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  diagnosticItem: { borderRadius: radius.md, borderWidth: 1, flexBasis: '48%', flexGrow: 1, gap: spacing.xs, minWidth: 140, padding: spacing.md },
  diagnosticHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  editorHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  editorForm: { gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxxl },
  requiredBadge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  formSectionHeading: { gap: spacing.xs },
  protectionCard: { alignItems: 'flex-start', borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  protectionCopy: { flex: 1, gap: spacing.xs },
  protectionTitle: { fontWeight: fontWeight.semibold },
  feeRow: { flexDirection: 'row', gap: spacing.sm },
  feeField: { flex: 1, minWidth: 0 },
});
