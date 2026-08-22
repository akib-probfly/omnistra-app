import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { registerMobilePushDeviceIfPermitted } from "../lib/mobilePushRegistration";

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
    const register = () => {
      if (!active) return;
      void registerMobilePushDeviceIfPermitted();
    };

    register();

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (isForeground(nextState)) register();
      },
    );
    const tokenSubscription = Notifications.addPushTokenListener(register);

    return () => {
      active = false;
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [session?.accessToken]);
}
