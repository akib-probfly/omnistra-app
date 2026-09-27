import { Platform } from 'react-native';

type CallAudioNativeModule = {
  activate: (speaker: boolean) => Promise<void>;
  setSpeaker: (speaker: boolean) => Promise<void>;
  deactivate: () => Promise<void>;
};

function loadNativeModule(): CallAudioNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // 'expo' re-exports requireOptionalNativeModule (expo-modules-core must
    // not be a direct dependency — see expo-doctor).
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy optional native load
    const { requireOptionalNativeModule } = require('expo') as typeof import('expo');
    return requireOptionalNativeModule<CallAudioNativeModule>('ZurvisCallAudio');
  } catch {
    return null;
  }
}

export function hasNativeCallAudio() {
  return loadNativeModule() != null;
}

export async function activateNativeCallAudio(speaker: boolean) {
  const native = loadNativeModule();
  if (!native) return false;
  await native.activate(speaker);
  return true;
}

export async function setNativeCallSpeaker(speaker: boolean) {
  const native = loadNativeModule();
  if (!native) return false;
  await native.setSpeaker(speaker);
  return true;
}

export async function deactivateNativeCallAudio() {
  const native = loadNativeModule();
  if (!native) return false;
  await native.deactivate();
  return true;
}
