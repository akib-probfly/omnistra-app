import { UserCheck } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import type { ConversationAssignmentEvent } from '../api/inbox';
import { formatMessageTime, getAssignmentEventPresentation } from '../lib/inbox-utils';

export function AssignmentHistoryItem({ event }: { event: ConversationAssignmentEvent }) {
  const presentation = getAssignmentEventPresentation(event);
  const targetLabel = presentation.targetLabel?.trim();
  const timeLabel = formatMessageTime(event.createdAt);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <UserCheck color="#315EFB" size={14} />
        <Text style={styles.part}>{presentation.actorLabel}</Text>
        <Text style={styles.part}>{presentation.actionLabel}</Text>
        {targetLabel ? <Text style={[styles.part, styles.target]}>{targetLabel}</Text> : null}
        <Text style={styles.time}>{timeLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  part: {
    color: '#64748b',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  target: {
    color: '#334155',
    fontWeight: '600',
  },
  time: {
    color: '#94a3b8',
    fontSize: 14,
    fontStyle: 'normal',
    lineHeight: 20,
  },
});
