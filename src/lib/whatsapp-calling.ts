import { NativeModules, Platform } from 'react-native';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
} from '../native/webrtc';
import type { ConversationCallSignalSession } from '../api/inbox';
import { activateCallSession, reapplyCallAudio, scheduleCallAudioReapply } from './audio-session';
import { stopIncomingCallRingtone } from './notificationSound';

export type WhatsappCallPeerContext = {
  peerConnection: any;
  localStream: any;
};

export function isWhatsappCallSupported() {
  return Boolean(NativeModules.WebRTCModule)
    && typeof mediaDevices?.getUserMedia === 'function'
    && typeof RTCPeerConnection === 'function';
}

export function extractWhatsappCallSignal(value: unknown): ConversationCallSignalSession | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Record<string, unknown>;
  const sessionCandidate = candidate.session ?? candidate.signaling;
  const connectionCandidate =
    candidate.connection && typeof candidate.connection === 'object'
      ? (candidate.connection as Record<string, unknown>).webrtc
      : undefined;
  const session =
    (sessionCandidate && typeof sessionCandidate === 'object'
      ? (sessionCandidate as Record<string, unknown>)
      : undefined)
    ?? (connectionCandidate && typeof connectionCandidate === 'object'
      ? (connectionCandidate as Record<string, unknown>)
      : undefined);

  if (!session || typeof session !== 'object') return null;

  const sdp = session.sdp;
  const sdpType = session.sdp_type ?? session.sdpType;
  if (typeof sdp !== 'string' || sdp.trim().length === 0) return null;

  return {
    sdpType: sdpType === 'answer' ? 'answer' : 'offer',
    sdp,
  };
}

export async function createWhatsappCallPeerContext(): Promise<WhatsappCallPeerContext> {
  if (!isWhatsappCallSupported()) {
    throw new Error('WhatsApp calling is not supported on this device build. Use a custom Expo dev client.');
  }

  stopIncomingCallRingtone();
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Microphone permission is required for WhatsApp calls.');
  }

  // iOS getUserMedia fails if AVAudioSession is still in playback-only mode
  // (ringtone or a voice note). Android is more forgiving of that mismatch.
  // On iOS we also release expo-audio first so WebRTC can own PlayAndRecord.
  await activateCallSession();
  await new Promise((resolve) => setTimeout(resolve, Platform.OS === 'ios' ? 160 : 80));

  const localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
  if (Platform.OS === 'ios') {
    await reapplyCallAudio().catch(() => {});
    scheduleCallAudioReapply();
  }
  const peerConnection = new RTCPeerConnection({ iceServers: [] });

  localStream.getAudioTracks().forEach((track: any) => {
    peerConnection.addTrack(track, localStream);
  });

  return { peerConnection, localStream };
}

export async function waitForIceGatheringComplete(peerConnection: any) {
  if (peerConnection.iceGatheringState === 'complete') return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      peerConnection.onicegatheringstatechange = null;
      resolve();
    }, 2500);

    peerConnection.onicegatheringstatechange = () => {
      if (peerConnection.iceGatheringState !== 'complete') return;
      clearTimeout(timeout);
      peerConnection.onicegatheringstatechange = null;
      resolve();
    };
  });
}

export async function createWhatsappCallOffer(
  peerConnection: any,
): Promise<ConversationCallSignalSession> {
  const offer = await peerConnection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: false,
  });
  await peerConnection.setLocalDescription(offer);
  await waitForIceGatheringComplete(peerConnection);

  return {
    sdpType: 'offer',
    sdp: peerConnection.localDescription?.sdp ?? offer.sdp ?? '',
  };
}

export async function createWhatsappCallAnswer(
  peerConnection: any,
  remoteOffer: ConversationCallSignalSession,
): Promise<ConversationCallSignalSession> {
  await peerConnection.setRemoteDescription(new RTCSessionDescription({
    type: 'offer',
    sdp: remoteOffer.sdp,
  }));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  await waitForIceGatheringComplete(peerConnection);

  return {
    sdpType: 'answer',
    sdp: peerConnection.localDescription?.sdp ?? answer.sdp ?? '',
  };
}
