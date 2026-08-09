import { setAudioModeAsync } from 'expo-audio';
import {
  ChevronDown,
  Headphones,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  ShieldQuestion,
  Volume1,
  Volume2,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationCallConversation, ConversationCallSession, ConversationCallSignalSession } from '../api/inbox';
import { getCallSessionStatusLabel, isCallSessionTerminal } from '../lib/inbox-utils';
import type { CallConnectionState } from '../hooks/useWhatsappCallController';
import { RTCView } from '../native/webrtc';

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

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function useCallDurationSeconds(session: ConversationCallSession | null, isConnected: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!session || !isConnected) {
      setElapsed(0);
      return;
    }

    const compute = () => {
      if (typeof session.durationSeconds === 'number' && session.durationSeconds >= 0 && session.endedAt) {
        return session.durationSeconds;
      }
      if (session.connectedAt) {
        const started = Date.parse(session.connectedAt);
        if (!Number.isNaN(started)) {
          return Math.max(0, Math.floor((Date.now() - started) / 1000));
        }
      }
      return typeof session.durationSeconds === 'number' ? Math.max(0, session.durationSeconds) : 0;
    };

    setElapsed(compute());
    const timer = setInterval(() => setElapsed(compute()), 1000);
    return () => clearInterval(timer);
  }, [isConnected, session]);

  return elapsed;
}

async function applySpeakerMode(loud: boolean) {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: !loud,
  });
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
  const [expanded, setExpanded] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [speakerError, setSpeakerError] = useState<string | null>(null);

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
  const isConnected = Boolean(
    activeCallSession
    && (activeCallSession.status === 'CONNECTED' || remoteStream || connectionState === 'connected'),
  );
  const durationSeconds = useCallDurationSeconds(activeCallSession, isConnected);
  const durationLabel = useMemo(() => formatDuration(durationSeconds), [durationSeconds]);

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

  useEffect(() => {
    if (!isOngoing) {
      setExpanded(false);
      setSpeakerOn(true);
      setSpeakerError(null);
    }
  }, [isOngoing]);

  useEffect(() => {
    if (!isOngoing) return;
    let cancelled = false;
    void applySpeakerMode(speakerOn)
      .then(() => {
        if (!cancelled) setSpeakerError(null);
      })
      .catch(() => {
        if (!cancelled) setSpeakerError('Could not switch speaker.');
      });
    return () => {
      cancelled = true;
    };
  }, [isOngoing, speakerOn]);

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

  const canToggleMute = Boolean(activeCallSession) && !isTerminal;
  const remoteAudio = remoteStream ? (
    <RTCView streamURL={remoteStream.toURL()} style={styles.hiddenAudio} objectFit="cover" />
  ) : null;

  return (
    <>
      {remoteAudio}

      <View style={[styles.dock, { bottom: Math.max(insets.bottom, 12) }]}>
        <Pressable style={styles.dockMain} onPress={() => setExpanded(true)}>
          <View style={styles.dockAvatar}><Text style={styles.dockAvatarText}>{getInitials(label)}</Text></View>
          <View style={styles.dockCopy}>
            <Text style={styles.dockName} numberOfLines={1}>{label}</Text>
            <View style={styles.dockStatusRow}>
              <StatusIcon color="#2563eb" size={14} />
              <Text style={styles.dockStatus}>
                {isConnected ? `In call · ${durationLabel}` : statusLabel}
              </Text>
            </View>
            {errorMessage ? <Text style={styles.error} numberOfLines={2}>{errorMessage}</Text> : null}
          </View>
        </Pressable>
        <Pressable style={styles.dockAction} onPress={onToggleMute} disabled={!canToggleMute}>
          {isMuted ? <MicOff color="#0f172a" size={18} /> : <Mic color="#0f172a" size={18} />}
        </Pressable>
        <Pressable
          style={[styles.dockAction, styles.endAction]}
          onPress={onEndCall}
          disabled={isBusy || !activeCallSession}
        >
          {isBusy ? <ActivityIndicator color="#fff" /> : <PhoneOff color="#fff" size={18} />}
        </Pressable>
      </View>

      <Modal visible={expanded && isOngoing} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setExpanded(false)}>
        <View style={[styles.expandedRoot, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.expandedHeader}>
            <Pressable style={styles.minimizeButton} onPress={() => setExpanded(false)} hitSlop={12}>
              <ChevronDown color="#fff" size={22} />
              <Text style={styles.minimizeLabel}>Minimize</Text>
            </Pressable>
            <Text style={styles.expandedBadge}>WhatsApp call</Text>
          </View>

          <View style={styles.expandedBody}>
            <View style={styles.expandedAvatarRing}>
              <View style={styles.expandedAvatar}>
                <Text style={styles.expandedAvatarText}>{getInitials(label)}</Text>
              </View>
            </View>
            <Text style={styles.expandedName}>{label}</Text>
            <Text style={styles.expandedStatus}>
              {isConnected ? 'In call' : statusLabel}
            </Text>
            <Text style={styles.expandedDuration}>{isConnected ? durationLabel : '00:00'}</Text>
            {errorMessage ? <Text style={styles.expandedError}>{errorMessage}</Text> : null}
            {speakerError ? <Text style={styles.expandedWarn}>{speakerError}</Text> : null}
          </View>

          <View style={styles.expandedControls}>
            <View style={styles.controlItem}>
              <Pressable
                style={[styles.controlButton, isMuted && styles.controlButtonActive]}
                onPress={onToggleMute}
                disabled={!canToggleMute || isBusy}
              >
                {isMuted ? <MicOff color="#fff" size={26} /> : <Mic color="#fff" size={26} />}
              </Pressable>
              <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </View>

            <View style={styles.controlItem}>
              <Pressable
                style={[styles.controlButton, speakerOn && styles.controlButtonLoud]}
                onPress={() => setSpeakerOn((current) => !current)}
                disabled={isBusy}
              >
                {speakerOn ? <Volume2 color="#fff" size={26} /> : <Volume1 color="#fff" size={26} />}
              </Pressable>
              <Text style={styles.controlLabel}>{speakerOn ? 'Loud' : 'Earpiece'}</Text>
            </View>

            <View style={styles.controlItem}>
              <Pressable
                style={[styles.controlButton, styles.endControl]}
                onPress={onEndCall}
                disabled={isBusy || !activeCallSession}
              >
                {isBusy ? <ActivityIndicator color="#fff" /> : <PhoneOff color="#fff" size={26} />}
              </Pressable>
              <Text style={styles.controlLabel}>End</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  dockMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minWidth: 0 },
  dockAvatar: { alignItems: 'center', backgroundColor: '#dbeafe', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  dockAvatarText: { color: '#1d4ed8', fontSize: 13, fontWeight: '800' },
  dockCopy: { flex: 1, minWidth: 0 },
  dockName: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  dockStatusRow: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 2 },
  dockStatus: { color: '#2563eb', fontSize: 12, fontWeight: '600' },
  dockAction: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  endAction: { backgroundColor: '#e11d48' },
  expandedRoot: {
    backgroundColor: '#0b1220',
    flex: 1,
    paddingHorizontal: 24,
  },
  expandedHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  minimizeButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 8,
  },
  minimizeLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  expandedBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    borderWidth: 1,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  expandedBody: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  expandedAvatarRing: {
    borderColor: 'rgba(56,189,248,0.35)',
    borderRadius: 72,
    borderWidth: 2,
    padding: 6,
  },
  expandedAvatar: {
    alignItems: 'center',
    backgroundColor: '#1e3a5f',
    borderRadius: 60,
    height: 120,
    justifyContent: 'center',
    width: 120,
  },
  expandedAvatarText: { color: '#e0f2fe', fontSize: 40, fontWeight: '800' },
  expandedName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 28,
    textAlign: 'center',
  },
  expandedStatus: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
  },
  expandedDuration: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 16,
  },
  expandedError: {
    color: '#fda4af',
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
  },
  expandedWarn: {
    color: '#fcd34d',
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
  expandedControls: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingBottom: 12,
  },
  controlItem: { alignItems: 'center', gap: 10, width: 88 },
  controlButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  controlButtonActive: { backgroundColor: '#ef4444' },
  controlButtonLoud: { backgroundColor: '#2563eb' },
  endControl: { backgroundColor: '#e11d48' },
  controlLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
});
