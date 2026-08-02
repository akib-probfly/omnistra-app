// @ts-nocheck
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function ReactionPicker({ visible, onPick, onClose, onReply }: { visible: boolean; onPick: (emoji: string) => void; onClose: () => void; onReply: () => void }) {
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
          <Pressable style={styles.replyButton} onPress={() => { onClose(); onReply(); }}>
            <Text style={styles.replyText}>↩ Reply</Text>
          </Pressable>
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
  replyButton: { alignItems: 'center', borderColor: '#cfe0fa', borderRadius: 12, borderWidth: 1, marginTop: 18, paddingHorizontal: 20, paddingVertical: 9, width: '100%' },
  replyText: { color: '#2563eb', fontSize: 14, fontWeight: '700' },
});
