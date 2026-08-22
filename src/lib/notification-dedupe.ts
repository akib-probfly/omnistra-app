const handledNotificationIds = new Set<string>();
const MAX_HANDLED_NOTIFICATION_IDS = 2000;

/** Claim a notification once so a Socket.IO event and its push cannot double-apply it. */
export function claimNotification(notificationId: string) {
  if (handledNotificationIds.has(notificationId)) return false;
  handledNotificationIds.add(notificationId);

  if (handledNotificationIds.size > MAX_HANDLED_NOTIFICATION_IDS) {
    const oldest = handledNotificationIds.values().next().value;
    if (oldest) handledNotificationIds.delete(oldest);
  }

  return true;
}
