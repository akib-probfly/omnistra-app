import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  answerConversationCall,
  declineConversationCall,
  endConversationCall,
  startConversationCall,
  type ConversationCallSignalSession,
} from '../api/inbox';
import {
  createWhatsappCallAnswer,
  createWhatsappCallOffer,
  createWhatsappCallPeerContext,
  extractWhatsappCallSignal,
  isWhatsappCallSupported,
  type WhatsappCallPeerContext,
} from '../lib/whatsapp-calling';
import { MediaStream, RTCSessionDescription } from '../native/webrtc';
import { releaseCallSession, scheduleCallAudioReapply } from '../lib/audio-session';

export type CallConnectionState =
  | 'idle'
  | 'preparing'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed';

export function useWhatsappCallController() {
  const startCallMutation = useMutation({ mutationFn: startConversationCall });
  const answerCallMutation = useMutation({ mutationFn: answerConversationCall });
  const declineCallMutation = useMutation({ mutationFn: declineConversationCall });
  const endCallMutation = useMutation({ mutationFn: endConversationCall });
  const peerContextRef = useRef<WhatsappCallPeerContext | null>(null);
  const appliedRemoteSignalRef = useRef<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<any | null>(null);
  const [connectionState, setConnectionState] = useState<CallConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const syncLocalAudioTracks = useCallback((enabled: boolean) => {
    const localStream = peerContextRef.current?.localStream;
    if (!localStream) return false;
    localStream.getAudioTracks().forEach((track: any) => {
      track.enabled = enabled;
    });
    setIsMuted(!enabled);
    return true;
  }, []);

  const resetPeerContext = useCallback((options?: { restoreAudio?: boolean }) => {
    peerContextRef.current?.peerConnection.close();
    peerContextRef.current?.localStream.getTracks().forEach((track: any) => track.stop());
    peerContextRef.current = null;
    appliedRemoteSignalRef.current = null;
    setRemoteStream(null);
    setIsMuted(false);
    setConnectionState('idle');
    if (options?.restoreAudio !== false) {
      void releaseCallSession().catch(() => {});
    }
  }, []);

  const clearError = useCallback(() => setErrorMessage(null), []);

  const toggleMute = useCallback(() => {
    const localStream = peerContextRef.current?.localStream;
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const shouldEnable = audioTracks.some((track: any) => !track.enabled);
    syncLocalAudioTracks(shouldEnable);
  }, [syncLocalAudioTracks]);

  const attachPeerListeners = useCallback((peerConnection: any) => {
    const applyRemoteStream = (stream: any, track?: any) => {
      if (track) {
        try { track.enabled = true; } catch {}
      }
      if (stream) {
        stream.getAudioTracks?.().forEach((audioTrack: any) => {
          try { audioTrack.enabled = true; } catch {}
        });
        setRemoteStream(stream);
        scheduleCallAudioReapply();
        return;
      }
      if (!track) return;
      try {
        const fallback = new MediaStream([track]);
        setRemoteStream(fallback);
      } catch {
        try {
          const fallback = new MediaStream();
          fallback.addTrack?.(track);
          setRemoteStream(fallback);
        } catch {}
      }
    };

    peerConnection.ontrack = (event: { streams?: any[]; track: any }) => {
      applyRemoteStream(event.streams?.[0], event.track);
    };
    peerConnection.onaddstream = (event: { stream?: any }) => {
      applyRemoteStream(event.stream);
    };

    peerConnection.onconnectionstatechange = () => {
      switch (peerConnection.connectionState) {
        case 'connected':
          setConnectionState('connected');
          scheduleCallAudioReapply();
          break;
        case 'connecting':
          setConnectionState('connecting');
          break;
        case 'disconnected':
          setConnectionState('disconnected');
          break;
        case 'failed':
          setConnectionState('failed');
          break;
        default:
          break;
      }
    };
    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
        scheduleCallAudioReapply();
      }
    };
  }, []);

  const initializePeerContext = useCallback(async () => {
    if (!isWhatsappCallSupported()) {
      throw new Error('WhatsApp calling requires a custom Expo build with WebRTC.');
    }
    resetPeerContext({ restoreAudio: false });
    const peerContext = await createWhatsappCallPeerContext();
    attachPeerListeners(peerContext.peerConnection);
    peerContextRef.current = peerContext;
    setIsMuted(false);
    return peerContext;
  }, [attachPeerListeners, resetPeerContext]);

  const applyRemoteSignal = useCallback(async (signal: ConversationCallSignalSession | null) => {
    if (!signal || !peerContextRef.current) return;
    const signature = `${signal.sdpType}:${signal.sdp}`;
    if (appliedRemoteSignalRef.current === signature) return;

    const peerConnection = peerContextRef.current.peerConnection;
    await peerConnection.setRemoteDescription(new RTCSessionDescription({
      type: signal.sdpType,
      sdp: signal.sdp,
    }));
    appliedRemoteSignalRef.current = signature;
  }, []);

  const startOutboundCall = useCallback(async (params: { conversationId: string; note?: string | null }) => {
    clearError();
    setConnectionState('preparing');
    try {
      const peerContext = await initializePeerContext();
      const offer = await createWhatsappCallOffer(peerContext.peerConnection);
      setConnectionState('connecting');
      const session = await startCallMutation.mutateAsync({
        conversationId: params.conversationId,
        note: params.note ?? null,
        session: offer,
      });

      const remoteSignal = extractWhatsappCallSignal(session.metadata);
      if (remoteSignal?.sdpType === 'answer') {
        await applyRemoteSignal(remoteSignal);
      }

      if (session.status === 'PERMISSION_REQUESTED') {
        Toast.show({
          type: 'success',
          text1: 'Permission message sent',
          text2: 'Waiting for the customer to approve WhatsApp calling.',
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'WhatsApp call started',
          text2: session.status === 'CONNECTED' ? 'The call connected successfully.' : 'The call is ringing now.',
        });
      }

      if (session.status !== 'RINGING' && session.status !== 'CONNECTED') {
        resetPeerContext();
        setConnectionState('idle');
      }

      return session;
    } catch (error) {
      resetPeerContext();
      setConnectionState('failed');
      const message = error instanceof Error ? error.message : 'Could not start the WhatsApp call';
      Toast.show({ type: 'error', text1: 'Could not start the WhatsApp call', text2: message });
      setErrorMessage(message);
    }
  }, [applyRemoteSignal, clearError, initializePeerContext, resetPeerContext, startCallMutation]);

  const answerCall = useCallback(async (params: {
    conversationId: string;
    callSessionId: string;
    remoteOffer: ConversationCallSignalSession;
    bizOpaqueCallbackData?: string | null;
  }) => {
    clearError();
    setConnectionState('preparing');
    try {
      const peerContext = await initializePeerContext();
      const answer = await createWhatsappCallAnswer(peerContext.peerConnection, params.remoteOffer);
      setConnectionState('connecting');
      const session = await answerCallMutation.mutateAsync({
        conversationId: params.conversationId,
        callSessionId: params.callSessionId,
        bizOpaqueCallbackData: params.bizOpaqueCallbackData ?? null,
        session: answer,
      });
      const remoteSignal = extractWhatsappCallSignal(session.metadata);
      if (remoteSignal?.sdpType === 'answer') {
        await applyRemoteSignal(remoteSignal);
      }
      return session;
    } catch (error) {
      resetPeerContext();
      setConnectionState('failed');
      const message = error instanceof Error ? error.message : 'Could not answer the WhatsApp call';
      Toast.show({ type: 'error', text1: 'Could not answer the call', text2: message });
      setErrorMessage(message);
    }
  }, [answerCallMutation, applyRemoteSignal, clearError, initializePeerContext, resetPeerContext]);

  const declineCall = useCallback(async (params: { conversationId: string; callSessionId: string }) => {
    clearError();
    try {
      const session = await declineCallMutation.mutateAsync(params);
      resetPeerContext();
      return session;
    } catch (error) {
      setConnectionState('failed');
      const message = error instanceof Error ? error.message : 'Could not decline the WhatsApp call';
      setErrorMessage(message);
    }
  }, [clearError, declineCallMutation, resetPeerContext]);

  const endCall = useCallback(async (params: { conversationId: string; callSessionId: string }) => {
    clearError();
    try {
      const session = await endCallMutation.mutateAsync(params);
      resetPeerContext();
      return session;
    } catch (error) {
      setConnectionState('failed');
      const message = error instanceof Error ? error.message : 'Could not end the WhatsApp call';
      setErrorMessage(message);
    }
  }, [clearError, endCallMutation, resetPeerContext]);

  useEffect(() => () => {
    resetPeerContext();
  }, [resetPeerContext]);

  return {
    connectionState,
    errorMessage,
    isMuted,
    isBusy:
      startCallMutation.isPending
      || answerCallMutation.isPending
      || declineCallMutation.isPending
      || endCallMutation.isPending,
    remoteStream,
    clearError,
    applyRemoteSignal,
    resetPeerContext,
    toggleMute,
    startOutboundCall,
    answerCall,
    declineCall,
    endCall,
  };
}
