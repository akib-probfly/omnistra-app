import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { AppState, type AppStateStatus } from 'react-native';

let lifecycleInstalled = false;

/**
 * iOS deactivates AVAudioSession when the app leaves the foreground.
 * Re-activate on resume so voice notes can record and play again.
 */
export function ensureAudioSessionLifecycle() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;

  const restore = (state: AppStateStatus) => {
    if (state !== 'active') return;
    void setIsAudioActiveAsync(true).catch(() => {});
  };

  AppState.addEventListener('change', restore);
  if (AppState.currentState === 'active') {
    void setIsAudioActiveAsync(true).catch(() => {});
  }
}

export async function activatePlaybackSession() {
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
  ensureAudioSessionLifecycle();
  await setIsAudioActiveAsync(true);
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
    shouldPlayInBackground: false,
    interruptionMode: 'doNotMix',
  });
}

export async function releaseRecordingSession() {
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
