import { ArrowLeft, Headphones, Mic, MicOff, Phone, PhoneOff } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CallChromeSnapshot } from '../lib/call-chrome';
import { ColorfulAvatar } from './ColorfulAvatar';

const IN_CALL_GREEN = '#0f766e';

type Props = {
  chrome: CallChromeSnapshot;
  onBack: () => void;
};

export function InCallConversationHeader({ chrome, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const subtitle = chrome.phase === 'incoming'
    ? (chrome.statusLabel || 'Incoming call')
    : chrome.isConnected
      ? `In call · ${chrome.durationLabel}`
      : chrome.statusLabel;

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backHit} accessibilityLabel="Go back">
        <ArrowLeft color="#fff" size={22} />
      </Pressable>
      <Pressable style={styles.identity} onPress={chrome.onExpand} accessibilityLabel="Return to call">
        <ColorfulAvatar name={chrome.label} size={40} url={chrome.avatarUrl} />
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>{chrome.label}</Text>
          <View style={styles.statusRow}>
            <Headphones color="#ccfbf1" size={13} />
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
        </View>
      </Pressable>
      {chrome.phase === 'incoming' ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.round, styles.decline]}
            onPress={chrome.onDeclineCall}
            disabled={chrome.isBusy}
            accessibilityLabel="Decline call"
          >
            {chrome.isBusy ? <ActivityIndicator color="#fff" size="small" /> : <PhoneOff color="#fff" size={18} />}
          </Pressable>
          <Pressable
            style={[styles.round, styles.answer, (!chrome.canAnswer || chrome.isBusy) && styles.disabled]}
            onPress={chrome.onAnswerCall}
            disabled={!chrome.canAnswer || chrome.isBusy}
            accessibilityLabel="Answer call"
          >
            {chrome.isBusy ? <ActivityIndicator color="#fff" size="small" /> : <Phone color="#fff" size={18} />}
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            style={styles.roundMuted}
            onPress={chrome.onToggleMute}
            disabled={!chrome.canToggleMute}
            accessibilityLabel={chrome.isMuted ? 'Unmute' : 'Mute'}
          >
            {chrome.isMuted ? <MicOff color="#fff" size={18} /> : <Mic color="#fff" size={18} />}
          </Pressable>
          <Pressable
            style={[styles.round, styles.decline]}
            onPress={chrome.onEndCall}
            disabled={chrome.isBusy}
            accessibilityLabel="End call"
          >
            {chrome.isBusy ? <ActivityIndicator color="#fff" size="small" /> : <PhoneOff color="#fff" size={18} />}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: IN_CALL_GREEN,
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 10,
    paddingHorizontal: 8,
  },
  backHit: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  identity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minWidth: 0 },
  copy: { flex: 1, minWidth: 0 },
  name: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 2 },
  subtitle: { color: '#ccfbf1', flex: 1, fontSize: 12, fontWeight: '600' },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  round: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  roundMuted: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  decline: { backgroundColor: '#e11d48' },
  answer: { backgroundColor: '#22c55e' },
  disabled: { opacity: 0.45 },
});
