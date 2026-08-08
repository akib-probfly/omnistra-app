import { Headphones, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, PhoneOutgoing, ShieldQuestion } from 'lucide-react-native';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { RTCView } from '../native/webrtc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationCallConversation, ConversationCallSession, ConversationCallSignalSession } from '../api/inbox';
import { getCallSessionStatusLabel, isCallSessionTerminal } from '../lib/inbox-utils';
import type { CallConnectionState } from '../hooks/useWhatsappCallController';

type Props = {
  conversation: ConversationCallConversation;
  activeCallSession: ConversationCallSession | null;
  activeCallSignal: ConversationCallSignalSession | null;
  isBusy: boolean;
  connectionState: CallConnectionState;
  errorMessage: string | null;
  remoteStream: any | null;
  isMuted: boolean;
  onAnswerCall: () => void;
  onDeclineCall: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
};

function getConversationLabel(conversation: ConversationCallConversation) {
  return conversation.contact.displayName
    ?? conversation.contact.primaryPhone
    ?? conversation.channel.channelName
    ?? 'WhatsApp call';
}

function getInitials(label: string) {
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function CallPanel({
  conversation,
  activeCallSession,
  activeCallSignal,
  isBusy,
  connectionState,
  errorMessage,
  remoteStream,
  isMuted,
  onAnswerCall,
  onDeclineCall,
  onEndCall,
  onToggleMute,
}: Props) {
  const insets = useSafeAreaInsets();
  const label = getConversationLabel(conversation);
  const isIncomingCall = Boolean(
    activeCallSession
    && activeCallSession.direction === 'INBOUND'
    && (activeCallSession.status === 'REQUESTED'
      || activeCallSession.status === 'PERMISSION_REQUESTED'
      || activeCallSession.status === 'RINGING')
    && !activeCallSession.claimedByUserId,
  );
  const isTerminal = activeCallSession ? isCallSessionTerminal(activeCallSession.status) : false;
  const isOngoing = Boolean(activeCallSession) && !isTerminal && !isIncomingCall;
  const statusLabel = activeCallSession
    ? getCallSessionStatusLabel(activeCallSession.status, activeCallSession.permissionStatus, activeCallSession.direction)
    : connectionState === 'preparing' || connectionState === 'connecting'
      ? 'Connecting...'
      : 'Ready';

  const StatusIcon = activeCallSession?.status === 'CONNECTED' || remoteStream
    ? Headphones
    : activeCallSession?.status === 'PERMISSION_REQUESTED'
      ? ShieldQuestion
      : activeCallSession?.direction === 'INBOUND'
        ? PhoneIncoming
        : PhoneOutgoing;

  if (!activeCallSession && connectionState === 'idle') return null;

  if (isIncomingCall) {
    return (
      <Modal visible transparent animationType="fade">
        <View style={[styles.incomingOverlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.incomingCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{getInitials(label)}</Text></View>
            <Text style={styles.incomingTitle}>Incoming WhatsApp call</Text>
            <Text style={styles.incomingName}>{label}</Text>
            <Text style={styles.incomingHint}>{statusLabel}</Text>
            {!activeCallSignal ? <Text style={styles.signalHint}>Waiting for call signal...</Text> : null}
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            <View style={styles.incomingActions}>
              <Pressable style={[styles.roundButton, styles.declineButton]} onPress={onDeclineCall} disabled={isBusy}>
                <PhoneOff color="#fff" size={24} />
              </Pressable>
              <Pressable
                style={[styles.roundButton, styles.answerButton, (!activeCallSignal || isBusy) && styles.buttonDisabled]}
                onPress={onAnswerCall}
                disabled={!activeCallSignal || isBusy}
              >
                {isBusy ? <ActivityIndicator color="#fff" /> : <Phone color="#fff" size={24} />}
              </Pressable>
            </View>
            <Text style={styles.incomingLabels}>Decline · Answer</Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (!isOngoing && connectionState === 'idle') return null;

  return (
    <View style={[styles.dock, { bottom: Math.max(insets.bottom, 12) }]}>
      {remoteStream ? (
        <RTCView streamURL={remoteStream.toURL()} style={styles.hiddenAudio} objectFit="cover" />
      ) : null}
      <View style={styles.dockAvatar}><Text style={styles.dockAvatarText}>{getInitials(label)}</Text></View>
      <View style={styles.dockCopy}>
        <Text style={styles.dockName} numberOfLines={1}>{label}</Text>
        <View style={styles.dockStatusRow}>
          <StatusIcon color="#2563eb" size={14} />
          <Text style={styles.dockStatus}>{statusLabel}</Text>
        </View>
        {errorMessage ? <Text style={styles.error} numberOfLines={2}>{errorMessage}</Text> : null}
      </View>
      <Pressable style={styles.dockAction} onPress={onToggleMute} disabled={!remoteStream && connectionState === 'idle'}>
        {isMuted ? <MicOff color="#0f172a" size={18} /> : <Mic color="#0f172a" size={18} />}
      </Pressable>
      <Pressable style={[styles.dockAction, styles.endAction]} onPress={onEndCall} disabled={isBusy || !activeCallSession}>
        {isBusy ? <ActivityIndicator color="#fff" /> : <PhoneOff color="#fff" size={18} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  incomingOverlay: { backgroundColor: 'rgba(15,23,42,0.72)', flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  incomingCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 28, paddingHorizontal: 24, paddingVertical: 32 },
  avatar: { alignItems: 'center', backgroundColor: '#dbeafe', borderRadius: 40, height: 80, justifyContent: 'center', width: 80 },
  avatarText: { color: '#1d4ed8', fontSize: 28, fontWeight: '800' },
  incomingTitle: { color: '#64748b', fontSize: 13, fontWeight: '600', marginTop: 18 },
  incomingName: { color: '#0f172a', fontSize: 22, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  incomingHint: { color: '#2563eb', fontSize: 14, fontWeight: '600', marginTop: 8 },
  signalHint: { color: '#94a3b8', fontSize: 12, marginTop: 8 },
  error: { color: '#e11d48', fontSize: 12, marginTop: 8, textAlign: 'center' },
  incomingActions: { flexDirection: 'row', gap: 28, marginTop: 28 },
  roundButton: { alignItems: 'center', borderRadius: 32, height: 64, justifyContent: 'center', width: 64 },
  declineButton: { backgroundColor: '#e11d48' },
  answerButton: { backgroundColor: '#16a34a' },
  buttonDisabled: { opacity: 0.45 },
  incomingLabels: { color: '#94a3b8', fontSize: 12, marginTop: 14 },
  dock: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#dbeafe',
    borderRadius: 22,
    borderWidth: 1,
    elevation: 8,
    flexDirection: 'row',
    gap: 10,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    position: 'absolute',
    right: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    zIndex: 50,
  },
  hiddenAudio: { height: 1, opacity: 0, position: 'absolute', width: 1 },
  dockAvatar: { alignItems: 'center', backgroundColor: '#dbeafe', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  dockAvatarText: { color: '#1d4ed8', fontSize: 13, fontWeight: '800' },
  dockCopy: { flex: 1, minWidth: 0 },
  dockName: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  dockStatusRow: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 2 },
  dockStatus: { color: '#2563eb', fontSize: 12, fontWeight: '600' },
  dockAction: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  endAction: { backgroundColor: '#e11d48' },
});
