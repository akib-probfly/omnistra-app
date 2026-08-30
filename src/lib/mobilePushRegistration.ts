import * as Application from "expo-application";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  fetchNotificationPreferences,
  registerMobilePushDevice,
  revokeMobilePushDevice,
  updateNotificationPreferences,
  type MobilePushEnvironment,
  type MobilePushProvider,
} from "../api/notifications";
import { fetchMyWorkspaces } from "../api/workspaces";

const REGISTRATION_STORAGE_KEY = "mobile-push-device-registration";
const PREFERENCE_AUTO_ENABLE_KEY = "mobile-push-pref-auto-enabled";
const DEFAULT_CHANNEL_ID = "default";
// Versioned because Android notification channel sound/importance settings are
// immutable after creation. This also matches the backend FCM channel id.
const CALL_CHANNEL_ID = "incoming_calls_v2";
export { CALL_CHANNEL_ID, DEFAULT_CHANNEL_ID };
const NOTIFICATION_COLOR = "#1d4ed8";

type StoredMobilePushRegistration = {
  provider: MobilePushProvider;
  token: string;
};

let registrationInFlight: Promise<boolean> | null = null;
let notificationChannelsPromise: Promise<void> | null = null;

function isNativeMobilePlatform(): boolean {
  return Platform.OS === "android" || Platform.OS === "ios";
}

function getProvider(): MobilePushProvider | null {
  if (Platform.OS === "android") return "FCM";
  if (Platform.OS === "ios") return "APNS";
  return null;
}

async function getEnvironment(): Promise<MobilePushEnvironment> {
  if (Platform.OS === "ios") {
    try {
      const environment =
        await Application.getIosPushNotificationServiceEnvironmentAsync();
      return environment === "development" ? "DEVELOPMENT" : "PRODUCTION";
    } catch (error) {
      console.warn("[mobile-push] APNs environment unavailable", error);
    }
  }

  return __DEV__ ? "DEVELOPMENT" : "PRODUCTION";
}

function getAppVersion(): string | null {
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    null
  );
}

function getBuildNumber(): string | null {
  return Application.nativeBuildVersion ?? null;
}

async function getDeviceId(): Promise<string | null> {
  try {
    if (Platform.OS === "android") {
      return Application.getAndroidId();
    }

    if (Platform.OS === "ios") {
      return await Application.getIosIdForVendorAsync();
    }
  } catch (error) {
    console.warn("[mobile-push] device id unavailable", error);
  }

  return null;
}

async function readStoredRegistration(): Promise<StoredMobilePushRegistration | null> {
  try {
    const value = await SecureStore.getItemAsync(REGISTRATION_STORAGE_KEY);
    if (!value) return null;

    const parsed = JSON.parse(value) as Partial<StoredMobilePushRegistration>;
    if (
      (parsed.provider !== "FCM" && parsed.provider !== "APNS") ||
      typeof parsed.token !== "string" ||
      parsed.token.length === 0
    ) {
      return null;
    }

    return { provider: parsed.provider, token: parsed.token };
  } catch (error) {
    console.warn("[mobile-push] stored registration read failed", error);
    return null;
  }
}

async function writeStoredRegistration(
  registration: StoredMobilePushRegistration,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      REGISTRATION_STORAGE_KEY,
      JSON.stringify(registration),
    );
  } catch (error) {
    console.warn("[mobile-push] stored registration write failed", error);
  }
}

async function clearStoredRegistration(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REGISTRATION_STORAGE_KEY);
  } catch (error) {
    console.warn("[mobile-push] stored registration cleanup failed", error);
  }
}

async function configureAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "message.wav",
    vibrationPattern: [0, 250, 200, 250],
    lightColor: NOTIFICATION_COLOR,
  });
  await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
    name: "Incoming calls",
    description: "Ringing WhatsApp voice calls",
    importance: Notifications.AndroidImportance.MAX,
    sound: "call.wav",
    vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
    lightColor: NOTIFICATION_COLOR,
    enableVibrate: true,
    bypassDnd: true,
    lockscreenVisibility:
      Notifications.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      flags: {
        enforceAudibility: true,
        requestHardwareAudioVideoSynchronization: false,
      },
    },
  });
}

/**
 * The call background task can run before the authenticated app tree mounts.
 * Ensure its local channel exists independently of token registration.
 */
export function ensureMobilePushChannels(): Promise<void> {
  if (!notificationChannelsPromise) {
    notificationChannelsPromise = configureAndroidChannels().catch((error) => {
      notificationChannelsPromise = null;
      throw error;
    });
  }
  return notificationChannelsPromise;
}

async function getNativeToken(): Promise<string | null> {
  const token = await Notifications.getDevicePushTokenAsync();
  return typeof token.data === "string" && token.data.length > 0
    ? token.data
    : null;
}

async function ensureNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted || existing.status === "granted") {
    return true;
  }

  if (existing.status === "denied" && existing.canAskAgain === false) {
    return false;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return requested.granted || requested.status === "granted";
}

async function enableMobilePushPreferenceOnce(): Promise<void> {
  try {
    const already = await SecureStore.getItemAsync(PREFERENCE_AUTO_ENABLE_KEY);
    if (already === "1") {
      return;
    }

    const workspaces = await fetchMyWorkspaces();
    const workspaceId = workspaces.items?.[0]?.id;
    if (!workspaceId) {
      return;
    }

    const preferences = await fetchNotificationPreferences(workspaceId);
    if (!preferences.mobilePushNotificationsEnabled) {
      await updateNotificationPreferences(workspaceId, {
        ...preferences,
        mobilePushNotificationsEnabled: true,
      });
    }

    await SecureStore.setItemAsync(PREFERENCE_AUTO_ENABLE_KEY, "1");
  } catch (error) {
    console.warn("[mobile-push] preference auto-enable failed", error);
  }
}

async function registerOnce(accessTokenOverride?: string | null): Promise<boolean> {
  if (!isNativeMobilePlatform() || !Device.isDevice) {
    return false;
  }

  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return false;
  }

  // Ask before reading SecureStore so first login still shows the system dialog
  // even if the access token has not been persisted yet.
  const permissionGranted = await ensureNotificationPermission();
  if (!permissionGranted) {
    return false;
  }

  const accessToken =
    accessTokenOverride || (await SecureStore.getItemAsync("access-token"));
  if (!accessToken) {
    return false;
  }

  const provider = getProvider();
  if (!provider) return false;

  await ensureMobilePushChannels();
  const token = await getNativeToken();
  if (!token) return false;

  const previous = await readStoredRegistration();
  await registerMobilePushDevice({
    platform: Platform.OS === "android" ? "ANDROID" : "IOS",
    provider,
    token,
    deviceId: await getDeviceId(),
    appVersion: getAppVersion(),
    buildNumber: getBuildNumber(),
    environment: await getEnvironment(),
  });

  await writeStoredRegistration({ provider, token });
  await enableMobilePushPreferenceOnce();

  if (
    previous &&
    (previous.provider !== provider || previous.token !== token)
  ) {
    try {
      await revokeMobilePushDevice(previous);
    } catch (error) {
      console.warn("[mobile-push] previous token revocation failed", error);
    }
  }

  return true;
}

export function registerMobilePushDeviceIfPermitted(
  accessToken?: string | null,
): Promise<boolean> {
  if (!registrationInFlight) {
    registrationInFlight = registerOnce(accessToken)
      .catch((error) => {
        console.warn("[mobile-push] device registration failed", error);
        return false;
      })
      .finally(() => {
        registrationInFlight = null;
      });
  }

  return registrationInFlight;
}

export async function revokeRegisteredMobilePushDevice(): Promise<void> {
  if (registrationInFlight) {
    await registrationInFlight;
  }

  const registration = await readStoredRegistration();
  if (!registration) return;

  try {
    await revokeMobilePushDevice(registration);
  } catch (error) {
    console.warn("[mobile-push] device revocation failed", error);
  } finally {
    await clearStoredRegistration();
  }
}
