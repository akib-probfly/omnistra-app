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

const PERMISSION_PROMPT_DELAY_MS = 600;

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

    const register = () => {
      if (!active) return;
      void registerMobilePushDeviceIfPermitted(session.accessToken);
    };

    const registerWhenUiReady = () => {
      if (!active || !isForeground(AppState.currentState)) return;
      interaction?.cancel();
      if (promptDelay) clearTimeout(promptDelay);
      // Android 13+ drops POST_NOTIFICATIONS if the activity is not resumed.
      interaction = InteractionManager.runAfterInteractions(() => {
        promptDelay = setTimeout(register, PERMISSION_PROMPT_DELAY_MS);
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
      if (promptDelay) clearTimeout(promptDelay);
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [session?.accessToken]);
}
