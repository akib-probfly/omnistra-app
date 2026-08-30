import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import {
  activateNativeCallAudio,
  deactivateNativeCallAudio,
  setNativeCallSpeaker,
} from './call-audio-native';
import { stopIncomingCallRingtone } from './notificationSound';

let lifecycleInstalled = false;
let callAudioHeld = false;
let callSpeakerPreferred = true;

/**
 * iOS deactivates AVAudioSession when the app leaves the foreground.
 * Re-activate on resume so voice notes can record and play again.
 */
export function ensureAudioSessionLifecycle() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;

  const restore = (state: AppStateStatus) => {
    if (state !== 'active') return;
    if (callAudioHeld) {
      if (Platform.OS === 'ios') {
        void activateNativeCallAudio(callSpeakerPreferred).catch(() => {});
      }
      return;
    }
    void setIsAudioActiveAsync(true).catch(() => {});
  };

  AppState.addEventListener('change', restore);
  if (AppState.currentState === 'active') {
    void setIsAudioActiveAsync(true).catch(() => {});
  }
}

export function isCallAudioHeld() {
  return callAudioHeld;
}

export async function activatePlaybackSession() {
  if (callAudioHeld) return;
  ensureAudioSessionLifecycle();
  await setIsAudioActiveAsync(true);
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
    shouldPlayInBackground: false,
    interruptionMode: 'mixWithOthers',
  });
}

export async function activateRecordingSession() {
  if (callAudioHeld) return;
  ensureAudioSessionLifecycle();
  await setIsAudioActiveAsync(true);
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
    shouldPlayInBackground: false,
    interruptionMode: 'doNotMix',
  });
}

export async function reapplyCallAudio() {
  if (!callAudioHeld || Platform.OS !== 'ios') return;
  await activateNativeCallAudio(callSpeakerPreferred);
}

export function scheduleCallAudioReapply() {
  if (!callAudioHeld || Platform.OS !== 'ios') return;
  for (const delayMs of [200, 600, 1200]) {
    setTimeout(() => {
      void reapplyCallAudio().catch(() => {});
    }, delayMs);
  }
}

export async function routeCallAudio(speaker: boolean) {
  callSpeakerPreferred = speaker;
  if (Platform.OS === 'ios') {
    const routed = await setNativeCallSpeaker(speaker);
    if (routed) return;
  }

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: !speaker,
  });
}

export async function activateCallSession() {
  ensureAudioSessionLifecycle();
  callAudioHeld = true;
  callSpeakerPreferred = true;
  stopIncomingCallRingtone();

  if (Platform.OS === 'ios') {
    try {
      await setIsAudioActiveAsync(false);
    } catch {
      // expo-audio may already have released the session.
    }
    const configured = await activateNativeCallAudio(true);
    if (configured) {
      scheduleCallAudioReapply();
      return;
    }
  }

  await setIsAudioActiveAsync(true);
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: false,
  });
}

export async function releaseCallSession() {
  callAudioHeld = false;
  if (Platform.OS === 'ios') {
    await deactivateNativeCallAudio().catch(() => {});
  }
  await activatePlaybackSession();
}

export async function releaseRecordingSession() {
  if (callAudioHeld) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
  } catch {
    // Playback can still work with the previous session category.
  }
}
