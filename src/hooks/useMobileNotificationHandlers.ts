import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { useNotificationPreferences } from "./useNotificationPreferences";
import { declineConversationCall } from "../api/inbox";
import { claimNotification } from "../lib/notification-dedupe";
import {
  ensureMessageNotificationCategory,
  handleMessageNotificationAction,
  isMessageNotificationAction,
  isSettlingDirectReply,
  NEW_MESSAGE_CATEGORY_ID,
  presentIncomingMessageNotification,
  dismissDuplicateMessageBannersSoon,
  wasPresentedLocally,
} from "../lib/message-notification";
import {
  ANSWER_CALL_ACTION_ID,
  DECLINE_CALL_ACTION_ID,
  dismissIncomingCallNotification,
  ensureIncomingCallCategory,
  INCOMING_CALL_CATEGORY_ID,
  presentIncomingCallNotification,
} from "../lib/call-notification";
import { clearIncomingCallPrompt } from "../lib/incoming-call-prompt";
import {
  navigateFromMobileNotification,
  parseMobileNotificationData,
  flattenRemotePushData,
  reconnectAndRefreshActiveCalls,
  syncNotificationCaches,
} from "../lib/mobile-notification";
import { playNotificationSound } from "../lib/notificationSound";

let foregroundHandlerConfigured = false;

export function configureMobileForegroundNotificationHandler() {
  if (foregroundHandlerConfigured) return;
  foregroundHandlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const incomingData =
        flattenRemotePushData(notification.request.content.data) ?? {};
      // Must still post to the shade so Android can clear the Direct Reply spinner.
      if (
        isSettlingDirectReply(incomingData) ||
        isSettlingDirectReply(notification.request.content.data)
      ) {
        return {
          shouldShowBanner: false,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }

      const data = incomingData;
      const payload = parseMobileNotificationData(data);
      const isEndedCall =
        payload?.type === "INCOMING_CALL" && payload.callEvent === "ENDED";

      if (AppState.currentState === "active") {
        if (isEndedCall) {
          return {
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          };
        }

        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }

      const category = notification.request.content.categoryIdentifier;
      const rawType =
        payload?.type ?? (typeof data.type === "string" ? data.type : "");
      const isIncomingCall =
        category === INCOMING_CALL_CATEGORY_ID || rawType === "INCOMING_CALL";
      const isLocalMessage =
        wasPresentedLocally(data) || category === NEW_MESSAGE_CATEGORY_ID;
      const showBanner = isLocalMessage || isIncomingCall;

      return {
        shouldShowBanner: showBanner,
        shouldShowList: showBanner,
        shouldPlaySound: (isIncomingCall || showBanner) && !isEndedCall,
        shouldSetBadge: false,
        priority: isIncomingCall
          ? Notifications.AndroidNotificationPriority.MAX
          : undefined,
      };
    },
  });
}

export function useMobileNotificationHandlers() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const preferences = useNotificationPreferences();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  const processNotification = useCallback(
    (notification: Notifications.Notification) => {
      const payload = parseMobileNotificationData(
        notification.request.content.data,
      );
      if (!payload) return;

      const claimed = claimNotification(payload.notificationId);
      const currentPreferences = preferencesRef.current;

      if (claimed) {
        syncNotificationCaches(queryClient, payload, {
          showIncomingCallPrompt: currentPreferences.incomingCallAlertsEnabled,
        });
      }

      if (payload.type === "INCOMING_CALL" && payload.callEvent === "ENDED") {
        void dismissIncomingCallNotification(payload.entityId);
      }

      if (
        payload.type === "INCOMING_CALL" &&
        payload.callEvent !== "ENDED" &&
        AppState.currentState !== "active" &&
        !wasPresentedLocally(notification.request.content.data)
      ) {
        const remoteIdentifier = notification.request.identifier;
        void presentIncomingCallNotification(
          payload as Parameters<typeof presentIncomingCallNotification>[0],
        ).then((presented) => {
          if (!presented) return;
          if (remoteIdentifier && remoteIdentifier !== payload.entityId) {
            void Notifications.dismissNotificationAsync(remoteIdentifier).catch(
              () => {},
            );
          }
        });
      }

      if (
        payload.type === "INCOMING_CALL" &&
        payload.callEvent !== "ENDED" &&
        AppState.currentState === "active" &&
        currentPreferences.isLoaded &&
        currentPreferences.incomingCallAlertsEnabled &&
        currentPreferences.soundEnabled
      ) {
        void playNotificationSound(payload.type);
      }

      // Data-only FCM (alertTitle/alertBody) has no OS banner. Present locally
      // even when realtime already claimed the id for cache dedupe.
      if (
        payload.type === "NEW_MESSAGE" &&
        AppState.currentState !== "active" &&
        !wasPresentedLocally(notification.request.content.data)
      ) {
        const remoteIdentifier = notification.request.identifier;
        void presentIncomingMessageNotification(payload).then(() => {
          if (remoteIdentifier && !remoteIdentifier.startsWith("message:")) {
            void Notifications.dismissNotificationAsync(remoteIdentifier).catch(
              () => {},
            );
          }
          dismissDuplicateMessageBannersSoon(payload.conversationId ?? "");
        });
      }
    },
    [queryClient],
  );

  const processResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const isCallAction =
        response.actionIdentifier === ANSWER_CALL_ACTION_ID ||
        response.actionIdentifier === DECLINE_CALL_ACTION_ID;
      if (
        response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
        !isCallAction &&
        !isMessageNotificationAction(response.actionIdentifier)
      ) {
        return;
      }

      if (isMessageNotificationAction(response.actionIdentifier)) {
        void handleMessageNotificationAction(response).then((handled) => {
          if (!handled) return;
          const payload = parseMobileNotificationData(
            response.notification.request.content.data,
          );
          if (payload) {
            syncNotificationCaches(queryClient, payload, {
              showIncomingCallPrompt: false,
            });
          }
          Notifications.clearLastNotificationResponse();
        });
        return;
      }

      const payload = parseMobileNotificationData(
        response.notification.request.content.data,
      );
      if (!payload) {
        Notifications.clearLastNotificationResponse();
        return;
      }
      claimNotification(payload.notificationId);

      if (response.actionIdentifier === DECLINE_CALL_ACTION_ID) {
        clearIncomingCallPrompt(payload.entityId);
        void dismissIncomingCallNotification(payload.entityId);
        if (payload.conversationId) {
          void declineConversationCall({
            conversationId: payload.conversationId,
            callSessionId: payload.entityId,
          }).catch(() => {
            // The call may have already ended on the other side.
          });
        }
        Notifications.clearLastNotificationResponse();
        return;
      }

      const currentPreferences = preferencesRef.current;
      syncNotificationCaches(queryClient, payload, {
        showIncomingCallPrompt: currentPreferences.incomingCallAlertsEnabled,
      });
      if (payload.type === "INCOMING_CALL") {
        if (payload.callEvent !== "ENDED") {
          void dismissIncomingCallNotification(payload.entityId);
          void reconnectAndRefreshActiveCalls(
            queryClient,
            payload.conversationId,
          );
        }
      }

      if (payload.type === "INCOMING_CALL" && payload.callEvent === "ENDED") {
        Notifications.clearLastNotificationResponse();
        return;
      }

      const retryNavigation = (attempt = 0) => {
        if (navigateFromMobileNotification(payload) || attempt >= 10) {
          Notifications.clearLastNotificationResponse();
          return;
        }
        setTimeout(() => retryNavigation(attempt + 1), 100);
      };
      retryNavigation();
    },
    [queryClient],
  );

  useEffect(() => {
    configureMobileForegroundNotificationHandler();
    void ensureIncomingCallCategory();
    void ensureMessageNotificationCategory();
  }, []);

  useEffect(() => {
    if (!session) return;

    const receivedSubscription =
      Notifications.addNotificationReceivedListener(processNotification);
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(processResponse);
    let active = true;

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) processResponse(response);
      })
      .catch(() => {
        // Notification response APIs are unavailable in some development runtimes.
      });

    return () => {
      active = false;
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [processNotification, processResponse, session]);
}
