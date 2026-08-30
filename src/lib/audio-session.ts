import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { AppState, type AppStateStatus } from 'react-native';

let lifecycleInstalled = false;
let callAudioHeld = false;

/**
 * iOS deactivates AVAudioSession when the app leaves the foreground.
 * Re-activate on resume so voice notes can record and play again.
 */
export function ensureAudioSessionLifecycle() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;

  const restore = (state: AppStateStatus) => {
    if (state !== 'active') return;
    // Do not retouch AVAudioSession during a WebRTC call — expo-audio
    // category changes mute remote audio on iOS.
    if (callAudioHeld) return;
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

export async function activateCallSession() {
  ensureAudioSessionLifecycle();
  callAudioHeld = true;
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
