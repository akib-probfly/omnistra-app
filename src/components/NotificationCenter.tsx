import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Bell, CheckCheck, MessageSquare, PhoneCall, Trash2, UserMinus, UserRoundCheck, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteAllNotifications,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  notificationQueryKeys,
  type NotificationListItem,
  type NotificationType,
} from '../api/notifications';

function formatNotificationTime(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function getMetadataString(metadata: NotificationListItem['metadata'], key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getNotificationActorLabel(notification: NotificationListItem) {
  const metadata = notification.metadata;
  switch (notification.type) {
    case 'CONVERSATION_ASSIGNED':
    case 'CONVERSATION_UNASSIGNED':
      return getMetadataString(metadata, 'contactDisplayName') ?? getMetadataString(metadata, 'contactPhone') ?? (notification.type === 'CONVERSATION_ASSIGNED' ? 'Conversation assigned' : 'Conversation unassigned');
    case 'INCOMING_CALL':
      return getMetadataString(metadata, 'contactDisplayName') ?? getMetadataString(metadata, 'contactPhone') ?? 'Incoming call';
    case 'NEW_MESSAGE':
    default:
      return getMetadataString(metadata, 'senderDisplayName') ?? getMetadataString(metadata, 'contactDisplayName') ?? getMetadataString(metadata, 'contactPhone') ?? 'New message';
  }
}

function getNotificationContextLabel(notification: NotificationListItem) {
  const channelName = getMetadataString(notification.metadata, 'channelName');
  if (notification.type === 'NEW_MESSAGE') return channelName ?? null;
  if (notification.type === 'CONVERSATION_ASSIGNED' || notification.type === 'CONVERSATION_UNASSIGNED') return channelName ?? 'Conversation';
  if (notification.type === 'INCOMING_CALL') return channelName ?? 'Call';
  return null;
}

function getNotificationRowCopy(notification: NotificationListItem) {
  const title = notification.title?.trim() || 'Notification';
  const actor = getNotificationActorLabel(notification);
  const context = getNotificationContextLabel(notification);
  return { title, body: context ? `${actor} · ${context}` : actor };
}

function getNotificationAppearance(type: NotificationType) {
  switch (type) {
    case 'CONTACT_EXPORT_READY':
    case 'CAMPAIGN_EXPORT_READY':
      return { icon: 'download' as const, wrap: '#dcfce7', accent: '#10b981', iconColor: '#059669' };
    case 'INCOMING_CALL':
      return { icon: 'call' as const, wrap: '#fee2e2', accent: '#ef4444', iconColor: '#dc2626' };
    case 'CONVERSATION_ASSIGNED':
      return { icon: 'assigned' as const, wrap: '#d1fae5', accent: '#10b981', iconColor: '#059669' };
    case 'CONVERSATION_UNASSIGNED':
      return { icon: 'unassigned' as const, wrap: '#fef3c7', accent: '#f59e0b', iconColor: '#d97706' };
    case 'NEW_MESSAGE':
    default:
      return { icon: 'message' as const, wrap: '#dbeafe', accent: '#3b82f6', iconColor: '#2563eb' };
  }
}

function NotificationTypeIcon({ kind, color }: { kind: 'message' | 'call' | 'assigned' | 'unassigned' | 'download'; color: string }) {
  switch (kind) {
    case 'call': return <PhoneCall color={color} size={16} />;
    case 'assigned': return <UserRoundCheck color={color} size={16} />;
    case 'unassigned': return <UserMinus color={color} size={16} />;
    case 'download': return <CheckCheck color={color} size={16} />;
    default: return <MessageSquare color={color} size={16} />;
  }
}

function NotificationRow({ notification, onOpen, onMarkRead }: { notification: NotificationListItem; onOpen: (notification: NotificationListItem) => void; onMarkRead: (notification: NotificationListItem) => void }) {
  const appearance = getNotificationAppearance(notification.type);
  const copy = getNotificationRowCopy(notification);
  const navigable = notification.type !== 'CONTACT_EXPORT_READY' && notification.type !== 'CAMPAIGN_EXPORT_READY';

  return (
    <Pressable
      style={[styles.notificationRow, notification.isUnread && styles.notificationRowUnread]}
      onPress={() => {
        if (notification.isUnread) onMarkRead(notification);
        onOpen(notification);
      }}
    >
      <View style={[styles.notificationAccent, { backgroundColor: notification.isUnread ? appearance.accent : 'transparent' }]} />
      <View style={[styles.notificationIconWrap, { backgroundColor: appearance.wrap }]}>
        <NotificationTypeIcon kind={appearance.icon} color={appearance.iconColor} />
      </View>
      <View style={styles.notificationCopy}>
        <Text style={styles.notificationRowTitle} numberOfLines={1}>{copy.title}</Text>
        <Text style={styles.notificationBody} numberOfLines={2}>{copy.body}</Text>
      </View>
      <View style={styles.notificationMeta}>
        <Text style={styles.notificationTime}>{formatNotificationTime(notification.createdAt)}</Text>
        {notification.isUnread ? <View style={styles.notificationUnreadDot} /> : <View style={styles.notificationReadDot} />}
      </View>
    </Pressable>
  );
}

export function NotificationBell({ onOpen }: { onOpen: () => void }) {
  const unreadQuery = useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: fetchUnreadNotificationCount,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const unreadCount = unreadQuery.data ?? 0;
  const blink = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      void unreadQuery.refetch();
    }, [unreadQuery]),
  );

  useEffect(() => {
    if (unreadCount > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(blink, { toValue: 0.3, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(blink, { toValue: 1, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    blink.setValue(1);
  }, [unreadCount, blink]);

  return (
    <Pressable style={styles.bellButton} onPress={onOpen} hitSlop={8}>
      <Bell color="#64748b" size={18} />
      {unreadCount > 0 ? (
        <Animated.View style={[styles.bellBadge, { opacity: blink }]}>
          <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

export function NotificationCenter({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [optimisticIds, setOptimisticIds] = useState<Set<string>>(new Set());

  const notificationsQuery = useQuery({
    queryKey: notificationQueryKeys.list({ page: 1, limit: 50 }),
    queryFn: () => fetchNotifications({ page: 1, limit: 50 }),
    enabled: visible,
  });
  const unreadCountQuery = useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: fetchUnreadNotificationCount,
    enabled: visible,
  });

  const notifications = useMemo(() => {
    const items = notificationsQuery.data?.items ?? [];
    return items.map((item) => ({ ...item, isUnread: (item.isUnread ?? item.readAt == null) && !optimisticIds.has(item.id) }));
  }, [notificationsQuery.data?.items, optimisticIds]);

  const unreadCount = unreadCountQuery.data ?? 0;

  const markRead = async (notification: NotificationListItem) => {
    setOptimisticIds((current) => new Set(current).add(notification.id));
    try {
      await markNotificationAsRead(notification.id);
      await queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    } catch {
      setOptimisticIds((current) => { const next = new Set(current); next.delete(notification.id); return next; });
    }
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsAsRead();
      await queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    } catch { /* ignore */ }
  };

  const deleteAll = async () => {
    try {
      await deleteAllNotifications();
      await queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });
    } catch { /* ignore */ }
  };

  const handleOpenNotification = (notification: NotificationListItem) => {
    if (notification.conversationId) {
      navigation.navigate('Inbox', { screen: 'Conversation', params: { conversationId: notification.conversationId, contactName: getMetadataString(notification.metadata, 'contactDisplayName') ?? '' } });
    }
    onClose();
  };

  const isLoading = notificationsQuery.isLoading || unreadCountQuery.isLoading;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.notificationOverlay} onPress={onClose}>
        <View style={[styles.notificationSheet, { paddingBottom: insets.bottom + 12 }]} onStartShouldSetResponder={() => true}>
          <View style={styles.notificationHeader}>
            <View style={styles.notificationHeaderCopy}>
              <View style={styles.notificationHeaderIcon}><Bell color="#fff" size={15} /></View>
              <Text style={styles.notificationTitle}>Notifications</Text>
              {unreadCount > 0 ? <View style={styles.unreadPill}><Text style={styles.unreadPillText}>{unreadCount} unread</Text></View> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8}><X color="#64748b" size={20} /></Pressable>
          </View>

          <View style={styles.notificationActions}>
            <Pressable style={[styles.notificationAction, unreadCount === 0 && styles.notificationActionDisabled]} disabled={unreadCount === 0} onPress={() => void markAllRead()}>
              <CheckCheck color="#475569" size={15} /><Text style={styles.notificationActionText}>Mark all read</Text>
            </Pressable>
            <Pressable style={[styles.notificationAction, notifications.length === 0 && styles.notificationActionDisabled]} disabled={notifications.length === 0} onPress={() => void deleteAll()}>
              <Trash2 color="#ef4444" size={15} /><Text style={[styles.notificationActionText, { color: '#ef4444' }]}>Remove all</Text>
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.notificationLoading}><ActivityIndicator color="#2563eb" /></View>
          ) : notifications.length === 0 ? (
            <View style={styles.notificationEmpty}>
              <View style={styles.notificationEmptyIcon}><Bell color="#2563eb" size={22} /></View>
              <Text style={styles.notificationEmptyTitle}>No notifications yet</Text>
              <Text style={styles.notificationEmptyBody}>When messages, assignments, or calls arrive, they will appear here.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.notificationList}>
              {notifications.map((notification) => (
                <NotificationRow key={notification.id} notification={notification} onOpen={handleOpenNotification} onMarkRead={(item) => void markRead(item)} />
              ))}
            </ScrollView>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bellButton: { alignItems: 'center', borderColor: '#d3e0f3', borderRadius: 22, borderWidth: 1, height: 40, justifyContent: 'center', position: 'relative', width: 40 },
  bellBadge: { alignItems: 'center', backgroundColor: '#ef4444', borderRadius: 9, borderColor: '#fff', borderWidth: 1.5, height: 18, justifyContent: 'center', minWidth: 18, paddingHorizontal: 3, position: 'absolute', right: -5, top: -5 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  notificationOverlay: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  notificationSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '82%', overflow: 'hidden' },
  notificationHeader: { alignItems: 'center', borderBottomColor: '#eef2f7', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 16 },
  notificationHeaderCopy: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  notificationHeaderIcon: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 10, height: 30, justifyContent: 'center', width: 30 },
  notificationTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  unreadPill: { alignItems: 'center', backgroundColor: '#dbeafe', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  unreadPillText: { color: '#2563eb', fontSize: 11, fontWeight: '700' },

  notificationActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  notificationAction: { alignItems: 'center', borderColor: '#e2e8f0', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 13, paddingVertical: 8 },
  notificationActionDisabled: { opacity: 0.45 },
  notificationActionText: { color: '#475569', fontSize: 12, fontWeight: '600' },

  notificationList: { flex: 1, paddingHorizontal: 14, paddingTop: 6 },
  notificationLoading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  notificationEmpty: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  notificationEmptyIcon: { alignItems: 'center', backgroundColor: '#dbeafe', borderRadius: 16, height: 52, justifyContent: 'center', width: 52 },
  notificationEmptyTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700', marginTop: 12 },
  notificationEmptyBody: { color: '#64748b', fontSize: 13, lineHeight: 20, marginTop: 6, textAlign: 'center' },

  notificationRow: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginBottom: 8, minHeight: 64, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 10, position: 'relative' },
  notificationRowUnread: { backgroundColor: '#f8faff', borderColor: '#bfdbfe' },
  notificationAccent: { bottom: 0, left: 0, position: 'absolute', top: 0, width: 4 },
  notificationIconWrap: { alignItems: 'center', borderRadius: 12, height: 36, justifyContent: 'center', marginRight: 10, width: 36 },
  notificationCopy: { flex: 1, minWidth: 0 },
  notificationRowTitle: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  notificationBody: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 2 },
  notificationMeta: { alignItems: 'flex-end', gap: 6, marginLeft: 8 },
  notificationTime: { color: '#94a3b8', fontSize: 10, fontWeight: '600' },
  notificationUnreadDot: { backgroundColor: '#3b82f6', borderRadius: 4, height: 8, width: 8 },
  notificationReadDot: { backgroundColor: 'transparent', borderRadius: 4, height: 8, width: 8 },
});
