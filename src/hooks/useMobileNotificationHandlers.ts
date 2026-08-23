import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { useNotificationPreferences } from './useNotificationPreferences';
import { claimNotification } from '../lib/notification-dedupe';
import { declineConversationCall } from '../api/inbox';
import {
  ANSWER_CALL_ACTION_ID,
  DECLINE_CALL_ACTION_ID,
  dismissIncomingCallNotification,
  ensureIncomingCallCategory,
} from '../lib/call-notification';
import { clearIncomingCallPrompt } from '../lib/incoming-call-prompt';
import {
  navigateFromMobileNotification,
  parseMobileNotificationData,
  reconnectAndRefreshActiveCalls,
  syncNotificationCaches,
} from '../lib/mobile-notification';
import { playNotificationSound } from '../lib/notificationSound';

let foregroundHandlerConfigured = false;

export function configureMobileForegroundNotificationHandler() {
  if (foregroundHandlerConfigured) return;
  foregroundHandlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // Socket.IO updates the open app; never show the same push as a second banner.
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export function useMobileNotificationHandlers() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const preferences = useNotificationPreferences();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  const processNotification = useCallback((notification: Notifications.Notification) => {
    const payload = parseMobileNotificationData(notification.request.content.data);
    if (!payload || !claimNotification(payload.notificationId)) return;

    const currentPreferences = preferencesRef.current;
    syncNotificationCaches(queryClient, payload, {
      showIncomingCallPrompt: currentPreferences.incomingCallAlertsEnabled,
    });

    if (
      payload.type === 'INCOMING_CALL'
      && AppState.currentState === 'active'
      && currentPreferences.isLoaded
      && currentPreferences.incomingCallAlertsEnabled
      && currentPreferences.soundEnabled
    ) {
      void playNotificationSound(payload.type);
    }
  }, [queryClient]);

  const processResponse = useCallback((response: Notifications.NotificationResponse) => {
    const isCallAction =
      response.actionIdentifier === ANSWER_CALL_ACTION_ID
      || response.actionIdentifier === DECLINE_CALL_ACTION_ID;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER && !isCallAction) return;

    const payload = parseMobileNotificationData(response.notification.request.content.data);
    if (!payload) {
      Notifications.clearLastNotificationResponse();
      return;
    }
    if (!claimNotification(payload.notificationId)) {
      Notifications.clearLastNotificationResponse();
      return;
    }

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
    if (payload.type === 'INCOMING_CALL') {
      void dismissIncomingCallNotification(payload.entityId);
      void reconnectAndRefreshActiveCalls(queryClient, payload.conversationId);
    }

    const retryNavigation = (attempt = 0) => {
      if (navigateFromMobileNotification(payload) || attempt >= 10) {
        Notifications.clearLastNotificationResponse();
        return;
      }
      setTimeout(() => retryNavigation(attempt + 1), 100);
    };
    retryNavigation();
  }, [queryClient]);

  useEffect(() => {
    configureMobileForegroundNotificationHandler();
    void ensureIncomingCallCategory();
  }, []);

  useEffect(() => {
    if (!session) return;

    const receivedSubscription = Notifications.addNotificationReceivedListener(processNotification);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(processResponse);
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
