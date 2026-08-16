// @ts-nocheck
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, RefreshCw, Sparkles } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showNotice } from './AppToast';
import { syncWhatsappChannelCallingSettings, updateWhatsappChannelCalling, type WhatsappCallingSetting } from '../api/channels';
import { AppToggle } from './AppToggle';
import { useTheme } from '../theme/ThemeContext';

function formatDateLabel(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function WhatsappCallingTab({ channelId, callingSetting, callDisabledReason }: { channelId: string; callingSetting?: WhatsappCallingSetting | null; callDisabledReason?: string | null }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const calling = callingSetting ?? null;
  const enabled = calling?.whatsappCallingEnabled ?? false;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['channel-details', channelId] });
  };

  const toggle = useMutation({
    mutationFn: (nextEnabled: boolean) => updateWhatsappChannelCalling(channelId, nextEnabled),
    onSuccess: () => {
      invalidate();
      showNotice('Calls updated', 'WhatsApp calling setting saved.');
    },
    onError: (error) => showNotice('Could not update calls', error instanceof Error ? error.message : undefined),
  });

  const sync = useMutation({
    mutationFn: () => syncWhatsappChannelCallingSettings(channelId),
    onSuccess: () => {
      invalidate();
      showNotice('Calls synced', 'Calling settings were refreshed from Meta.');
    },
    onError: (error) => showNotice('Sync failed', error instanceof Error ? error.message : undefined),
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <View style={[styles.callout, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
        <Sparkles color={colors.primary} size={16} />
        <Text style={[styles.calloutText, { color: colors.textSecondary }]}>User-initiated calls are supported globally. Business-initiated calls are available based on Meta capability and region support.</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Enable WhatsApp Calls</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>Allow your organization to make and receive WhatsApp Calls on this channel.</Text>
          </View>
          <AppToggle
            value={enabled}
            onValueChange={(value) => toggle.mutate(value)}
            disabled={toggle.isPending}
            accessibilityLabel="Enable WhatsApp Calls"
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.separator }]} />

        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Current state</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{callDisabledReason ?? 'The current calling capability state is controlled by Meta and mirrored here in real time.'}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>{calling?.status ?? 'UNKNOWN'}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.separator }]} />

        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Enabled at</Text>
            <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{formatDateLabel(calling?.enabledAt)}</Text>
          </View>
          <Text style={[styles.lastChecked, { color: colors.textMuted }]}>Last checked {formatDateLabel(calling?.lastCheckedAt)}</Text>
        </View>

        {calling?.lastError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{calling.lastError}</Text>
          </View>
        ) : null}

        <Pressable style={[styles.syncButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }, sync.isPending && styles.buttonDisabled]} onPress={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? <LoaderCircle color={colors.primary} size={15} /> : <RefreshCw color={colors.primary} size={15} />}
          <Text style={[styles.syncText, { color: colors.primary }]}>Sync calling settings</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  callout: { alignItems: 'flex-start', backgroundColor: '#eef3ff', borderColor: '#a9c2ff', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 14, padding: 14 },
  calloutText: { color: '#334155', flex: 1, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 20, borderWidth: 1, padding: 16 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  rowCopy: { flex: 1 },
  rowTitle: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  rowSub: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 3 },
  divider: { backgroundColor: '#e2ecfb', height: 1, marginVertical: 16 },
  badge: { backgroundColor: '#f5f8ff', borderColor: '#cfe1ff', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { color: '#315efb', fontSize: 11, fontWeight: '600' },
  lastChecked: { color: '#94a3b8', fontSize: 11, maxWidth: 140, textAlign: 'right' },
  errorBanner: { backgroundColor: '#fff1f2', borderColor: '#fecdd3', borderRadius: 12, borderWidth: 1, marginTop: 16, padding: 12 },
  errorText: { color: '#be123c', fontSize: 13, lineHeight: 19 },
  syncButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#f6f9ff', borderColor: '#d8e6fb', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 6, marginTop: 16, paddingHorizontal: 14, paddingVertical: 9 },
  buttonDisabled: { opacity: 0.6 },
  syncText: { color: '#315efb', fontSize: 13, fontWeight: '700' },
});
