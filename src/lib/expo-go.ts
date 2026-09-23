import Constants from 'expo-constants';

/**
 * True when running inside Expo Go (any variant: store, CLI sideload, TestFlight).
 * Remote push via expo-notifications was removed from Expo Go (SDK 53+ warns,
 * SDK 55+ throws), so all push-token / background-task setup must be skipped
 * here. Local channels, categories, and in-app sounds still work.
 */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}
