import { Clock3, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConversationCallSession } from '../api/inbox';
import { ChannelLogo } from './ChannelLogo';
import { AuthenticatedImage } from './AuthenticatedImage';
import {
  formatCallDurationLabel,
  getCallSessionHistoryPresentation,
  getNormalizedCallSessionOutcome,
  isCallSessionTerminal,
} from '../lib/inbox-utils';

function getInitials(value?: string | null) {
  const parts = (value ?? '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]);
  return (parts.join('') || '?').toUpperCase();
}

function getCallDisplayName(session: ConversationCallSession) {
  return (
    session.conversation?.contact.displayName
    ?? session.recipientDisplayName
    ?? session.conversation?.contact.primaryPhone
    ?? session.recipientIdentityValue
    ?? session.conversation?.channel.channelName
    ?? 'Unknown caller'
  );
}

function getCallActivityAt(session: ConversationCallSession) {
  return (
    session.endedAt
    ?? session.permissionRespondedAt
    ?? session.connectedAt
    ?? session.startedAt
    ?? session.requestedPermissionAt
    ?? session.updatedAt
    ?? session.createdAt
  );
}

function formatRelativeTime(value?: string | null) {
  if (!value) return '';
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.max(1, Math.round(minutes / 60));
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function getCallOutcomeLabel(session: ConversationCallSession) {
  const presentation = getCallSessionHistoryPresentation(session);
  const normalizedStatus = getNormalizedCallSessionOutcome(session.status, session.direction);

  if (normalizedStatus === 'CONNECTED' || normalizedStatus === 'ENDED') {
    return formatCallDurationLabel(session.durationSeconds) ?? presentation.title;
  }
  if (normalizedStatus === 'MISSED') return 'No answer';
  if (normalizedStatus === 'REJECTED') return 'Declined';
  if (normalizedStatus === 'FAILED') return 'Failed';
  if (normalizedStatus === 'CANCELLED') return 'Cancelled';
  if (session.status === 'PERMISSION_REQUESTED') {
    if (session.permissionStatus === 'GRANTED') return 'Permission granted';
    if (session.permissionStatus === 'DENIED') return 'Permission declined';
    return 'Waiting for approval';
  }
  return presentation.title;
}

function getStatusTone(normalizedStatus: string) {
  if (normalizedStatus === 'MISSED') return { bg: '#fff1f2', text: '#e11d48' };
  if (normalizedStatus === 'REJECTED' || normalizedStatus === 'CANCELLED' || normalizedStatus === 'FAILED') {
    return { bg: '#fff7ed', text: '#c2410c' };
  }
  if (normalizedStatus === 'CONNECTED' || normalizedStatus === 'ENDED') {
    return { bg: '#ecfdf5', text: '#059669' };
  }
  return { bg: '#eff6ff', text: '#2563eb' };
}

export function CallFeedItem({ session, onPress }: { session: ConversationCallSession; onPress: () => void }) {
  const displayName = getCallDisplayName(session);
  const activityAt = getCallActivityAt(session);
  const normalizedStatus = getNormalizedCallSessionOutcome(session.status, session.direction);
  const statusLabel = getCallOutcomeLabel(session);
  const statusTone = getStatusTone(normalizedStatus);
  const directionLabel = session.direction === 'INBOUND' ? 'Incoming' : 'Outgoing';
  const channelType = session.conversation?.channel.channelType;
  const subtitle = session.conversation?.channel.channelName
    ?? session.conversation?.channel.displayPhoneNumber
    ?? session.recipientIdentityValue;
  const isMissed = isCallSessionTerminal(session.status) && normalizedStatus === 'MISSED';
  const durationLabel = formatCallDurationLabel(session.durationSeconds);
  const showDuration = session.status === 'CONNECTED' || (session.status === 'ENDED' && session.durationSeconds !== null);

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.avatarWrap}>
        {session.conversation?.contact.avatarUrl ? (
          <AuthenticatedImage url={session.conversation.contact.avatarUrl} resizeMode="cover" style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
          </View>
        )}
        {channelType ? (
          <View style={styles.channelBadge}>
            <ChannelLogo type={channelType} box={18} glyph={11} radius={9} />
          </View>
        ) : null}
      </View>

      <View style={styles.copy}>
        <View style={styles.topLine}>
          <Text style={[styles.name, isMissed && styles.nameMissed]} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.time}>{formatRelativeTime(activityAt)}</Text>
        </View>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        <View style={styles.chips}>
          <View style={[styles.chip, session.direction === 'INBOUND' ? styles.chipIncoming : styles.chipOutgoing]}>
            {session.direction === 'INBOUND'
              ? <PhoneIncoming color="#047857" size={12} />
              : <PhoneOutgoing color="#1d4ed8" size={12} />}
            <Text style={[styles.chipText, session.direction === 'INBOUND' ? styles.chipTextIncoming : styles.chipTextOutgoing]}>
              {directionLabel}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: statusTone.bg }]}>
            {normalizedStatus === 'MISSED'
              ? <PhoneMissed color={statusTone.text} size={12} />
              : normalizedStatus === 'REJECTED' || normalizedStatus === 'CANCELLED'
                ? <PhoneOff color={statusTone.text} size={12} />
                : <Phone color={statusTone.text} size={12} />}
            <Text style={[styles.chipText, { color: statusTone.text }]}>{statusLabel}</Text>
          </View>
          {showDuration ? (
            <View style={[styles.chip, styles.chipDuration]}>
              <Clock3 color="#475569" size={12} />
              <Text style={[styles.chipText, styles.chipTextDuration]}>{durationLabel ?? 'Live'}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomColor: '#eef2f7', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  avatarWrap: { height: 44, position: 'relative', width: 44 },
  avatarImage: { borderRadius: 22, height: 44, width: 44 },
  avatarFallback: { alignItems: 'center', backgroundColor: '#e2e8f0', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  avatarText: { color: '#334155', fontSize: 15, fontWeight: '700' },
  channelBadge: { alignItems: 'center', borderColor: '#fff', borderRadius: 9, borderWidth: 2, bottom: -2, height: 18, justifyContent: 'center', overflow: 'hidden', position: 'absolute', right: -2, width: 18 },
  copy: { flex: 1, minWidth: 0 },
  topLine: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  name: { color: '#0f172a', flex: 1, fontSize: 15, fontWeight: '700' },
  nameMissed: { color: '#e11d48' },
  time: { color: '#94a3b8', fontSize: 11 },
  subtitle: { color: '#94a3b8', fontSize: 11, marginTop: 3, textTransform: 'capitalize' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  chipIncoming: { backgroundColor: '#ecfdf5' },
  chipOutgoing: { backgroundColor: '#eff6ff' },
  chipDuration: { backgroundColor: '#f8fafc' },
  chipText: { fontSize: 11, fontWeight: '600' },
  chipTextIncoming: { color: '#047857' },
  chipTextOutgoing: { color: '#1d4ed8' },
  chipTextDuration: { color: '#475569' },
});
