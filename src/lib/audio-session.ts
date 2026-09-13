import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import {
  activateNativeCallAudio,
  deactivateNativeCallAudio,
  setNativeCallSpeaker,
} from './call-audio-native';
import { suppressCallSounds } from './notificationSound';

let lifecycleInstalled = false;
let callAudioHeld = false;
let callSpeakerPreferred = false;
let callAudioGeneration = 0;
let reapplyTimers: ReturnType<typeof setTimeout>[] = [];

function cancelAudioReapply() {
  reapplyTimers.forEach(clearTimeout);
  reapplyTimers = [];
}

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
  if (AppState.currentState === 'active' && !callAudioHeld) {
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
  if (callAudioHeld) return;
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
  if (callAudioHeld) return;
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
  cancelAudioReapply();
  const generation = callAudioGeneration;
  for (const delayMs of [200, 600, 1200]) {
    reapplyTimers.push(setTimeout(() => {
      if (generation !== callAudioGeneration) return;
      void reapplyCallAudio().catch(() => {});
    }, delayMs));
  }
}

export async function routeCallAudio(speaker: boolean) {
  callSpeakerPreferred = speaker;
  if (!callAudioHeld) return;
  const generation = callAudioGeneration;
  if (Platform.OS === 'ios') {
    try {
      const routed = await setNativeCallSpeaker(speaker);
      if (routed) return;
    } catch {
      // Speaker override can fail if the session was interrupted.
      // Fall back to a full re-activation so iOS audio comes back.
      if (!callAudioHeld || generation !== callAudioGeneration) return;
      const recovered = await activateNativeCallAudio(speaker).catch(() => false);
      if (recovered) return;
    }
    throw new Error('Could not route iOS call audio.');
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
  const generation = ++callAudioGeneration;
  cancelAudioReapply();
  callAudioHeld = true;
  ensureAudioSessionLifecycle();
  callSpeakerPreferred = false;
  await suppressCallSounds(true);
  if (generation !== callAudioGeneration || !callAudioHeld) {
    throw new Error('Call audio setup was cancelled.');
  }

  if (Platform.OS === 'ios') {
    const configured = await activateNativeCallAudio(false);
    if (generation !== callAudioGeneration || !callAudioHeld) {
      throw new Error('Call audio setup was cancelled.');
    }
    if (configured) {
      scheduleCallAudioReapply();
      return;
    }
    throw new Error('This iOS build is missing call audio support. Install a new native build.');
  }

  await setIsAudioActiveAsync(true);
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: true,
  });
}

export async function releaseCallSession() {
  const generation = ++callAudioGeneration;
  cancelAudioReapply();
  callAudioHeld = false;
  if (Platform.OS === 'ios') {
    await deactivateNativeCallAudio().catch(() => {});
  }
  if (generation !== callAudioGeneration) return;
  await suppressCallSounds(false);
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
