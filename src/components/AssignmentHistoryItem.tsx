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
        <Text style={styles.text}>
          <Text style={styles.actor}>{presentation.actorLabel}</Text>
          {' '}
          {presentation.actionLabel}
          {targetLabel ? (
            <>
              {' '}
              <Text style={styles.target}>{targetLabel}</Text>
            </>
          ) : null}
          {' '}
          <Text style={styles.time}>{timeLabel}</Text>
        </Text>
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
  text: {
    color: '#64748b',
    flexShrink: 1,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  actor: {
    color: '#64748b',
    fontStyle: 'italic',
  },
  target: {
    color: '#334155',
    fontStyle: 'italic',
    fontWeight: '600',
  },
  time: {
    color: '#94a3b8',
    fontStyle: 'normal',
  },
});
