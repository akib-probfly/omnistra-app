import { RTCView } from '../native/webrtc';
import { activatePlaybackSession, routeCallAudio } from '../lib/audio-session';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationCallConversation, ConversationCallSession, ConversationCallSignalSession } from '../api/inbox';
import { getCallSessionStatusLabel, isCallSessionTerminal } from '../lib/inbox-utils';
import type { CallConnectionState } from '../hooks/useWhatsappCallController';
import { ColorfulAvatar } from './ColorfulAvatar';
import { useTheme } from '../theme/ThemeContext';

/**
 * Android renders Modal outside the safe-area provider, so insets come back as 0
 * and the header would sit under the status bar.
 */
function resolveModalTopInset(topInset: number) {
  if (Platform.OS !== 'android') return topInset;
  return Math.max(topInset, StatusBar.currentHeight ?? 24);
}
import { useCallRingtone } from '../hooks/useCallRingtone';
import { setCallChrome, getFocusedCallConversationId, getCallPartyHint, getCallUiRevision, subscribeCallChrome, isGenericCallLabel } from '../lib/call-chrome';

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

function getCallPartyLabel(
  conversation: ConversationCallConversation,
  session: ConversationCallSession | null,
) {
  const hint = getCallPartyHint(conversation.id);
  const candidates = [
    hint?.label,
    conversation.contact.displayName,
    session?.recipientDisplayName,
    conversation.contact.primaryPhone,
    session?.recipientIdentityValue,
    conversation.channel.displayPhoneNumber,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed && !isGenericCallLabel(trimmed)) return trimmed;
  }
  return 'WhatsApp call';
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

function usePulse(active: boolean) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [active, pulse]);

  return pulse;
}

async function applySpeakerMode(loud: boolean) {
  await routeCallAudio(loud);
}

function IncomingCallScreen({
  label,
  avatarUrl,
  channelName,
  statusLabel,
  waitingForSignal,
  errorMessage,
  isBusy,
  canAnswer,
  expanded,
  onExpand,
  onMinimize,
  onAnswerCall,
  onDeclineCall,
  topInset,
  bottomInset,
  hideDock = false,
  remoteAudio = null,
}: {
  label: string;
  avatarUrl?: string | null;
  channelName?: string | null;
  statusLabel: string;
  waitingForSignal: boolean;
  errorMessage: string | null;
  isBusy: boolean;
  canAnswer: boolean;
  expanded: boolean;
  onExpand: () => void;
  onMinimize: () => void;
  onAnswerCall: () => void;
  onDeclineCall: () => void;
  topInset: number;
  bottomInset: number;
  hideDock?: boolean;
  remoteAudio?: ReactNode;
}) {
  const { colors } = useTheme();
  const pulse = usePulse(true);
  const ringStyle = (delay: number) => ({
    opacity: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.45 - delay * 0.12, 0],
    }),
    transform: [{
      scale: pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [1 + delay * 0.08, 1.55 + delay * 0.2],
      }),
    }],
  });

  const statusText = waitingForSignal ? 'Waiting for signal…' : statusLabel;

  return (
    <>
      {hideDock ? null : (
      <View style={[styles.dock, { top: Math.max(topInset, 8), backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <Pressable style={styles.dockMain} onPress={onExpand}>
          <ColorfulAvatar name={label} size={36} url={avatarUrl} />
          <View style={styles.dockCopy}>
            <Text style={styles.dockName} numberOfLines={1}>{label}</Text>
            <View style={styles.dockStatusRow}>
              <PhoneIncoming color={colors.primary} size={14} />
              <Text style={styles.dockStatus} numberOfLines={1}>
                {statusText}
              </Text>
            </View>
            {errorMessage ? <Text style={styles.error} numberOfLines={2}>{errorMessage}</Text> : null}
          </View>
        </Pressable>
        <Pressable
          style={[styles.dockAction, styles.endAction, isBusy && styles.buttonDisabled]}
          onPress={onDeclineCall}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityLabel="Decline call"
        >
          {isBusy ? <ActivityIndicator color="#fff" /> : <PhoneOff color="#fff" size={18} />}
        </Pressable>
        <Pressable
          style={[styles.dockAction, styles.answerDockAction, (!canAnswer || isBusy) && styles.buttonDisabled]}
          onPress={onAnswerCall}
          disabled={!canAnswer || isBusy}
          accessibilityRole="button"
          accessibilityLabel="Answer call"
        >
          {isBusy ? <ActivityIndicator color="#fff" /> : <Phone color="#fff" size={18} />}
        </Pressable>
      </View>
      )}

      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={onMinimize}
      >
        <LinearGradient
          colors={['#0f2744', '#0b1220', '#07101c']}
          locations={[0, 0.45, 1]}
          style={[styles.incomingRoot, { paddingTop: resolveModalTopInset(topInset) + 20, paddingBottom: bottomInset + 28 }]}
        >
          {remoteAudio}
          <View style={styles.incomingGlow} />
          <View style={styles.incomingHeader}>
            <Pressable style={styles.minimizeButton} onPress={onMinimize} hitSlop={12}>
              <ChevronDown color="#fff" size={22} />
              <Text style={styles.minimizeLabel}>Minimize</Text>
            </Pressable>
            <View style={styles.incomingChip}>
              <View style={styles.incomingChipDotGreen} />
              <Text style={styles.incomingChipText}>Incoming call</Text>
            </View>
          </View>

          <View style={styles.incomingTopRow}>
            <View style={styles.incomingChip}>
              <View style={styles.incomingChipDotAmber} />
              <Text style={styles.incomingChipText} numberOfLines={1}>
                {channelName || 'WhatsApp'}
              </Text>
            </View>
          </View>

          <View style={styles.incomingBody}>
            <View style={styles.incomingAvatarStage}>
              <Animated.View style={[styles.incomingPulseRing, ringStyle(0)]} />
              <Animated.View style={[styles.incomingPulseRing, ringStyle(0.35)]} />
              <View style={styles.incomingAvatarShell}>
                <ColorfulAvatar name={label} size={112} url={avatarUrl} />
              </View>
              <View style={styles.incomingBadge}>
                <PhoneIncoming color="#052e16" size={14} strokeWidth={2.6} />
              </View>
            </View>

            <Text style={styles.incomingEyebrow}>WhatsApp call</Text>
            <Text style={styles.incomingName}>{label}</Text>
            <Text style={styles.incomingSubtitle}>is calling you</Text>

            <View style={styles.incomingStatusPill}>
              <View style={styles.incomingStatusDot} />
              <Text style={styles.incomingStatusText}>{statusText}</Text>
            </View>

            {errorMessage ? (
              <View style={styles.incomingErrorBox}>
                <Text style={styles.incomingErrorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.incomingActions}>
            <View style={styles.incomingActionCol}>
              <Pressable
                style={[styles.incomingRoundButton, styles.declineButton, isBusy && styles.buttonDisabled]}
                onPress={onDeclineCall}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Decline call"
              >
                {isBusy ? <ActivityIndicator color="#fff" /> : <PhoneOff color="#fff" size={28} />}
              </Pressable>
              <Text style={styles.incomingActionLabel}>Decline</Text>
            </View>
            <View style={styles.incomingActionCol}>
              <Pressable
                style={[styles.incomingRoundButton, styles.answerButton, (!canAnswer || isBusy) && styles.buttonDisabled]}
                onPress={onAnswerCall}
                disabled={!canAnswer || isBusy}
                accessibilityRole="button"
                accessibilityLabel="Answer call"
              >
                {isBusy ? <ActivityIndicator color="#fff" /> : <Phone color="#fff" size={28} />}
              </Pressable>
              <Text style={styles.incomingActionLabel}>Answer</Text>
            </View>
          </View>
        </LinearGradient>
      </Modal>
    </>
  );
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
  const focusedConversationId = useSyncExternalStore(subscribeCallChrome, getFocusedCallConversationId);
  useSyncExternalStore(subscribeCallChrome, getCallUiRevision);
  const [expanded, setExpanded] = useState(false);
  const [incomingExpanded, setIncomingExpanded] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [speakerError, setSpeakerError] = useState<string | null>(null);

  const label = getCallPartyLabel(conversation, activeCallSession);
  const isIncomingCall = Boolean(
    activeCallSession
    && activeCallSession.direction === 'INBOUND'
    && (activeCallSession.status === 'REQUESTED'
      || activeCallSession.status === 'PERMISSION_REQUESTED'
      || activeCallSession.status === 'RINGING'),
  );
  const isTerminal = activeCallSession ? isCallSessionTerminal(activeCallSession.status) : false;
  const isOngoing = Boolean(activeCallSession) && !isTerminal && !isIncomingCall;
  const isConnected = Boolean(
    activeCallSession
    && (activeCallSession.status === 'CONNECTED' || remoteStream || connectionState === 'connected'),
  );
  const durationSeconds = useCallDurationSeconds(activeCallSession, isConnected);
  const durationLabel = useMemo(() => formatDuration(durationSeconds), [durationSeconds]);
  const { play: playRingtone, stop: stopRingtone } = useCallRingtone();

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
    if (isIncomingCall) {
      setIncomingExpanded(true);
    }
  }, [isIncomingCall, activeCallSession?.id]);

  useEffect(() => {
    const answering = connectionState === 'preparing' || connectionState === 'connecting' || connectionState === 'connected';
    if (!isIncomingCall || answering) {
      stopRingtone();
      return;
    }
    void playRingtone('incoming');
    return () => {
      stopRingtone();
    };
  }, [isIncomingCall, connectionState, playRingtone, stopRingtone]);

  useEffect(() => {
    if (!isOngoing) {
      setExpanded(false);
      setSpeakerOn(true);
      setSpeakerError(null);
    }
  }, [isOngoing]);

  const shouldRouteCallAudio =
    isOngoing
    || connectionState === 'preparing'
    || connectionState === 'connecting'
    || connectionState === 'connected'
    || Boolean(remoteStream);

  useEffect(() => {
    if (!shouldRouteCallAudio) return;
    let cancelled = false;
    const apply = () => {
      void applySpeakerMode(speakerOn)
        .then(() => {
          if (!cancelled) setSpeakerError(null);
        })
        .catch(() => {
          if (!cancelled) setSpeakerError('Could not switch speaker.');
        });
    };
    apply();
    const retry = setTimeout(apply, 500);
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [shouldRouteCallAudio, speakerOn, remoteStream]);

  const wasInCallRef = useRef(false);
  useEffect(() => {
    if (isOngoing) {
      wasInCallRef.current = true;
      return;
    }
    if (!wasInCallRef.current) return;
    wasInCallRef.current = false;
    void activatePlaybackSession().catch(() => {});
  }, [isOngoing]);

  const embedInHeader = focusedConversationId === conversation.id;

  useEffect(() => {
    if (!activeCallSession) {
      setCallChrome(null);
      return;
    }
    if (!isIncomingCall && !isOngoing && connectionState === 'idle') {
      setCallChrome(null);
      return;
    }
    setCallChrome({
      conversationId: conversation.id,
      label,
      avatarUrl: conversation.contact.avatarUrl ?? null,
      phase: isIncomingCall ? 'incoming' : 'ongoing',
      isConnected,
      durationLabel,
      statusLabel: isIncomingCall && !activeCallSignal ? 'Waiting for signal…' : statusLabel,
      isMuted,
      isBusy,
      canAnswer: Boolean(activeCallSignal),
      canToggleMute: Boolean(activeCallSession) && !isTerminal,
      onExpand: () => {
        if (isIncomingCall) setIncomingExpanded(true);
        else setExpanded(true);
      },
      onToggleMute,
      onEndCall,
      onAnswerCall,
      onDeclineCall,
    });
  }, [
    activeCallSession,
    activeCallSignal,
    connectionState,
    conversation.contact.avatarUrl,
    conversation.id,
    durationLabel,
    isBusy,
    isConnected,
    isIncomingCall,
    isOngoing,
    isMuted,
    isTerminal,
    label,
    onAnswerCall,
    onDeclineCall,
    onEndCall,
    onToggleMute,
    statusLabel,
  ]);

  useEffect(() => () => setCallChrome(null), []);

  if (!activeCallSession && connectionState === 'idle') return null;

  const remoteStreamUrl = (() => {
    try {
      return remoteStream?.toURL?.() ?? null;
    } catch {
      return null;
    }
  })();
  const remoteAudio = remoteStreamUrl ? (
    <RTCView streamURL={remoteStreamUrl} style={styles.hiddenAudio} objectFit="cover" />
  ) : null;

  if (isIncomingCall) {
    return (
      <>
        {incomingExpanded ? null : remoteAudio}
        <IncomingCallScreen
          label={label}
          avatarUrl={conversation.contact.avatarUrl}
          channelName={conversation.channel.channelName || conversation.channel.displayPhoneNumber}
          statusLabel={statusLabel}
          waitingForSignal={!activeCallSignal}
          errorMessage={errorMessage}
          isBusy={isBusy}
          canAnswer={Boolean(activeCallSignal)}
          expanded={incomingExpanded}
          onExpand={() => setIncomingExpanded(true)}
          onMinimize={() => setIncomingExpanded(false)}
          onAnswerCall={onAnswerCall}
          onDeclineCall={onDeclineCall}
          topInset={insets.top}
          bottomInset={insets.bottom}
          hideDock={embedInHeader}
          remoteAudio={incomingExpanded ? remoteAudio : null}
        />
      </>
    );
  }

  if (!isOngoing && connectionState === 'idle') return null;

  const canToggleMute = Boolean(activeCallSession) && !isTerminal;

  return (
    <>
      {expanded ? null : remoteAudio}

      {embedInHeader ? null : (
      <View style={[styles.dock, { top: Math.max(insets.top, 8) }]}>
        <Pressable style={styles.dockMain} onPress={() => setExpanded(true)}>
          <ColorfulAvatar name={label} size={36} url={conversation.contact.avatarUrl} />
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
      )}

      <Modal visible={expanded && isOngoing} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setExpanded(false)}>
        <View style={[styles.expandedRoot, { paddingTop: resolveModalTopInset(insets.top) + 20, paddingBottom: insets.bottom + 24 }]}>
          {expanded ? remoteAudio : null}
          <View style={styles.expandedHeader}>
            <Pressable style={styles.minimizeButton} onPress={() => setExpanded(false)} hitSlop={12}>
              <ChevronDown color="#fff" size={22} />
              <Text style={styles.minimizeLabel}>Minimize</Text>
            </Pressable>
            <Text style={styles.expandedBadge}>WhatsApp call</Text>
          </View>

          <View style={styles.expandedBody}>
            <View style={styles.expandedAvatarRing}>
              <ColorfulAvatar name={label} size={120} url={conversation.contact.avatarUrl} />
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
  incomingRoot: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 24,
  },
  incomingGlow: {
    backgroundColor: 'rgba(56,189,248,0.18)',
    borderRadius: 160,
    height: 220,
    position: 'absolute',
    right: -60,
    top: -40,
    width: 220,
  },
  incomingHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  incomingTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  incomingChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: '48%',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  incomingChipDotAmber: {
    backgroundColor: '#fbbf24',
    borderRadius: 4,
    height: 8,
    shadowColor: '#fbbf24',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    width: 8,
  },
  incomingChipDotGreen: {
    backgroundColor: '#34d399',
    borderRadius: 4,
    height: 8,
    shadowColor: '#34d399',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    width: 8,
  },
  incomingChipText: {
    color: 'rgba(255,255,255,0.82)',
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  incomingBody: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  incomingAvatarStage: {
    alignItems: 'center',
    height: 168,
    justifyContent: 'center',
    marginBottom: 8,
    width: 168,
  },
  incomingPulseRing: {
    borderColor: 'rgba(56,189,248,0.35)',
    borderRadius: 999,
    borderWidth: 2,
    height: 128,
    position: 'absolute',
    width: 128,
  },
  incomingAvatarShell: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 64,
    borderWidth: 1,
    padding: 6,
  },
  incomingBadge: {
    alignItems: 'center',
    backgroundColor: '#34d399',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    top: 22,
    width: 28,
  },
  incomingEyebrow: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2.2,
    marginTop: 22,
    textTransform: 'uppercase',
  },
  incomingName: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 10,
    textAlign: 'center',
  },
  incomingSubtitle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 16,
    marginTop: 6,
  },
  incomingStatusPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  incomingStatusDot: {
    backgroundColor: '#38bdf8',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  incomingStatusText: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 13,
    fontWeight: '600',
  },
  incomingErrorBox: {
    backgroundColor: 'rgba(244,63,94,0.12)',
    borderColor: 'rgba(251,113,133,0.28)',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    maxWidth: 320,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  incomingErrorText: {
    color: '#fecdd3',
    fontSize: 13,
    textAlign: 'center',
  },
  incomingActions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 8,
  },
  incomingActionCol: {
    alignItems: 'center',
    gap: 12,
    width: 120,
  },
  incomingRoundButton: {
    alignItems: 'center',
    borderRadius: 40,
    elevation: 6,
    height: 76,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    width: 76,
  },
  declineButton: { backgroundColor: '#e11d48' },
  answerButton: { backgroundColor: '#10b981' },
  answerDockAction: { backgroundColor: '#10b981' },
  buttonDisabled: { opacity: 0.45 },
  incomingActionLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '700',
  },
  error: { color: '#e11d48', fontSize: 12, marginTop: 8, textAlign: 'center' },
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
  hiddenAudio: { height: 2, left: 0, opacity: 1, position: 'absolute', top: 0, width: 2 },
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
