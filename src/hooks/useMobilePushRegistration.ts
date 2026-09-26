import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import {
  AppState,
  type AppStateStatus,
  Platform,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { registerMobilePushDeviceIfPermitted } from "../lib/mobilePushRegistration";
import { isExpoGo } from "../lib/expo-go";

const PERMISSION_PROMPT_DELAY_MS = 1200;
const PERMISSION_RETRY_DELAY_MS = 1800;
const MAX_PERMISSION_RETRIES = 3;

function scheduleIdleTask(task: () => void): { cancel: () => void } {
  const idleCallback = (globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  }).requestIdleCallback;
  const cancelIdleCallback = (globalThis as typeof globalThis & {
    cancelIdleCallback?: (handle: number) => void;
  }).cancelIdleCallback;

  if (idleCallback) {
    const handle = idleCallback(task);
    return { cancel: () => cancelIdleCallback?.(handle) };
  }

  const handle = setTimeout(task, 0);
  return { cancel: () => clearTimeout(handle) };
}

function isForeground(state: AppStateStatus): boolean {
  return state === "active";
}

export function useMobilePushRegistration(): void {
  const { session } = useAuth();

  useEffect(() => {
    // addPushTokenListener throws in Expo Go (push removed since SDK 55).
    if (isExpoGo()) {
      return undefined;
    }
    if (
      !session?.accessToken ||
      (Platform.OS !== "android" && Platform.OS !== "ios")
    ) {
      return undefined;
    }

    let active = true;
    let promptDelay: ReturnType<typeof setTimeout> | null = null;
    let idleTask: { cancel: () => void } | null = null;
    let permissionRetryCount = 0;

    const clearPromptDelay = () => {
      if (promptDelay) {
        clearTimeout(promptDelay);
        promptDelay = null;
      }
    };

    const shouldRetryPermissionPrompt = async () => {
      if (!active || !isForeground(AppState.currentState)) return false;

      const permission = await Notifications.getPermissionsAsync();
      if (permission.granted || permission.status === "granted") {
        return false;
      }
      if (permission.status === "denied" && permission.canAskAgain === false) {
        return false;
      }

      return permissionRetryCount < MAX_PERMISSION_RETRIES;
    };

    const register = async () => {
      if (!active) return;
      const registered = await registerMobilePushDeviceIfPermitted(
        session.accessToken,
      );
      if (registered) {
        permissionRetryCount = 0;
        return;
      }

      if (await shouldRetryPermissionPrompt()) {
        permissionRetryCount += 1;
        clearPromptDelay();
        promptDelay = setTimeout(register, PERMISSION_RETRY_DELAY_MS);
      }
    };

    const registerWhenUiReady = () => {
      if (!active || !isForeground(AppState.currentState)) return;
      idleTask?.cancel();
      clearPromptDelay();
      // Android 13+ drops POST_NOTIFICATIONS if the activity is not resumed.
      idleTask = scheduleIdleTask(() => {
        promptDelay = setTimeout(() => {
          void register();
        }, PERMISSION_PROMPT_DELAY_MS);
      });
    };

    registerWhenUiReady();

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (isForeground(nextState)) registerWhenUiReady();
      },
    );
    return () => {
      active = false;
      idleTask?.cancel();
      clearPromptDelay();
      appStateSubscription.remove();
    };
  }, [session?.accessToken]);
}
