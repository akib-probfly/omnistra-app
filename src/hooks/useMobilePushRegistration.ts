import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import {
  AppState,
  InteractionManager,
  type AppStateStatus,
  Platform,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { registerMobilePushDeviceIfPermitted } from "../lib/mobilePushRegistration";

const PERMISSION_PROMPT_DELAY_MS = 1200;
const PERMISSION_RETRY_DELAY_MS = 1800;
const MAX_PERMISSION_RETRIES = 3;

function isForeground(state: AppStateStatus): boolean {
  return state === "active";
}

export function useMobilePushRegistration(): void {
  const { session } = useAuth();

  useEffect(() => {
    if (
      !session?.accessToken ||
      (Platform.OS !== "android" && Platform.OS !== "ios")
    ) {
      return undefined;
    }

    let active = true;
    let promptDelay: ReturnType<typeof setTimeout> | null = null;
    let interaction: { cancel: () => void } | null = null;
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
      interaction?.cancel();
      clearPromptDelay();
      // Android 13+ drops POST_NOTIFICATIONS if the activity is not resumed.
      interaction = InteractionManager.runAfterInteractions(() => {
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
    const tokenSubscription = Notifications.addPushTokenListener(register);

    return () => {
      active = false;
      interaction?.cancel();
      clearPromptDelay();
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [session?.accessToken]);
}
