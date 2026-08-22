import { PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Radio } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import type { ConversationCallSession } from '../api/inbox';
import { useTheme } from '../theme/ThemeContext';
import {
  formatCallDurationLabel,
  formatCallHistoryTime,
  getCallAgentLabel,
  getCallDisplayTone,
  getCallHistoryToneStyles,
  getCallOutcomeLabel,
  getCallSessionHistoryPresentation,
  getCallSessionTimelineTimestamp,
  type CallHistoryTone,
} from '../lib/inbox-utils';

function renderIcon(tone: CallHistoryTone, direction: 'INBOUND' | 'OUTBOUND', color: string) {
  const size = 14;
  switch (tone) {
    case 'noAnswer':
      return <PhoneOutgoing color={color} size={size} />;
    case 'missed':
      return <PhoneMissed color={color} size={size} />;
    case 'declined':
      return <PhoneOff color={color} size={size} />;
    case 'connected':
    case 'completed':
      return <PhoneCall color={color} size={size} />;
    case 'ringing':
      return direction === 'INBOUND' ? <PhoneIncoming color={color} size={size} /> : <PhoneOutgoing color={color} size={size} />;
    case 'permission':
    case 'permissionGranted':
      return <Radio color={color} size={size} />;
    default:
      return direction === 'INBOUND' ? <PhoneIncoming color={color} size={size} /> : <PhoneOutgoing color={color} size={size} />;
  }
}

export function CallHistoryItem({ session }: { session: ConversationCallSession }) {
  const { colors } = useTheme();
  const presentation = getCallSessionHistoryPresentation(session);
  const timestamp = getCallSessionTimelineTimestamp(session);
  const timeLabel = formatCallHistoryTime(timestamp);
  const durationLabel = formatCallDurationLabel(session.durationSeconds);
  const directionLabel = session.direction === 'INBOUND' ? 'Incoming call' : 'Outgoing call';
  const outcomeLabel = getCallOutcomeLabel(session, presentation.tone, presentation.title, durationLabel);
  const tone = getCallDisplayTone(session, presentation.tone, outcomeLabel);
  const toneStyles = getCallHistoryToneStyles(tone);
  const agentLabel = getCallAgentLabel(session);
  const detailLabel = presentation.detail?.trim() || null;
  const metaLabel = agentLabel ?? detailLabel;

  return (
    <View style={styles.row}>
      <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={styles.line}>
          <View style={[styles.iconCircle, { backgroundColor: toneStyles.iconBg }]}>
            {renderIcon(tone, session.direction, toneStyles.iconColor)}
          </View>
          <Text style={[styles.direction, { color: colors.text }]}>{directionLabel}</Text>
          <Text style={[styles.sep, { color: colors.textMuted }]}>·</Text>
          <Text style={[styles.outcome, { color: toneStyles.text }]}>{outcomeLabel}</Text>
          <Text style={[styles.sep, { color: colors.textMuted }]}>·</Text>
          <Text style={[styles.time, { color: colors.textMuted }]}>{timeLabel}</Text>
        </View>
        {metaLabel ? <Text style={[styles.agent, { color: colors.textSecondary }]} numberOfLines={1}>{metaLabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', alignSelf: 'stretch', paddingVertical: 4 },
  pill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderColor: '#dce8f8',
    borderRadius: 999,
    borderWidth: 1,
    elevation: 1,
    flexDirection: 'column',
    gap: 2,
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  line: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' },
  iconCircle: { alignItems: 'center', borderRadius: 11, height: 20, justifyContent: 'center', marginLeft: 4, width: 20 },
  direction: { color: '#1e293b', fontSize: 12, flexShrink: 0, fontWeight: '600' },
  sep: { color: '#cbd5e1', fontSize: 12 },
  outcome: { flexShrink: 1, fontSize: 12, fontWeight: '600' },
  agent: { color: '#64748b', flexShrink: 1, fontSize: 11, fontWeight: '500' },
  time: { color: '#94a3b8', flexShrink: 0, fontSize: 11 },
});
