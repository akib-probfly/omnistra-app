// @ts-nocheck
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Mail, MailOpen, MoreHorizontal, Star } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, uploadFile } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ConversationComposer } from '../components/ConversationComposer';
import { MediaViewer } from '../components/MediaViewer';
import { MessageBubble } from '../components/MessageBubble';
import { ReactionPicker } from '../components/ReactionPicker';
import { fetchAssigneeOptions, fetchConversationCallSessions, fetchMessagesPage, markConversationRead, markConversationUnread, sendReaction, sendTemplateMessage, updateConversationAssignment, updateConversationStar, updateConversationStatus, type ConversationCallSession } from '../api/inbox';
import type { InboxStackParamList } from '../navigation/InboxStack';
import { buildConversationTimeline, buildReactionGroups, formatTimelineDayLabel, getConversationTitle, getConversationWindowLabel, isInlineReactionMessage, type ConversationTimelineEntry } from '../lib/inbox-utils';
import { CallHistoryItem } from '../components/CallHistoryItem';

type Attachment = { id: string; messageId?: string | null; mediaType: string; mimeType: string; originalName: string | null; downloadUrl: string; previewUrl: string | null; thumbnailUrl: string | null; durationMs: number | null };
type Message = { id: string; workspaceId?: string; direction: 'INBOUND' | 'OUTBOUND'; senderType?: string | null; sender?: { userName?: string | null; userEmail?: string | null } | null; type: string; text: string | null; deliveryStatus?: string; failureReason?: string | null; campaignId?: string | null; campaignName?: string | null; replyToMessageId?: string | null; replyTo?: { sender?: { userName?: string | null } | null; text?: string | null } | null; sentAt?: string | null; createdAt?: string; metadata?: any; attachments?: Attachment[] };
type SendAttachment = { uri: string; name: string; mimeType: string; type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'DOCUMENT' };
type MediaItem = { attachId: string; src: string; thumb: string | null; mediaType: string };
const apiUrl = (value: string | null) => {
  if (!value) return null;
  const base = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://osaas-mvp-api.probfly.com/api/v1';
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
  const { session } = useAuth();
  const listRef = useRef<FlatList>(null);
  const [draft, setDraft] = useState(''); const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState<SendAttachment[]>([]);
  const [gallery, setGallery] = useState<MediaItem[]>([]); const [galleryIndex, setGalleryIndex] = useState(0);
  const [reactTarget, setReactTarget] = useState<Message | null>(null);
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [header, setHeader] = useState({ isStarred: false, unreadCount: 0, status: 'OPEN' as string, conversation: null as any });
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMoreRef = useRef(false);
  const loadOlderRef = useRef<() => Promise<void>>(async () => {});
  const timelineRef = useRef<ConversationTimelineEntry[]>([]);

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
      return { items, nextCursor: page.pageInfo?.nextCursor ?? null, hasMore: page.pageInfo?.hasMore ?? false, conversation: page.conversation ?? null };
    },
    staleTime: 5000, refetchInterval: 8000,
  });

  useEffect(() => {
    if (messages.data?.conversation) {
      setHeader((current) => ({ ...current, conversation: messages.data.conversation, isStarred: messages.data.conversation.isStarred ?? current.isStarred, unreadCount: messages.data.conversation.unreadCount ?? current.unreadCount, status: messages.data.conversation.status ?? current.status }));
    }
  }, [messages.data?.conversation]);

  const allMessages = useMemo(() => [...olderMessages, ...(messages.data?.items ?? [])], [olderMessages, messages.data?.items]);
  hasMoreRef.current = messages.data?.hasMore ?? false;
  const reactionGroups = useMemo(() => buildReactionGroups(allMessages), [allMessages]);

  const messageById = useMemo(() => { const map = new Map<string, Message>(); allMessages.forEach((message) => map.set(message.id, message)); return map; }, [allMessages]);

  const send = useMutation({
    mutationFn: async () => {
      const workspaceId = route.params.workspaceId ?? allMessages.find((message) => message.workspaceId)?.workspaceId;
      if (!workspaceId && attachments.length) throw new Error('Workspace information is unavailable. Please reload the conversation.');
      const attachmentIds: string[] = [];
      for (const selected of attachments) {
        const uploaded = await uploadFile('/files/upload', selected.uri, selected.name, selected.mimeType, { workspaceId });
        attachmentIds.push(uploaded.id);
      }
      const text = draft.replace(/\u200B/g, '').trim() || undefined;
      const type = attachments.length ? (attachments[0].type === 'VOICE' ? 'VOICE' : attachments[0].type) : 'TEXT';
      return apiFetch<Message>(`/conversations/${route.params.conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ type, text, attachmentIds, replyToMessageId: replyTo?.id }),
      });
    },
    onSuccess: (created) => {
      setDraft(''); setAttachments([]); setReplyTo(null);
      queryClient.setQueryData<any>(['messages', route.params.conversationId], (current) => {
        if (!current || !Array.isArray(current.items)) return current;
        return { ...current, items: [...current.items, created] };
      });
      queryClient.invalidateQueries({ queryKey: ['messages', route.params.conversationId], refetchType: 'active' });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    },
  });

  const reactMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) => sendReaction(route.params.conversationId, messageId, emoji, 'REACT'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['messages', route.params.conversationId], refetchType: 'active' }); },
  });

  const starMutation = useMutation({ mutationFn: (isStarred: boolean) => updateConversationStar(route.params.conversationId, isStarred), onSuccess: (_, isStarred) => setHeader((c) => ({ ...c, isStarred })) });
  const readMutation = useMutation({ mutationFn: () => markConversationRead(route.params.conversationId), onSuccess: () => { setHeader((c) => ({ ...c, unreadCount: 0 })); setConversationUnreadInCache(queryClient, route.params.conversationId, 0); } });
  const unreadMutation = useMutation({ mutationFn: () => markConversationUnread(route.params.conversationId), onSuccess: () => { setHeader((c) => ({ ...c, unreadCount: 1 })); setConversationUnreadInCache(queryClient, route.params.conversationId, 1); } });
  const statusMutation = useMutation({ mutationFn: (status: string) => updateConversationStatus(route.params.conversationId, status as 'OPEN' | 'CLOSED'), onSuccess: (_, status) => setHeader((c) => ({ ...c, status })) });
  const assignmentMutation = useMutation({
    mutationFn: (assigneeWorkspaceMemberId: string | null) => updateConversationAssignment(route.params.conversationId, assigneeWorkspaceMemberId),
    onSuccess: (_, assigneeWorkspaceMemberId) => {
      const conversation = header.conversation as any;
      const assignee = assigneeWorkspaceMemberId ? { ...(conversation?.assignee ?? {}), workspaceMemberId: assigneeWorkspaceMemberId } : null;
      setHeader((c) => ({ ...c, conversation: { ...(c.conversation ?? {}), assignee } }));
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => Alert.alert('Could not update assignment', error.message),
  });

  useEffect(() => {
    if (!header.conversation || messages.isLoading || messages.isError) return;
    if (header.unreadCount <= 0 || readMutation.isPending) return;
    if (!atBottom) return;
    readMutation.mutate();
  }, [header.conversation, header.unreadCount, messages.isLoading, messages.isError, atBottom, readMutation.isPending]);

  useEffect(() => { const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100); return () => clearTimeout(timer); }, [messages.data?.items?.length]);

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
      setOlderMessages((current) => [...items, ...current]);
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
      const index = timelineRef.current.findIndex((entry) => entry.kind === 'message' && entry.message.id === messageId);
      if (index < 0) return false;
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

  const imageUrls = useMemo(() => allMessages.flatMap((message) => (message.attachments ?? []).filter((attachment) => ['IMAGE', 'STICKER'].includes(attachment.mediaType.toUpperCase()) || attachment.mimeType?.startsWith('image/')).map((attachment) => { const src = apiUrl(attachment.previewUrl ?? attachment.thumbnailUrl ?? attachment.downloadUrl); const thumb = apiUrl(attachment.thumbnailUrl ?? attachment.previewUrl); return src ? { attachId: attachment.id, src, thumb, mediaType: attachment.mediaType } as MediaItem : null; }).filter((item): item is MediaItem => Boolean(item))), [allMessages]);

  const openImage = (attachId: string) => {
    setGallery(imageUrls);
    setGalleryIndex(Math.max(0, imageUrls.findIndex((media) => media.attachId === attachId)));
  };

  const channelType = header.conversation?.channel?.channelType ?? route.params.channelType;
  const channelId = header.conversation?.channel?.id ?? route.params.channelId;
  const windowInfo = getConversationWindowLabel(header.conversation);
  const title = getConversationTitle(header.conversation, route.params.contactName);
  const assigneeLabel = header.conversation?.assignee?.userName ?? header.conversation?.assignee?.userEmail ?? (header.conversation?.assignee ? 'Assigned agent' : 'Unassigned');

  const callsQuery = useQuery({
    queryKey: ['conversation-calls', route.params.conversationId],
    queryFn: () => fetchConversationCallSessions({ conversationId: route.params.conversationId, limit: 10 }),
    enabled: channelType === 'WHATSAPP',
    staleTime: 30000,
  });
  const callSessions: ConversationCallSession[] = callsQuery.data?.items ?? [];
  const timeline = useMemo<ConversationTimelineEntry[]>(() => buildConversationTimeline(allMessages, callSessions), [allMessages, callSessions]);
  timelineRef.current = timeline;

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
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    setAtBottom(distanceFromBottom < 120);
    if (contentOffset.y < 120) loadOlder();
  };

  const renderMessage = ({ item }: { item: Message }) => <SwipeableMessage message={item} onReply={() => setReplyTo(item)} onReact={() => setReactTarget(item)} onImage={openImage} replyTarget={messageById.get(item.replyToMessageId ?? '') ?? null} reactions={reactionGroups[item.id]} onJumpToMessage={jumpToMessage} />;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()}><ArrowLeft color="#334155" size={23} /></Pressable>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}><Text>{title.slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.presence} />
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.name} numberOfLines={1}>{title}</Text>
          <Text style={[styles.window, windowInfo.tone === 'expired' && styles.windowExpired]}>{windowInfo.label}</Text>
          <Text style={styles.assignee} numberOfLines={1}>{assigneeLabel}</Text>
        </View>
        <Pressable onPress={() => starMutation.mutate(!header.isStarred)} hitSlop={8}><Star color={header.isStarred ? '#f59e0b' : '#94a3b8'} fill={header.isStarred ? '#f59e0b' : 'none'} size={19} /></Pressable>
        <Pressable onPress={() => { if (header.unreadCount > 0) readMutation.mutate(); else unreadMutation.mutate(); }} hitSlop={8}>{header.unreadCount > 0 ? <Mail color="#334155" size={19} /> : <MailOpen color="#334155" size={19} />}</Pressable>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={8}><MoreHorizontal color="#334155" size={19} /></Pressable>
      </View>
      {messages.isLoading ? <ConversationSkeleton /> : (
        <View style={styles.listWrap}>
          <FlatList
            ref={listRef}
            style={styles.list}
            data={timeline}
            keyExtractor={(entry) => `${entry.kind}:${entry.id}`}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={120}
            ListHeaderComponent={loadingOlder ? <Text style={styles.olderPill}>Loading older messages...</Text> : null}
            renderItem={({ item, index }) => {
              const previous = timeline[index - 1];
              const showDivider = !previous || new Date(previous.timestamp).toDateString() !== new Date(item.timestamp).toDateString();
              const highlighted = item.kind === 'message' && item.message.id === highlightedMessageId;
              return (
                <View style={highlighted ? styles.highlightRow : undefined}>
                  {showDivider ? <Text style={styles.dayDivider}>{formatTimelineDayLabel(new Date(item.timestamp))}</Text> : null}
                  {item.kind === 'call' ? <CallHistoryItem session={item.session} /> : renderMessage({ item: item.message })}
                </View>
              );
            }}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              listRef.current?.scrollToOffset({ offset: Math.max(0, index * averageItemLength), animated: false });
              setTimeout(() => {
                listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
                const entry = timelineRef.current[index];
                if (entry?.kind === 'message') highlightMessage(entry.message.id);
              }, 120);
            }}
          />
          {!atBottom ? (
            <Pressable style={styles.fab} onPress={() => listRef.current?.scrollToEnd({ animated: true })}><ChevronDown color="#fff" size={22} /></Pressable>
          ) : null}
        </View>
      )}
      {messages.isError ? <Text style={styles.error}>{messages.error instanceof Error ? messages.error.message : 'Unable to load messages.'}</Text> : null}
      <ConversationComposer
        value={draft} onChange={setDraft} sending={send.isPending}
        attachments={attachments} onAttachments={setAttachments}
        workspaceId={route.params.workspaceId}
        channelId={channelId} channelType={channelType} contactName={title}
        onSendTemplate={(params) => sendTemplateMutation(route.params.conversationId, params, queryClient, setDraft)}
        replyPreview={replyTo ? { name: replyTo.direction === 'INBOUND' ? title : 'You', text: replyTo.text ?? 'Attachment' } : null}
        onCancelReply={() => setReplyTo(null)}
        onSend={() => send.mutate()}
      />
      <ReactionPicker visible={Boolean(reactTarget)} onClose={() => setReactTarget(null)} onPick={(emoji) => { if (reactTarget) reactMutation.mutate({ messageId: reactTarget.id, emoji }); setReactTarget(null); }} onReply={() => { if (reactTarget) setReplyTo(reactTarget); setReactTarget(null); }} />
      <MediaViewer images={gallery} index={galleryIndex} onClose={() => setGallery([])} onIndex={setGalleryIndex} />
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>{title}</Text>
            <View style={styles.menuRow}>
              <Text style={styles.menuLabel}>Assigned to</Text>
              <Text style={styles.menuValue}>{assigneeLabel}</Text>
            </View>
            <View style={styles.menuRow}>
              <Text style={styles.menuLabel}>Status</Text>
              <Text style={[styles.menuValue, header.status === 'CLOSED' && styles.menuClosed]}>{header.status === 'CLOSED' ? 'Closed' : 'Open'}</Text>
            </View>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuAction} onPress={assignToMe}>
              <Text style={styles.menuActionText}>Assign to me</Text>
            </Pressable>
            {header.conversation?.assignee ? (
              <Pressable style={styles.menuAction} onPress={() => { setMenuOpen(false); assignmentMutation.mutate(null); }}>
                <Text style={styles.menuActionText}>Unassign</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.menuAction} onPress={() => { setMenuOpen(false); if (header.unreadCount > 0) readMutation.mutate(); else unreadMutation.mutate(); }}>
              <Text style={styles.menuActionText}>{header.unreadCount > 0 ? 'Mark as read' : 'Mark as unread'}</Text>
            </Pressable>
            <Pressable style={styles.menuAction} onPress={() => { setMenuOpen(false); statusMutation.mutate(header.status === 'CLOSED' ? 'OPEN' : 'CLOSED'); }}>
              <Text style={[styles.menuActionText, header.status === 'CLOSED' && styles.menuClosed]}>{header.status === 'CLOSED' ? 'Reopen conversation' : 'Mark as closed'}</Text>
            </Pressable>
            <Pressable style={styles.menuAction} onPress={() => setMenuOpen(false)}>
              <Text style={styles.menuCancel}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
}

async function sendTemplateMutation(conversationId: string, params: { templateName: string; templateCategory?: string | null; languageCode?: string; text?: string }, queryClient: any, setDraft: (v: string) => void) {
  try {
    await sendTemplateMessage({ conversationId, templateName: params.templateName, templateCategory: params.templateCategory ?? null, languageCode: params.languageCode, text: params.text });
    queryClient.invalidateQueries({ queryKey: ['messages', conversationId], refetchType: 'active' });
    setDraft('');
  } catch (error) {
    Alert.alert('Could not send template', error instanceof Error ? error.message : 'Please try again.');
  }
}

function ConversationSkeleton() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  const rows = [
    { align: 'flex-end', width: '52%' },
    { align: 'flex-start', width: '64%' },
    { align: 'flex-start', width: '38%' },
    { align: 'flex-end', width: '70%' },
    { align: 'flex-start', width: '46%' },
    { align: 'flex-end', width: '58%' },
    { align: 'flex-start', width: '72%' },
    { align: 'flex-end', width: '40%' },
  ] as Array<{ align: 'flex-end' | 'flex-start'; width: string }>;
  return (
    <View style={styles.skeleton}>
      <Animated.View style={[styles.skeletonInner, { opacity: pulse }]}>
        <View style={styles.skeletonDay} />
        {rows.map((row, index) => (
          <View key={index} style={[styles.skeletonRow, { justifyContent: row.align }]}>
            <View style={[styles.skeletonBubble, { width: row.width }]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function SwipeableMessage({ message, onReply, onReact, onImage, replyTarget, reactions, onJumpToMessage }: { message: Message; onReply: () => void; onReact: () => void; onImage: (attachId: string) => void; replyTarget: Message | null; reactions?: Array<{ emoji: string; count: number }>; onJumpToMessage?: (messageId: string) => void }) {
  const outgoing = message.direction === 'OUTBOUND';
  const swipeRef = useRef<Swipeable>(null);
  if (isInlineReactionMessage(message)) return null;
  const replyTargetId = message.replyToMessageId ?? replyTarget?.id ?? message.replyTo?.id ?? null;
  const replyPreview = message.replyTo || replyTarget ? {
    name: (message.replyTo?.sender?.userName ?? replyTarget?.sender?.userName) || (replyTarget?.direction === 'OUTBOUND' ? 'You' : 'Message'),
    text: message.replyTo?.text ?? replyTarget?.text ?? 'Attachment',
    imageUrl: replyTarget ? apiUrl(replyTarget.attachments?.find((a: any) => a.mediaType === 'IMAGE' || a.mimeType?.startsWith('image/'))?.previewUrl ?? replyTarget.attachments?.find((a: any) => a.mediaType === 'IMAGE' || a.mimeType?.startsWith('image/'))?.thumbnailUrl ?? null) : null,
  } : null;
  return (
    <Swipeable ref={swipeRef} overshootRight={false} overshootLeft={false} friction={2} renderLeftActions={() => <View style={styles.replyAction}><Text style={styles.replyIcon}>↩</Text><Text style={styles.replyActionText}>Reply</Text></View>} onSwipeableOpen={() => { swipeRef.current?.close(); onReply(); }}>
      <View style={[styles.group, outgoing && styles.outgoingGroup]}>
        <MessageBubble message={message} outgoing={outgoing} attachments={message.attachments ?? []} replyPreview={replyPreview} reactions={reactions} onImage={onImage} onLongPress={onReact} onReplyPress={onJumpToMessage && replyTargetId ? () => onJumpToMessage(replyTargetId) : undefined} />
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f8fbff', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#dbe4f1', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  avatarWrap: { position: 'relative' },
  avatar: { alignItems: 'center', backgroundColor: '#f7c8ca', borderRadius: 21, height: 42, justifyContent: 'center', width: 42 },
  presence: { backgroundColor: '#22c55e', borderColor: '#fff', borderRadius: 6, borderWidth: 1.5, bottom: 1, height: 12, position: 'absolute', right: 1, width: 12 },
  titleBlock: { flex: 1, minWidth: 0 },
  name: { color: '#0f172a', fontWeight: '700' },
  window: { color: '#55921c', fontSize: 11, marginTop: 1 },
  windowExpired: { color: '#dc2626' },
  assignee: { color: '#94a3b8', fontSize: 11, marginTop: 1 },
  list: { flex: 1 },
  listWrap: { flex: 1 },
  listContent: { gap: 10, padding: 14 },
  highlightRow: { backgroundColor: 'rgba(50,102,246,0.10)', borderRadius: 14, paddingVertical: 2 },
  group: { alignItems: 'flex-start', gap: 6 },
  outgoingGroup: { alignItems: 'flex-end' },
  dayDivider: { alignSelf: 'center', backgroundColor: '#e8eef7', borderRadius: 999, color: '#526987', fontSize: 12, fontWeight: '600', marginVertical: 8, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 6 },
  olderPill: { alignSelf: 'center', color: '#64748b', fontSize: 12, marginVertical: 6 },
  error: { color: '#dc2626', padding: 14, textAlign: 'center' },
  skeleton: { flex: 1, padding: 14 },
  skeletonInner: { flex: 1 },
  skeletonRow: { flexDirection: 'row', marginBottom: 12 },
  skeletonBubble: { backgroundColor: '#e5ecf5', borderRadius: 14, height: 38 },
  skeletonDay: { alignSelf: 'center', backgroundColor: '#e5ecf5', borderRadius: 999, height: 24, marginBottom: 14, marginTop: 4, width: 110 },
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
  replyAction: { alignItems: 'center', backgroundColor: '#e8f0ff', borderRadius: 16, justifyContent: 'center', marginVertical: 3, width: 72 },
  replyIcon: { color: '#2563eb', fontSize: 22 },
  replyActionText: { color: '#2563eb', fontSize: 11 },
});
