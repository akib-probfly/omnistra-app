// @ts-nocheck
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Copy, Reply as ReplyIcon } from 'lucide-react-native';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function ReactionPicker({
  visible,
  onPick,
  onClose,
  onReply,
  onCopy,
}: {
  visible: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
  onReply: () => void;
  onCopy?: () => void;
}) {
  useEffect(() => {
    if (!visible) return;
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.panel}>
          <Text style={styles.title}>React to message</Text>
          <View style={styles.emojis}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable key={emoji} style={styles.emojiButton} onPress={() => onPick(emoji)}>
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actionRow}>
            <Pressable style={styles.actionButton} onPress={() => { onClose(); onReply(); }}>
              <ReplyIcon color="#2563eb" size={20} />
              <Text style={styles.actionText}>Reply</Text>
            </Pressable>
            {onCopy ? (
              <Pressable style={styles.actionButton} onPress={() => { onClose(); onCopy(); }}>
                <Copy color="#2563eb" size={20} />
                <Text style={styles.actionText}>Copy</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#0004', flex: 1, justifyContent: 'center', padding: 32 },
  panel: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  title: { color: '#334155', fontSize: 14, fontWeight: '700', marginBottom: 16 },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  emojiButton: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  emoji: { fontSize: 24 },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 18, width: '100%' },
  actionButton: { alignItems: 'center', borderColor: '#cfe0fa', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 9 },
  actionText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
});
