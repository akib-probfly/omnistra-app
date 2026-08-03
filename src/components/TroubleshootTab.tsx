// @ts-nocheck
import { ArrowLeft, Pause, Play, RefreshCcw, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ChannelAccount, ChannelDetails, ChannelLifecycle } from '../api/channels';

const RETENTION_MS = 60 * 60 * 1000;

function formatDateLabel(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatCountdownLabel(ms: number) {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function useRemovalCountdown(purgeAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!purgeAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [purgeAt]);
  if (!purgeAt) return null;
  const purgeTime = new Date(purgeAt).getTime();
  if (Number.isNaN(purgeTime)) return null;
  const remaining = Math.max(0, purgeTime - now);
  return { label: formatCountdownLabel(remaining), progress: Math.max(0, Math.min(100, (remaining / RETENTION_MS) * 100)) };
}

export function TroubleshootTab({
  channel,
  lifecycle,
  primaryAccount,
  onRestore,
  onRemove,
  onPauseResume,
  onGoToOverview,
  isBusy,
}: {
  channel: ChannelDetails;
  lifecycle: ChannelLifecycle;
  primaryAccount?: ChannelAccount | null;
  onRestore: () => void;
  onRemove: () => void;
  onPauseResume: () => void;
  onGoToOverview?: () => void;
  isBusy: boolean;
}) {
  const countdown = useRemovalCountdown(lifecycle.purgeAt);
  const needsReconnect = ['NEEDS_ACTION', 'ERROR', 'DISCONNECTED'].includes(channel.status);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Access and diagnostics</Text>
        <Text style={styles.cardSub}>Operational controls, permissions, and technical identifiers in one place.</Text>

        <View style={styles.summaryGrid}>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Process events</Text>
            <Text style={styles.summaryValue}>{lifecycle.canProcessEvents ? 'Yes' : 'No'}</Text>
            <Text style={styles.summaryDetail}>Controls whether inbox and workflow events are processed.</Text>
          </View>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Removed</Text>
            <Text style={styles.summaryValue}>{lifecycle.isRemoved ? 'Yes' : 'No'}</Text>
            <Text style={styles.summaryDetail}>Removed channels stay in history but stop receiving new management actions.</Text>
          </View>
        </View>

        {lifecycle.isRemoved ? (
          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>Channel scheduled for deletion</Text>
            <Text style={styles.dangerText}>
              {lifecycle.purgeAt
                ? `This channel will be permanently deleted on ${formatDateLabel(lifecycle.purgeAt)}. Restore it before the timer ends.`
                : 'This channel is scheduled for permanent deletion. Restore it before the timer expires to keep all channel data.'}
            </Text>
            <View style={styles.countdownRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${countdown?.progress ?? 0}%` }]} />
              </View>
              <Text style={styles.countdownLabel}>{countdown?.label ?? ''}</Text>
            </View>
            <Pressable style={[styles.restoreButton, isBusy && styles.buttonDisabled]} onPress={onRestore} disabled={isBusy}>
              <RefreshCcw color="#fff" size={16} />
              <Text style={styles.restoreButtonText}>Restore channel</Text>
            </Pressable>
            {onGoToOverview ? (
              <Pressable style={[styles.outlineButton, { marginTop: 10 }]} onPress={onGoToOverview} disabled={isBusy}>
                <ArrowLeft color="#334155" size={16} />
                <Text style={styles.outlineButtonText}>View overview</Text>
              </Pressable>
            ) : null}
          </View>
        ) : needsReconnect ? (
          <View style={styles.needsAttention}>
            <Text style={styles.needsAttentionText}>
              This channel needs attention before it can fully manage Meta webhook processing again. Reconnect it in the web workspace to resubscribe Meta webhooks and restore the channel.
            </Text>
            <Pressable style={[styles.destructiveButton, { marginTop: 12 }, isBusy && styles.buttonDisabled]} onPress={onRemove} disabled={isBusy}>
              <Trash2 color="#fff" size={16} />
              <Text style={styles.destructiveButtonText}>Remove channel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.controls}>
            <Pressable style={[styles.primaryButton, isBusy && styles.buttonDisabled]} onPress={onPauseResume} disabled={isBusy}>
              {lifecycle.isPaused ? <Play color="#fff" size={16} /> : <Pause color="#fff" size={16} />}
              <Text style={styles.primaryButtonText}>{lifecycle.isPaused ? 'Resume channel' : 'Pause channel'}</Text>
            </Pressable>
            <Pressable style={[styles.destructiveButton, { flex: 1 }, isBusy && styles.buttonDisabled]} onPress={onRemove} disabled={isBusy}>
              <Trash2 color="#fff" size={16} />
              <Text style={styles.destructiveButtonText}>Remove channel</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Diagnostics</Text>
        <View style={styles.diag}>
          <DiagRow label="Workspace" value={channel.workspaceName} />
          <DiagRow label="Channel ID" value={channel.id} />
          <DiagRow label="WABA" value={primaryAccount?.wabaId ?? 'Not linked'} />
          <DiagRow label="Phone number" value={primaryAccount?.displayPhoneNumber ?? 'Not linked'} />
          <DiagRow label="Last updated" value={formatDateLabel(channel.updatedAt)} />
        </View>
      </View>
    </ScrollView>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.diagRow}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={styles.diagValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 20, borderWidth: 1, marginBottom: 14, padding: 16 },
  cardTitle: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  cardSub: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 4 },
  summaryGrid: { flexDirection: 'row', gap: 10, marginTop: 14 },
  summary: { backgroundColor: '#f6f9ff', borderColor: '#d8e6fb', borderRadius: 14, borderWidth: 1, flex: 1, padding: 12 },
  summaryLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  summaryValue: { color: '#0f172a', fontSize: 18, fontWeight: '800', marginTop: 4 },
  summaryDetail: { color: '#64748b', fontSize: 11, lineHeight: 16, marginTop: 2 },
  dangerCard: { backgroundColor: '#fff1f2', borderColor: '#fecdd3', borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 14 },
  dangerTitle: { color: '#be123c', fontSize: 15, fontWeight: '700' },
  dangerText: { color: '#881337', fontSize: 13, lineHeight: 19, marginTop: 4 },
  countdownRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 12 },
  progressTrack: { backgroundColor: '#fecdd3', borderRadius: 999, flex: 1, height: 8, overflow: 'hidden' },
  progressFill: { backgroundColor: '#f43f5e', borderRadius: 999, height: '100%' },
  countdownLabel: { color: '#be123c', fontSize: 12, fontWeight: '700' },
  restoreButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 14, paddingHorizontal: 14, paddingVertical: 9 },
  restoreButtonText: { color: '#fff', flexShrink: 1, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  outlineButton: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#cfe0fa', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 12 },
  outlineButtonText: { color: '#334155', flexShrink: 1, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  needsAttention: { backgroundColor: '#fff', borderColor: '#fecdd3', borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 14 },
  needsAttentionText: { color: '#475569', fontSize: 13, lineHeight: 19 },
  destructiveButton: { alignItems: 'center', backgroundColor: '#dc2626', borderRadius: 12, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9 },
  destructiveButtonText: { color: '#fff', flexShrink: 1, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  controls: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9 },
  primaryButtonText: { color: '#fff', flexShrink: 1, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  buttonDisabled: { opacity: 0.6 },
  diag: { marginTop: 6 },
  diagRow: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 10 },
  diagLabel: { color: '#64748b', fontSize: 13 },
  diagValue: { color: '#334155', flex: 1, fontSize: 13, fontWeight: '600', textAlign: 'right' },
});
