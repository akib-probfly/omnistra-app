// @ts-nocheck
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Mail, MailOpen, MoreVertical, Phone, Reply, Star, UserRound } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { ContactDetailsPanel } from '../components/ContactDetailsPanel';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, uploadFile } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { getRealtimeConnectionStatus, setActiveConversationId, subscribeRealtimeConnectionStatus } from '../api/realtime';
import { markRecentLocalMessageSend } from '../lib/inbox-realtime-suppression';
import { setUnreadOverride } from '../lib/unread-count-override';
import { ConversationComposer } from '../components/ConversationComposer';
import type { ComposerSendPayload } from '../components/ConversationComposer';
import { ColorfulAvatar } from '../components/ColorfulAvatar';
import { ConversationSkeleton } from '../components/Skeleton';
import { InboxPatternBackground } from '../components/InboxPatternBackground';
import { MediaViewer } from '../components/MediaViewer';
import { VideoPlayerModal } from '../components/VideoPlayer';
import { MessageBubble } from '../components/MessageBubble';
import { AssignmentHistoryItem } from '../components/AssignmentHistoryItem';
import { ReactionPicker } from '../components/ReactionPicker';
import { fetchAssigneeOptions, fetchConversationAssignmentEvents, fetchConversationCallSessions, fetchMessagesPage, markConversationRead, markConversationUnread, sendReaction, sendTemplateMessage, updateConversationAssignment, updateConversationStar, updateConversationStatus, type ConversationCallSession } from '../api/inbox';
import type { InboxStackParamList } from '../navigation/InboxStack';
import { buildConversationTimeline, buildReactionGroups, formatTimelineDayLabel, getConversationTitle, getConversationWindowLabel, getMessengerMessagingAvailability, getVoiceCallButtonState, isInlineReactionMessage, isLiveCallSession, type ConversationTimelineEntry, type MessengerMessagingMode } from '../lib/inbox-utils';
import { CallHistoryItem } from '../components/CallHistoryItem';
import { useCallController } from '../providers/CallControllerProvider';
import { isWhatsappCallSupported } from '../lib/whatsapp-calling';
import { playMessageSentSound } from '../lib/notificationSound';
import { useInboxAppearance } from '../hooks/useInboxAppearance';
import { useTheme } from '../theme/ThemeContext';

type Attachment = { id: string; messageId?: string | null; mediaType: string; mimeType: string; originalName: string | null; downloadUrl: string; previewUrl: string | null; thumbnailUrl: string | null; durationMs: number | null };
type Message = { id: string; workspaceId?: string; direction: 'INBOUND' | 'OUTBOUND'; senderType?: string | null; sender?: { userName?: string | null; userEmail?: string | null } | null; type: string; text: string | null; deliveryStatus?: string; failureReason?: string | null; campaignId?: string | null; campaignName?: string | null; replyToMessageId?: string | null; replyTo?: { sender?: { userName?: string | null } | null; text?: string | null } | null; sentAt?: string | null; createdAt?: string; metadata?: any; attachments?: Attachment[] };
type SendAttachment = { uri: string; name: string; mimeType: string; type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'DOCUMENT' };
type MediaItem = { attachId: string; src: string; mediaType: string };
const apiUrl = (value: string | null) => {
  if (!value) return null;
  const base = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.omnistra.ai/api/v1';
  try {
    const parsed = new URL(value, `${base}/`);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0') {
      const apiBase = new URL(base);
      return `${apiBase.origin}${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return `${base.replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
  }
};

export function ConversationScreen() {
  const insets = useSafeAreaInsets(); const navigation = useNavigation(); const route = useRoute<RouteProp<InboxStackParamList, 'Conversation'>>(); const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const realtimeStatus = useSyncExternalStore(subscribeRealtimeConnectionStatus, getRealtimeConnectionStatus);
  const { session } = useAuth();
  const { colors } = useTheme();
  const callController = useCallController();
  const listRef = useRef<FlatList>(null);
  const [draft, setDraft] = useState(''); const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState<SendAttachment[]>([]);
  const [gallery, setGallery] = useState<MediaItem[]>([]); const [galleryIndex, setGalleryIndex] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [reactTarget, setReactTarget] = useState<Message | null>(null);
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [header, setHeader] = useState({ isStarred: false, unreadCount: 0, status: 'OPEN' as string, conversation: null as any });
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [messengerMessagingMode, setMessengerMessagingMode] = useState<MessengerMessagingMode>('STANDARD');
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedMessengerModeConversationIdRef = useRef<string | null>(null);
  const hasMoreRef = useRef(false);
  const loadOlderRef = useRef<() => Promise<void>>(async () => {});
  const timelineRef = useRef<ConversationTimelineEntry[]>([]);
  const isAtBottomRef = useRef(true);

  const pendingOptimisticRef = useRef<Map<string, Message>>(new Map());
  const awaitingDeliveryRef = useRef(false);
  const deliveryPollUntilRef = useRef(0);

  const updateAwaitingDelivery = (items: Message[]) => {
    const cutoff = Date.now() - 90_000;
    awaitingDeliveryRef.current = items.some((message) => {
      if (message.direction !== 'OUTBOUND') return false;
      const status = message.deliveryStatus ?? '';
      if (status !== 'SENDING' && status !== 'QUEUED' && status !== 'SENT') return false;
      const ts = new Date(message.sentAt ?? message.createdAt ?? 0).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
    if (!awaitingDeliveryRef.current) deliveryPollUntilRef.current = 0;
  };

  const messages = useQuery({
    queryKey: ['messages', route.params.conversationId],
    queryFn: async () => {
      const [page, files] = await Promise.all([
        apiFetch<{ items: Message[]; pageInfo?: { nextCursor?: string | null; hasMore?: boolean }; conversation?: any }>(`/conversations/${route.params.conversationId}/messages?limit=50`),
        apiFetch<{ items: Attachment[] }>(`/conversations/${route.params.conversationId}/attachments?limit=100`),
      ]);
      const grouped = new Map<string, Attachment[]>();
      files.items.forEach((file) => file.messageId && grouped.set(file.messageId, [...(grouped.get(file.messageId) ?? []), file]));
      const items = page.items.map((message) => {
        const messageAttachments = message.attachments?.length ? message.attachments : grouped.get(message.id) ?? [];
        const mediaOnly = messageAttachments.length > 0 && ['IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'DOCUMENT', 'FILE', 'STICKER'].includes(message.type);
        return { ...message, text: mediaOnly ? null : message.text, attachments: messageAttachments };
      });

      // Keep in-flight optimistic bubbles across polling/refetch overwrites.
      const serverIds = new Set(items.map((item) => item.id));
      pendingOptimisticRef.current.forEach((optimistic, tempId) => {
        const serverId = typeof optimistic.metadata?.serverId === 'string' ? optimistic.metadata.serverId : null;
        const clientKey = typeof optimistic.metadata?.clientKey === 'string' ? optimistic.metadata.clientKey : tempId;
        if (serverId && serverIds.has(serverId)) {
          const idx = items.findIndex((item) => item.id === serverId);
          if (idx >= 0) {
            items[idx] = {
              ...items[idx],
              metadata: {
                ...(typeof items[idx].metadata === 'object' && items[idx].metadata ? items[idx].metadata : {}),
                clientKey,
              },
            };
          }
          pendingOptimisticRef.current.delete(tempId);
          return;
        }
        if (!serverIds.has(tempId) && !items.some((item) => item.metadata?.clientKey === clientKey)) {
          items.push(optimistic);
        }
      });

      updateAwaitingDelivery(items);

      return { items, nextCursor: page.pageInfo?.nextCursor ?? null, hasMore: page.pageInfo?.hasMore ?? false, conversation: page.conversation ?? null };
    },
    enabled: isFocused,
    staleTime: 0,
    // Realtime updates the open thread; keep a slow poll as a safety net for zombie sockets.
    // Briefly poll faster after send for delivery receipts.
    refetchInterval: () => {
      if (!isFocused) return false;
      if (pendingOptimisticRef.current.size > 0) return 2500;
      if (awaitingDeliveryRef.current && Date.now() < deliveryPollUntilRef.current) return 2500;
      return realtimeStatus === 'connected' ? 45_000 : 15_000;
    },
    refetchOnWindowFocus: false,
  });

  const unreadCountOverridden = useRef(false);
  const suppressAutoMarkReadRef = useRef(false);
  const lastAutoMarkedReadSignatureRef = useRef<string | null>(null);
  const manualReadToggleRef = useRef(false);

  useEffect(() => {
    unreadCountOverridden.current = false;
    suppressAutoMarkReadRef.current = false;
    lastAutoMarkedReadSignatureRef.current = null;
    awaitingDeliveryRef.current = false;
    deliveryPollUntilRef.current = 0;
    setOlderMessages([]);
    setOlderCursor(null);
  }, [route.params.conversationId]);

  useEffect(() => {
    if (messages.data?.conversation) {
      setHeader((current) => ({
        ...current,
        conversation: messages.data.conversation,
        isStarred: messages.data.conversation.isStarred ?? current.isStarred,
        unreadCount: (unreadCountOverridden.current ? current.unreadCount : null) ?? messages.data.conversation.unreadCount ?? current.unreadCount,
        status: messages.data.conversation.status ?? current.status,
      }));
    }
  }, [messages.data?.conversation]);

  useEffect(() => {
    updateAwaitingDelivery(messages.data?.items ?? []);
  }, [messages.data?.items]);

  const allMessages = useMemo(() => {
    const seen = new Set<string>();
    const merged: Message[] = [];
    [...olderMessages, ...(messages.data?.items ?? [])].forEach((message) => {
      const key = typeof message.metadata?.clientKey === 'string' ? message.metadata.clientKey : message.id;
      if (seen.has(key) || seen.has(message.id)) return;
      seen.add(key);
      seen.add(message.id);
      merged.push(message);
    });
    return merged;
  }, [olderMessages, messages.data?.items]);
  hasMoreRef.current = messages.data?.hasMore ?? false;
  const reactionGroups = useMemo(() => buildReactionGroups(allMessages), [allMessages]);

  const messageById = useMemo(() => { const map = new Map<string, Message>(); allMessages.forEach((message) => map.set(message.id, message)); return map; }, [allMessages]);

  const send = useMutation({
    mutationFn: async (payload?: ComposerSendPayload) => {
      const selectedAttachments = payload?.attachments ?? attachments;
      const draftText = payload?.text !== undefined ? payload.text : draft;
      const workspaceId = route.params.workspaceId ?? allMessages.find((message) => message.workspaceId)?.workspaceId;
      if (!workspaceId && selectedAttachments.length) throw new Error('Workspace information is unavailable. Please reload the conversation.');
      const attachmentIds: string[] = [];
      for (const selected of selectedAttachments) {
        const uploaded = await uploadFile('/files/upload', selected.uri, selected.name, selected.mimeType, { workspaceId });
        attachmentIds.push(uploaded.id);
      }
      const text = draftText.replace(/\u200B/g, '').trim() || undefined;
      const type = selectedAttachments.length ? (selectedAttachments[0].type === 'VOICE' ? 'VOICE' : selectedAttachments[0].type) : 'TEXT';
      const channelTypeForSend = (header.conversation?.channel?.channelType ?? route.params.channelType ?? '').toUpperCase();
      const response = await apiFetch<any>(`/conversations/${route.params.conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          type,
          text,
          attachmentIds,
          replyToMessageId: replyTo?.id,
          ...(channelTypeForSend === 'MESSENGER' ? { messengerMessagingMode } : {}),
        }),
      });
      // API returns { message, messages, conversation } — not a bare message.
      const created: Message | null = response?.message
        ?? (Array.isArray(response?.messages) ? response.messages[0] : null)
        ?? (response?.id && response?.direction ? response : null);
      if (!created?.id) throw new Error('Message was sent but the server response was incomplete.');
      return created;
    },
    onMutate: async (payload) => {
      const selectedAttachments = payload?.attachments ?? attachments;
      const draftText = payload?.text !== undefined ? payload.text : draft;
      await queryClient.cancelQueries({ queryKey: ['messages', route.params.conversationId] });
      const previous = queryClient.getQueryData<any>(['messages', route.params.conversationId]);
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const clientKey = tempId;
      const text = draftText.replace(/\u200B/g, '').trim() || undefined;
      const type = selectedAttachments.length ? (selectedAttachments[0].type === 'VOICE' ? 'VOICE' : selectedAttachments[0].type) : 'TEXT';
      const optimistic: Message = {
        id: tempId,
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        type,
        text: text ?? null,
        deliveryStatus: 'SENDING',
        sender: { userName: session?.user?.name ?? 'You' },
        replyToMessageId: replyTo?.id ?? null,
        replyTo: replyTo ? { sender: replyTo.sender ?? null, text: replyTo.text } : undefined,
        createdAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
        metadata: { optimistic: true, clientKey },
        attachments: selectedAttachments.map((selected) => ({
          id: `${tempId}-${selected.uri}`,
          mediaType: selected.type,
          mimeType: selected.mimeType,
          originalName: selected.name,
          downloadUrl: selected.uri,
          previewUrl: selected.type === 'IMAGE' || selected.type === 'VIDEO' ? selected.uri : null,
          thumbnailUrl: selected.type === 'IMAGE' || selected.type === 'VIDEO' ? selected.uri : null,
          durationMs: null,
        })),
      };
      pendingOptimisticRef.current.set(tempId, optimistic);
      setDraft(''); setAttachments([]); setReplyTo(null);
      queryClient.setQueryData<any>(['messages', route.params.conversationId], (current) => {
        if (!current || !Array.isArray(current.items)) return current;
        return { ...current, items: [...current.items, optimistic] };
      });
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
      return {
        tempId,
        clientKey,
        previous,
        previousDraft: draft,
        previousAttachments: payload?.attachments ?? attachments,
        previousReplyTo: replyTo,
      };
    },
    onSuccess: (created, _vars, context) => {
      markRecentLocalMessageSend(route.params.conversationId, created.id);
      awaitingDeliveryRef.current = true;
      deliveryPollUntilRef.current = Date.now() + 45_000;
      const clientKey = context?.clientKey ?? context?.tempId;
      const confirmed: Message = {
        ...created,
        deliveryStatus: created.deliveryStatus && created.deliveryStatus !== 'SENDING' ? created.deliveryStatus : 'SENT',
        metadata: {
          ...(typeof created.metadata === 'object' && created.metadata ? created.metadata : {}),
          clientKey,
          optimistic: false,
        },
      };
      // Keep until a later refetch sees the server id — preserves clientKey / avoids blink.
      if (context?.tempId) {
        pendingOptimisticRef.current.set(context.tempId, {
          ...confirmed,
          metadata: { ...confirmed.metadata, serverId: confirmed.id, clientKey },
        });
      }
      queryClient.setQueryData<any>(['messages', route.params.conversationId], (current) => {
        if (!current || !Array.isArray(current.items)) return current;
        let replaced = false;
        const items = current.items.map((item: any) => {
          if (item.id === context?.tempId || item.metadata?.clientKey === clientKey || item.id === confirmed.id) {
            replaced = true;
            return confirmed;
          }
          return item;
        });
        if (!replaced) items.push(confirmed);
        // Drop any duplicate server copy that arrived from a racey refetch.
        const deduped: Message[] = [];
        const seen = new Set<string>();
        items.forEach((item: any) => {
          const key = item.metadata?.clientKey || item.id;
          if (seen.has(key) || seen.has(item.id)) return;
          seen.add(key);
          seen.add(item.id);
          deduped.push(item);
        });
        return { ...current, items: deduped };
      });
      // Soft-refresh inbox list only — avoid wiping the thread cache (that caused the blink).
      void queryClient.invalidateQueries({ queryKey: ['conversations'], refetchType: 'active' });
      void playMessageSentSound();
    },
    onError: (error, _vars, context) => {
      if (context?.tempId) pendingOptimisticRef.current.delete(context.tempId);
      queryClient.setQueryData<any>(['messages', route.params.conversationId], (current) => {
        if (!current || !Array.isArray(current.items)) return current;
        return {
          ...current,
          items: current.items.filter((item: any) => item.id !== context?.tempId && item.metadata?.clientKey !== context?.clientKey),
        };
      });
      if (context?.previousDraft) setDraft(context.previousDraft);
      if (context?.previousAttachments?.length) setAttachments(context.previousAttachments);
      if (context?.previousReplyTo) setReplyTo(context.previousReplyTo);
      Alert.alert('Could not send message', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const reactMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) => sendReaction(route.params.conversationId, messageId, emoji, 'REACT'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['messages', route.params.conversationId], refetchType: 'active' }); },
  });

  const starMutation = useMutation({ mutationFn: (isStarred: boolean) => updateConversationStar(route.params.conversationId, isStarred), onSuccess: (_, isStarred) => setHeader((c) => ({ ...c, isStarred })) });
  const readMutation = useMutation({
    mutationFn: () => markConversationRead(route.params.conversationId),
    onMutate: () => {
      suppressAutoMarkReadRef.current = false;
      const previousUnreadCount = header.unreadCount;
      unreadCountOverridden.current = true;
      setUnreadOverride(route.params.conversationId, 0);
      setHeader((c) => ({ ...c, unreadCount: 0 }));
      setConversationUnreadInCache(queryClient, route.params.conversationId, 0);
      adjustInboxUnreadCount(queryClient, -previousUnreadCount);
      return { previousUnreadCount };
    },
    onError: (error, _vars, context) => {
      const previousUnreadCount = context?.previousUnreadCount ?? 0;
      unreadCountOverridden.current = true;
      setUnreadOverride(route.params.conversationId, previousUnreadCount);
      setHeader((c) => ({ ...c, unreadCount: previousUnreadCount }));
      setConversationUnreadInCache(queryClient, route.params.conversationId, previousUnreadCount);
      adjustInboxUnreadCount(queryClient, previousUnreadCount);
      lastAutoMarkedReadSignatureRef.current = null;
      if (manualReadToggleRef.current) {
        Alert.alert('Could not mark as read', error instanceof Error ? error.message : 'Please try again.');
      }
      manualReadToggleRef.current = false;
    },
    onSuccess: (updated) => {
      const nextUnread = typeof updated?.unreadCount === 'number' ? updated.unreadCount : 0;
      unreadCountOverridden.current = true;
      setUnreadOverride(route.params.conversationId, nextUnread);
      setHeader((c) => ({ ...c, unreadCount: nextUnread }));
      setConversationUnreadInCache(queryClient, route.params.conversationId, nextUnread);
      manualReadToggleRef.current = false;
    },
  });
  const unreadMutation = useMutation({
    mutationFn: () => markConversationUnread(route.params.conversationId),
    onMutate: () => {
      // Stay on the latest messages while viewing — don't auto-read again after a manual unread.
      suppressAutoMarkReadRef.current = true;
      lastAutoMarkedReadSignatureRef.current = null;
      manualReadToggleRef.current = true;
      const previousUnreadCount = header.unreadCount;
      const nextUnreadCount = Math.max(1, previousUnreadCount);
      unreadCountOverridden.current = true;
      setUnreadOverride(route.params.conversationId, nextUnreadCount);
      setHeader((c) => ({ ...c, unreadCount: nextUnreadCount }));
      setConversationUnreadInCache(queryClient, route.params.conversationId, nextUnreadCount);
      adjustInboxUnreadCount(queryClient, nextUnreadCount - previousUnreadCount);
      return { previousUnreadCount };
    },
    onError: (error, _vars, context) => {
      const previousUnreadCount = context?.previousUnreadCount ?? 0;
      suppressAutoMarkReadRef.current = false;
      unreadCountOverridden.current = true;
      setUnreadOverride(route.params.conversationId, previousUnreadCount);
      setHeader((c) => ({ ...c, unreadCount: previousUnreadCount }));
      setConversationUnreadInCache(queryClient, route.params.conversationId, previousUnreadCount);
      adjustInboxUnreadCount(queryClient, previousUnreadCount - Math.max(1, previousUnreadCount));
      Alert.alert('Could not mark as unread', error instanceof Error ? error.message : 'Please try again.');
      manualReadToggleRef.current = false;
    },
    onSuccess: (updated) => {
      const nextUnread = typeof updated?.unreadCount === 'number' ? Math.max(1, updated.unreadCount) : 1;
      unreadCountOverridden.current = true;
      setUnreadOverride(route.params.conversationId, nextUnread);
      setHeader((c) => ({ ...c, unreadCount: nextUnread }));
      setConversationUnreadInCache(queryClient, route.params.conversationId, nextUnread);
      manualReadToggleRef.current = false;
    },
  });
  const statusMutation = useMutation({ mutationFn: (status: string) => updateConversationStatus(route.params.conversationId, status as 'OPEN' | 'CLOSED'), onSuccess: (_, status) => setHeader((c) => ({ ...c, status })) });
  const assignmentMutation = useMutation({
    mutationFn: (assigneeWorkspaceMemberId: string | null) => updateConversationAssignment(route.params.conversationId, assigneeWorkspaceMemberId),
    onSuccess: (_, assigneeWorkspaceMemberId) => {
      const conversation = header.conversation as any;
      const assignee = assigneeWorkspaceMemberId ? { ...(conversation?.assignee ?? {}), workspaceMemberId: assigneeWorkspaceMemberId } : null;
      setHeader((c) => ({ ...c, conversation: { ...(c.conversation ?? {}), assignee } }));
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['assignment-events', route.params.conversationId], refetchType: 'all' });
    },
    onError: (error: Error) => Alert.alert('Could not update assignment', error.message),
  });

  useEffect(() => {
    if (!header.conversation || messages.isLoading || messages.isError) return;
    if (header.unreadCount <= 0 || readMutation.isPending) return;
    if (!atBottom) return;
    if (suppressAutoMarkReadRef.current) return;

    const signature = `${route.params.conversationId}:${header.unreadCount}:${header.conversation.updatedAt ?? ''}`;
    if (lastAutoMarkedReadSignatureRef.current === signature) return;
    lastAutoMarkedReadSignatureRef.current = signature;
    readMutation.mutate(undefined, {
      onError: () => {
        lastAutoMarkedReadSignatureRef.current = null;
      },
    });
  }, [header.conversation, header.unreadCount, messages.isLoading, messages.isError, atBottom, readMutation.isPending, route.params.conversationId]);

  useEffect(() => {
    setActiveConversationId(route.params.conversationId);
    return () => setActiveConversationId(null);
  }, [route.params.conversationId]);

  useEffect(() => () => { if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); }, []);

  useEffect(() => { if (olderCursor && !messages.data?.hasMore && olderMessages.length === 0) setOlderCursor(null); }, [olderCursor, messages.data?.hasMore, olderMessages.length]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !olderCursor || messages.data?.hasMore === false) return;
    setLoadingOlder(true);
    try {
      const page = await fetchMessagesPage(route.params.conversationId, olderCursor, 50);
      const files = await apiFetch<{ items: Attachment[] }>(`/conversations/${route.params.conversationId}/attachments?limit=100`);
      const grouped = new Map<string, Attachment[]>();
      files.items.forEach((file) => file.messageId && grouped.set(file.messageId, [...(grouped.get(file.messageId) ?? []), file]));
      const items = page.items.map((message: any) => {
        const messageAttachments = message.attachments?.length ? message.attachments : grouped.get(message.id) ?? [];
        const mediaOnly = messageAttachments.length > 0 && ['IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'DOCUMENT', 'FILE', 'STICKER'].includes(message.type);
        return { ...message, text: mediaOnly ? null : message.text, attachments: messageAttachments };
      });
      setOlderMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        const fresh = items.filter((message) => !existing.has(message.id));
        return [...fresh, ...current];
      });
      setOlderCursor(page.pageInfo?.nextCursor ?? null);
    } catch (error) {
      console.error('[conversation] load older failed', error);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, olderCursor, messages.data?.hasMore, route.params.conversationId]);

  loadOlderRef.current = loadOlder;

  const clearHighlight = useCallback(() => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    setHighlightedMessageId(null);
  }, []);

  const highlightMessage = useCallback((messageId: string) => {
    clearHighlight();
    setHighlightedMessageId(messageId);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current));
    }, 1800);
  }, [clearHighlight]);

  const jumpToMessage = useCallback((messageId: string) => {
    const scrollToTarget = () => {
      const chronologicalIndex = timelineRef.current.findIndex((entry) => entry.kind === 'message' && entry.message.id === messageId);
      if (chronologicalIndex < 0) return false;
      const index = timelineRef.current.length - 1 - chronologicalIndex;
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      highlightMessage(messageId);
      return true;
    };

    if (scrollToTarget()) return;

    if (!hasMoreRef.current) return;

    (async () => {
      let guard = 0;
      while (hasMoreRef.current && guard < 20) {
        guard += 1;
        await loadOlderRef.current();
        await new Promise((resolve) => setTimeout(resolve, 120));
        if (scrollToTarget()) return;
      }
    })();
  }, [highlightMessage]);

  useEffect(() => {
    if (messages.data && !messages.data.hasMore) return;
    if (messages.data?.nextCursor && !olderCursor) setOlderCursor(messages.data.nextCursor);
  }, [messages.data, olderCursor]);

  const imageUrls = useMemo(() => allMessages.flatMap((message) => (message.attachments ?? []).filter((attachment) => ['IMAGE', 'STICKER'].includes(attachment.mediaType.toUpperCase()) || attachment.mimeType?.startsWith('image/')).map((attachment) => {
    const raw = attachment.downloadUrl || attachment.previewUrl || attachment.thumbnailUrl;
    const preferred = typeof raw === 'string' ? raw.replace(/\/preview\/?(?:\?.*)?$/i, '/download') : raw;
    const src = apiUrl(preferred);
    return src ? { attachId: attachment.id, src, mediaType: attachment.mediaType } as MediaItem : null;
  }).filter((item): item is MediaItem => Boolean(item))), [allMessages]);

  const openImage = useCallback((attachId: string) => {
    setGallery(imageUrls);
    setGalleryIndex(Math.max(0, imageUrls.findIndex((media) => media.attachId === attachId)));
  }, [imageUrls]);

  const openVideo = useCallback((attachment: { downloadUrl: string; previewUrl?: string | null }) => {
    setVideoUrl(apiUrl(attachment.downloadUrl ?? attachment.previewUrl ?? null));
  }, []);

  const { pattern: inboxPattern } = useInboxAppearance();
  const channelType = header.conversation?.channel?.channelType ?? route.params.channelType;
  const channelId = header.conversation?.channel?.channelId ?? header.conversation?.channel?.id ?? route.params.channelId;
  const isWhatsAppConversation = (channelType ?? '').toUpperCase() === 'WHATSAPP';
  const isMessengerConversation = (channelType ?? '').toUpperCase() === 'MESSENGER';
  const messengerAvailability = getMessengerMessagingAvailability(header.conversation);
  const canSendSelectedMessengerMode = messengerMessagingMode === 'STANDARD'
    ? messengerAvailability.canSendStandardMessage
    : messengerAvailability.canSendHumanAgentMessage;
  const canSendFreeform = isMessengerConversation
    ? canSendSelectedMessengerMode
    : header.conversation?.messaging?.canSendFreeformMessage;
  const windowInfo = getConversationWindowLabel(header.conversation, messengerMessagingMode);
  const title = getConversationTitle(header.conversation, route.params.contactName);

  useEffect(() => {
    const conversationId = route.params.conversationId;
    if (!isMessengerConversation || !header.conversation) {
      initializedMessengerModeConversationIdRef.current = null;
      if (!isMessengerConversation) setMessengerMessagingMode('STANDARD');
      return;
    }
    if (initializedMessengerModeConversationIdRef.current === conversationId) return;
    initializedMessengerModeConversationIdRef.current = conversationId;
    const availability = getMessengerMessagingAvailability(header.conversation);
    setMessengerMessagingMode(availability.canSendStandardMessage ? 'STANDARD' : 'HUMAN_AGENT');
  }, [
    header.conversation,
    isMessengerConversation,
    route.params.conversationId,
    header.conversation?.messaging?.standardWindowExpiresAt,
    header.conversation?.messaging?.humanAgentWindowExpiresAt,
  ]);

  useEffect(() => {
    if (!isMessengerConversation || !header.conversation) return;
    if (messengerMessagingMode === 'STANDARD' && !messengerAvailability.canSendStandardMessage && messengerAvailability.canSendHumanAgentMessage) {
      setMessengerMessagingMode('HUMAN_AGENT');
    }
  }, [
    isMessengerConversation,
    messengerMessagingMode,
    messengerAvailability.canSendStandardMessage,
    messengerAvailability.canSendHumanAgentMessage,
    header.conversation,
  ]);
  const assigneeLabel = header.conversation?.assignee?.userName ?? header.conversation?.assignee?.userEmail ?? (header.conversation?.assignee ? 'Assigned agent' : 'Unassigned');

  const callsQuery = useQuery({
    queryKey: ['conversation-calls', route.params.conversationId],
    queryFn: () => fetchConversationCallSessions({ conversationId: route.params.conversationId, limit: 10 }),
    enabled: isWhatsAppConversation,
    staleTime: 30000,
  });
  const callSessions: ConversationCallSession[] = callsQuery.data?.items ?? [];
  const assignmentHistoryQuery = useQuery({
    queryKey: ['assignment-events', route.params.conversationId],
    queryFn: () => fetchConversationAssignmentEvents({ conversationId: route.params.conversationId, limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });
  const assignmentEvents = assignmentHistoryQuery.data?.items ?? [];
  // Match web: only RINGING/CONNECTED count as an active call for the start-call button.
  // PERMISSION_REQUESTED is handled separately via latestCallSession (granted → enable).
  const activeCallSession = useMemo(
    () => callSessions.find(
      (session) => isLiveCallSession(session) && (session.status === 'RINGING' || session.status === 'CONNECTED'),
    ) ?? null,
    [callSessions],
  );
  const latestCallSession = callSessions[0] ?? null;
  // Match web agent behavior: do not gate the call button on channel-details calling
  // settings. Web only loads those for workspace admin/manager; agents see the button
  // enabled and the backend enforces calling capability on start.
  const voiceCallButton = getVoiceCallButtonState({
    isWhatsAppConversation,
    canManageCalls: Boolean(session),
    isCallSessionsLoading: callsQuery.isLoading && !callsQuery.data,
    isCallControllerBusy: callController.isBusy,
    activeCallSession,
    latestCallSession,
    businessCallingDisabledReason: null,
    businessCallingStatus: null,
  });
  const startVoiceCall = async () => {
    if (!voiceCallButton.canStartVoiceCall) {
      Toast.show({ type: 'info', text1: 'Unable to start call', text2: voiceCallButton.tooltipMessage });
      return;
    }
    if (!isWhatsappCallSupported()) {
      Toast.show({
        type: 'error',
        text1: 'Custom build required',
        text2: 'WhatsApp calling needs a development build with WebRTC (not Expo Go).',
      });
      return;
    }
    await callController.startOutboundCall({ conversationId: route.params.conversationId });
    void queryClient.invalidateQueries({ queryKey: ['conversation-calls', route.params.conversationId] });
    void queryClient.invalidateQueries({ queryKey: ['active-calls'] });
  };
  const timeline = useMemo<ConversationTimelineEntry[]>(
    () => buildConversationTimeline(allMessages, callSessions, assignmentEvents),
    [allMessages, callSessions, assignmentEvents],
  );
  timelineRef.current = timeline;
  const displayEntries = useMemo(() => {
    const reversed = [...timeline].reverse();
    return reversed.map((entry, index) => {
      const previous = timeline[timeline.length - 1 - index - 1];
      const showDivider = !previous || new Date(previous.timestamp).toDateString() !== new Date(entry.timestamp).toDateString();
      return { entry, showDivider };
    });
  }, [timeline]);

  const assignToMe = async () => {
    setMenuOpen(false);
    const userEmail = session?.user?.email?.toLowerCase();
    if (!userEmail) {
      Alert.alert('Unable to assign', 'Your user account is not available.');
      return;
    }
    try {
      const workspaceId = header.conversation?.workspaceId ?? route.params.workspaceId;
      const options = await fetchAssigneeOptions(workspaceId, channelId);
      const match = options.find((member) => member.email.toLowerCase() === userEmail);
      if (!match) {
        Alert.alert('Unable to assign', 'Could not find your workspace member profile.');
        return;
      }
      assignmentMutation.mutate(match.workspaceMemberId);
    } catch (error) {
      Alert.alert('Could not assign', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const onScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const atBottom = contentOffset.y < 120;
    isAtBottomRef.current = atBottom;
    setAtBottom(atBottom);
    if (contentOffset.y > contentSize.height - layoutMeasurement.height - 120) loadOlder();
  };

  const channelName = header.conversation?.channel?.channelName ?? null;
  const renderMessage = ({ item }: { item: Message }) => <SwipeableMessage message={item} channelName={channelName} setReplyTo={setReplyTo} setReactTarget={setReactTarget} onImage={openImage} onVideo={openVideo} replyTarget={messageById.get(item.replyToMessageId ?? '') ?? null} reactions={reactionGroups[item.id]} onJumpToMessage={jumpToMessage} />;

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background, flex: 1 }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <Pressable onPress={() => navigation.navigate('Inbox', { screen: 'InboxList' })}><ArrowLeft color={colors.textSecondary} size={23} /></Pressable>
        <View style={styles.avatarWrap}>
          <ColorfulAvatar
            name={title}
            size={42}
            url={header.conversation?.contact?.avatarUrl ?? null}
          />
          <View style={[styles.presence, { borderColor: colors.surface }]} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.window, windowInfo.tone === 'expired' && styles.windowExpired, windowInfo.tone === 'expired' && { color: colors.error }]}>{windowInfo.label}</Text>
          <Text style={[styles.assignee, { color: colors.textMuted }]} numberOfLines={1}>{assigneeLabel}</Text>
        </View>
        {isWhatsAppConversation ? (
          <Pressable
            onPress={startVoiceCall}
            hitSlop={8}
            style={!voiceCallButton.canStartVoiceCall || callController.isBusy ? { opacity: 0.35 } : undefined}
          >
            <Phone color={voiceCallButton.canStartVoiceCall && !callController.isBusy ? colors.primary : colors.textMuted} size={19} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => starMutation.mutate(!header.isStarred)} hitSlop={8}><Star color={header.isStarred ? '#f59e0b' : colors.textMuted} fill={header.isStarred ? '#f59e0b' : 'none'} size={19} /></Pressable>
        <Pressable
          onPress={() => {
            if (readMutation.isPending || unreadMutation.isPending) return;
            if (header.unreadCount > 0) {
              manualReadToggleRef.current = true;
              readMutation.mutate();
            } else {
              unreadMutation.mutate();
            }
          }}
          hitSlop={8}
        >
          {header.unreadCount > 0 ? <Mail color={colors.textSecondary} size={19} /> : <MailOpen color={colors.textSecondary} size={19} />}
        </Pressable>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={8}><UserRound color={colors.textSecondary} size={19} /></Pressable>
        <Pressable onPress={() => setDetailsOpen(true)} hitSlop={8}><MoreVertical color={colors.textSecondary} size={19} /></Pressable>
      </View>
      <View style={styles.body}>
        <InboxPatternBackground pattern={inboxPattern} />
        <View style={styles.listWrap}>
          {messages.isLoading ? <ConversationSkeleton /> : (
            <>
              <FlatList
                ref={listRef}
                style={styles.list}
                data={displayEntries}
                extraData={allMessages.map((message) => `${message.id}:${message.deliveryStatus ?? ''}`).join('|')}
                inverted
                keyExtractor={(entry) => `${entry.entry.kind}:${entry.entry.id}`}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                onScroll={onScroll}
                scrollEventThrottle={120}
                onContentSizeChange={() => { if (isAtBottomRef.current) listRef.current?.scrollToOffset({ offset: 0, animated: false }); }}
                ListFooterComponent={loadingOlder ? <Text style={[styles.olderPill, { color: colors.textSecondary }]}>Loading older messages...</Text> : null}
                renderItem={({ item }) => {
                  const { entry, showDivider } = item;
                  const highlighted = entry.kind === 'message' && entry.message.id === highlightedMessageId;
                  return (
                    <View style={highlighted ? styles.highlightRow : undefined}>
                      {showDivider ? <Text style={[styles.dayDivider, { backgroundColor: colors.surfaceSecondary, color: colors.textSecondary }]}>{formatTimelineDayLabel(new Date(entry.timestamp))}</Text> : null}
                      {entry.kind === 'call' ? (
                        <CallHistoryItem session={entry.session} />
                      ) : entry.kind === 'assignment' ? (
                        <AssignmentHistoryItem event={entry.event} />
                      ) : (
                        renderMessage({ item: entry.message })
                      )}
                    </View>
                  );
                }}
                onScrollToIndexFailed={({ index, averageItemLength }) => {
                  listRef.current?.scrollToOffset({ offset: Math.max(0, index * averageItemLength), animated: false });
                  setTimeout(() => {
                    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
                    const entry = displayEntries[index]?.entry;
                    if (entry?.kind === 'message') highlightMessage(entry.message.id);
                  }, 120);
                }}
              />
              {!atBottom ? (
                <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}><ChevronDown color="#fff" size={22} /></Pressable>
              ) : null}
            </>
          )}
        </View>
        {messages.isError ? <Text style={[styles.error, { color: colors.error }]}>{messages.error instanceof Error ? messages.error.message : 'Unable to load messages.'}</Text> : null}
        <ConversationComposer
          value={draft} onChange={setDraft} sending={send.isPending}
          attachments={attachments} onAttachments={setAttachments}
          workspaceId={route.params.workspaceId ?? header.conversation?.workspaceId}
          channelId={channelId} channelType={channelType} contactName={title}
          onSendTemplate={(params) => sendTemplateMutation(route.params.conversationId, params, queryClient, setDraft)}
          replyPreview={replyTo ? { name: replyTo.direction === 'INBOUND' ? title : 'You', text: replyTo.text ?? 'Attachment' } : null}
          onCancelReply={() => setReplyTo(null)}
          onSend={(payload) => { if (!send.isPending) send.mutate(payload); }}
          canSendFreeform={canSendFreeform}
          messengerMessagingMode={messengerMessagingMode}
          onMessengerMessagingModeChange={setMessengerMessagingMode}
          canSendStandardMessage={messengerAvailability.canSendStandardMessage}
          canSendHumanAgentMessage={messengerAvailability.canSendHumanAgentMessage}
        />
      </View>
      <ReactionPicker
        visible={Boolean(reactTarget)}
        onClose={() => setReactTarget(null)}
        onPick={(emoji) => { if (reactTarget) reactMutation.mutate({ messageId: reactTarget.id, emoji }); setReactTarget(null); }}
        onReply={() => { if (reactTarget) setReplyTo(reactTarget); setReactTarget(null); }}
        onCopy={reactTarget?.text ? () => {
          const text = reactTarget.text ?? '';
          setReactTarget(null);
          void Clipboard.setStringAsync(text);
          Toast.show({ type: 'copy', text1: 'Copied', position: 'bottom', visibilityTime: 1600 });
        } : undefined}
      />
      <MediaViewer images={gallery} index={galleryIndex} onClose={() => setGallery([])} onIndex={setGalleryIndex} />
      <VideoPlayerModal url={videoUrl} visible={Boolean(videoUrl)} onClose={() => setVideoUrl(null)} />
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.menuTitle, { color: colors.text }]}>{title}</Text>
            <View style={styles.menuRow}>
              <Text style={[styles.menuLabel, { color: colors.textSecondary }]}>Assigned to</Text>
              <Text style={[styles.menuValue, { color: colors.text }]}>{assigneeLabel}</Text>
            </View>
            <View style={styles.menuRow}>
              <Text style={[styles.menuLabel, { color: colors.textSecondary }]}>Status</Text>
              <Text style={[styles.menuValue, { color: colors.text }, header.status === 'CLOSED' && styles.menuClosed, header.status === 'CLOSED' && { color: colors.error }]}>{header.status === 'CLOSED' ? 'Closed' : 'Open'}</Text>
            </View>
            <View style={[styles.menuDivider, { backgroundColor: colors.separator }]} />
            <Pressable style={[styles.menuAction, { backgroundColor: colors.surfaceSecondary }]} onPress={assignToMe}>
              <Text style={[styles.menuActionText, { color: colors.primary }]}>Assign to me</Text>
            </Pressable>
            {header.conversation?.assignee ? (
              <Pressable style={[styles.menuAction, { backgroundColor: colors.surfaceSecondary }]} onPress={() => { setMenuOpen(false); assignmentMutation.mutate(null); }}>
                <Text style={[styles.menuActionText, { color: colors.primary }]}>Unassign</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.menuAction, { backgroundColor: colors.surfaceSecondary }]}
              onPress={() => {
                setMenuOpen(false);
                if (readMutation.isPending || unreadMutation.isPending) return;
                if (header.unreadCount > 0) {
                  manualReadToggleRef.current = true;
                  readMutation.mutate();
                } else {
                  unreadMutation.mutate();
                }
              }}
            >
              <Text style={[styles.menuActionText, { color: colors.primary }]}>{header.unreadCount > 0 ? 'Mark as read' : 'Mark as unread'}</Text>
            </Pressable>
            <Pressable style={[styles.menuAction, { backgroundColor: colors.surfaceSecondary }]} onPress={() => { setMenuOpen(false); statusMutation.mutate(header.status === 'CLOSED' ? 'OPEN' : 'CLOSED'); }}>
              <Text style={[styles.menuActionText, { color: colors.primary }, header.status === 'CLOSED' && styles.menuClosed, header.status === 'CLOSED' && { color: colors.error }]}>{header.status === 'CLOSED' ? 'Reopen conversation' : 'Mark as closed'}</Text>
            </Pressable>
            <Pressable style={[styles.menuAction, { backgroundColor: colors.surfaceSecondary }]} onPress={() => setMenuOpen(false)}>
              <Text style={[styles.menuCancel, { color: colors.textMuted }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      {header.conversation ? (
        <ContactDetailsPanel
          visible={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          conversation={header.conversation as any}
          isUpdatingStatus={statusMutation.isPending}
          onToggleStatus={() => statusMutation.mutate(header.status === 'CLOSED' ? 'OPEN' : 'CLOSED')}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

function setConversationUnreadInCache(queryClient: any, conversationId: string, unreadCount: number) {
  queryClient.setQueriesData<any>({ queryKey: ['conversations'] }, (current: any) => {
    if (!current) return current;
    if (Array.isArray(current?.pages)) {
      return { ...current, pages: current.pages.map((page: any) => ({ ...page, items: (page.items ?? []).map((item: any) => item.id === conversationId ? { ...item, unreadCount } : item) })) };
    }
    if (Array.isArray(current?.items)) {
      return { ...current, items: current.items.map((item: any) => item.id === conversationId ? { ...item, unreadCount } : item) };
    }
    return current;
  });

  queryClient.setQueriesData<any>({ queryKey: ['messages', conversationId] }, (current: any) => {
    if (!current) return current;
    if (current.conversation) {
      return { ...current, conversation: { ...current.conversation, unreadCount } };
    }
    if (Array.isArray(current?.pages)) {
      return {
        ...current,
        pages: current.pages.map((page: any, index: number) =>
          index === 0 && page?.conversation
            ? { ...page, conversation: { ...page.conversation, unreadCount } }
            : page,
        ),
      };
    }
    return current;
  });
}

function adjustInboxUnreadCount(queryClient: any, delta: number) {
  if (!delta) return;
  queryClient.setQueriesData<number | { count?: number; unreadCount?: number; total?: number }>(
    { queryKey: ['inbox-unread-count'] },
    (current: any) => {
      if (typeof current === 'number') return Math.max(0, current + delta);
      if (!current || typeof current !== 'object') return current;
      const base = current.count ?? current.unreadCount ?? current.total ?? 0;
      const next = Math.max(0, base + delta);
      if ('count' in current) return { ...current, count: next };
      if ('unreadCount' in current) return { ...current, unreadCount: next };
      if ('total' in current) return { ...current, total: next };
      return next;
    },
  );
}

async function sendTemplateMutation(conversationId: string, params: { templateName: string; templateCategory?: string | null; languageCode?: string; text?: string; templateComponents?: unknown[] }, queryClient: any, setDraft: (v: string) => void) {
  try {
    await sendTemplateMessage({
      conversationId,
      templateName: params.templateName,
      templateCategory: params.templateCategory ?? null,
      languageCode: params.languageCode,
      text: params.text,
      templateComponents: params.templateComponents,
    });
    queryClient.invalidateQueries({ queryKey: ['messages', conversationId], refetchType: 'active' });
    setDraft('');
  } catch (error) {
    Alert.alert('Could not send template', error instanceof Error ? error.message : 'Please try again.');
  }
}

const SwipeableMessage = memo(function SwipeableMessage({ message, channelName, setReplyTo, setReactTarget, onImage, onVideo, replyTarget, reactions, onJumpToMessage }: { message: Message; channelName?: string | null; setReplyTo: (message: Message) => void; setReactTarget: (message: Message) => void; onImage: (attachId: string) => void; onVideo: (attachment: any) => void; replyTarget: Message | null; reactions?: Array<{ emoji: string; count: number }>; onJumpToMessage?: (messageId: string) => void }) {
  const { colors } = useTheme();
  const outgoing = message.direction === 'OUTBOUND';
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const replyLockRef = useRef(false);
  const onReply = useCallback(() => setReplyTo(message), [setReplyTo, message]);
  const onReact = useCallback(() => setReactTarget(message), [setReactTarget, message]);
  const renderLeftActions = useCallback(() => (
    <View style={styles.replyAction}>
      <View style={[styles.replyIconCircle, { backgroundColor: colors.surfaceSecondary }]}>
        <Reply color={colors.primary} size={20} strokeWidth={2.4} />
      </View>
    </View>
  ), [colors]);
  const handleWillOpen = useCallback(() => {
    if (replyLockRef.current) return;
    replyLockRef.current = true;
    // Snap closed immediately so the reply state update doesn't fight an open/close animation.
    swipeRef.current?.reset();
    onReply();
    requestAnimationFrame(() => {
      replyLockRef.current = false;
    });
  }, [onReply]);
  if (isInlineReactionMessage(message)) return null;
  const replyTargetId = message.replyToMessageId ?? replyTarget?.id ?? message.replyTo?.id ?? null;
  const replyPreview = message.replyTo || replyTarget ? {
    name: (message.replyTo?.sender?.userName ?? replyTarget?.sender?.userName) || (replyTarget?.direction === 'OUTBOUND' ? 'You' : 'Message'),
    text: message.replyTo?.text ?? replyTarget?.text ?? 'Attachment',
    imageUrl: replyTarget ? apiUrl(replyTarget.attachments?.find((a: any) => a.mediaType === 'IMAGE' || a.mimeType?.startsWith('image/'))?.previewUrl ?? replyTarget.attachments?.find((a: any) => a.mediaType === 'IMAGE' || a.mimeType?.startsWith('image/'))?.thumbnailUrl ?? null) : null,
  } : null;
  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1}
      leftThreshold={28}
      overshootLeft={false}
      overshootRight={false}
      // Prefer a clear rightward reply swipe; fail quickly so vertical scroll stays smooth.
      activeOffsetX={[-9999, 18]}
      failOffsetY={[-14, 14]}
      renderLeftActions={renderLeftActions}
      onSwipeableWillOpen={handleWillOpen}
    >
      <View style={[styles.group, outgoing && styles.outgoingGroup]}>
        <MessageBubble message={message} outgoing={outgoing} attachments={message.attachments ?? []} replyPreview={replyPreview} reactions={reactions} channelName={channelName} onImage={onImage} onVideo={onVideo} onLongPress={onReact} onReplyPress={onJumpToMessage && replyTargetId ? () => onJumpToMessage(replyTargetId) : undefined} />
      </View>
    </ReanimatedSwipeable>
  );
});

const styles = StyleSheet.create({
  screen: { backgroundColor: 'transparent', flex: 1 },
  body: { backgroundColor: 'transparent', flex: 1, overflow: 'hidden' },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#dbe4f1', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  avatarWrap: { position: 'relative' },
  presence: { backgroundColor: '#22c55e', borderColor: '#fff', borderRadius: 6, borderWidth: 1.5, bottom: 1, height: 12, position: 'absolute', right: 1, width: 12 },
  titleBlock: { flex: 1, minWidth: 0 },
  name: { color: '#0f172a', fontWeight: '700' },
  window: { color: '#55921c', fontSize: 11, marginTop: 1 },
  windowExpired: { color: '#dc2626' },
  assignee: { color: '#94a3b8', fontSize: 11, marginTop: 1 },
  list: { backgroundColor: 'transparent', flex: 1 },
  listWrap: { backgroundColor: 'transparent', flex: 1, minHeight: 0, overflow: 'hidden' },
  error: { backgroundColor: 'transparent', color: '#dc2626', padding: 14, textAlign: 'center' },
  listContent: { gap: 10, padding: 14 },
  highlightRow: { backgroundColor: 'rgba(50,102,246,0.10)', borderRadius: 14, paddingVertical: 2 },
  group: { alignItems: 'flex-start', gap: 6 },
  outgoingGroup: { alignItems: 'flex-end' },
  dayDivider: { alignSelf: 'center', backgroundColor: '#e8eef7', borderRadius: 999, color: '#526987', fontSize: 12, fontWeight: '600', marginVertical: 8, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 6 },
  olderPill: { alignSelf: 'center', color: '#64748b', fontSize: 12, marginVertical: 6 },
  fab: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 22, bottom: 16, elevation: 3, height: 44, justifyContent: 'center', position: 'absolute', right: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 5, width: 44 },
  menuOverlay: { alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'center', padding: 24 },
  menuCard: { backgroundColor: '#fff', borderRadius: 16, maxWidth: 380, padding: 18, width: '100%' },
  menuTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  menuRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  menuLabel: { color: '#64748b', fontSize: 13 },
  menuValue: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  menuClosed: { color: '#dc2626' },
  menuDivider: { backgroundColor: '#e2e8f0', height: StyleSheet.hairlineWidth, marginVertical: 10 },
  menuAction: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 10, marginTop: 6, paddingVertical: 12 },
  menuActionText: { color: '#2563eb', fontSize: 14, fontWeight: '700' },
  menuCancel: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  replyAction: { alignItems: 'center', justifyContent: 'center', marginVertical: 3, width: 56 },
  replyIconCircle: {
    alignItems: 'center',
    backgroundColor: '#e8f0ff',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});
