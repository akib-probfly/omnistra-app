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
  const size = 15;
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
  const { colors, isDark } = useTheme();
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
  const cardBg = isDark ? colors.surface : toneStyles.iconBg;

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: isDark ? colors.cardBorder : `${toneStyles.iconColor}22` }]}>
        <View style={[styles.iconCircle, { backgroundColor: isDark ? colors.surfaceSecondary : '#fff' }]}>
          {renderIcon(tone, session.direction, toneStyles.iconColor)}
        </View>
        <View style={styles.copy}>
          <View style={styles.topLine}>
            <View style={styles.titleGroup}>
              <Text style={[styles.direction, { color: colors.text }]} numberOfLines={1}>{directionLabel}</Text>
              <Text style={[styles.sep, { color: colors.textMuted }]}>·</Text>
              <Text style={[styles.outcome, { color: toneStyles.text }]} numberOfLines={1}>{outcomeLabel}</Text>
            </View>
            <Text style={[styles.time, { color: colors.textMuted }]}>{timeLabel}</Text>
          </View>
          {metaLabel ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>{metaLabel}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    paddingVertical: 5,
  },
  card: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    overflow: 'hidden',
    paddingHorizontal: 12,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 10,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
  },
  topLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  titleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    minWidth: 0,
  },
  direction: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '700',
  },
  outcome: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  sep: {
    fontSize: 13,
  },
  time: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});
