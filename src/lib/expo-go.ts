import { isRunningInExpoGo } from 'expo';

/**
 * True when running inside Expo Go (any variant: store, CLI sideload, TestFlight).
 * Remote push via expo-notifications was removed from Expo Go (SDK 53+ warns,
 * SDK 55+ throws), so all push-token / background-task setup must be skipped
 * here. Local channels, categories, and in-app sounds still work.
 *
 * Uses the exact same predicate as expo-notifications' own guard, so there is
 * no room for mismatch between "Expo thinks we're in Go" and this check.
 */
export function isExpoGo(): boolean {
  try {
    return isRunningInExpoGo();
  } catch {
    return false;
  }
}
