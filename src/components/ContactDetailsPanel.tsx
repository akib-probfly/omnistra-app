// @ts-nocheck
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, Download, File, FileText, Film, Music, Pencil, Plus, RotateCcw, Sparkles, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiUrl } from '../api/client';
import { attachConversationTag, createConversationNote, createConversationTag, deleteConversationNote, detachConversationTag, fetchConversationAttachments, fetchConversationNotes, fetchConversationTags, fetchWorkspaceTags, updateConversationNote, updateCrmContact, type ConversationAttachment, type ConversationNote, type ConversationTag } from '../api/conversationDetails';
import { AuthenticatedImage } from './AuthenticatedImage';
import { ColorfulAvatar } from './ColorfulAvatar';
import { PanelSkeleton } from './Skeleton';

export function formatPhoneNumberDisplay(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('+') ? trimmed.slice(1).trimStart() : trimmed;
}

export function formatAttachmentSize(sizeBytes: number | null | undefined): string | null {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  if (sizeBytes < 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const TAG_COLOR_OPTIONS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

type PanelProps = {
  visible: boolean;
  onClose: () => void;
  conversation: {
    id: string;
    workspaceId?: string;
    status?: string;
    contact: { id: string; displayName: string | null; avatarUrl: string | null; primaryPhone?: string | null; primaryEmail?: string | null };
    channel: { channelId?: string; channelType: string; channelName: string; displayPhoneNumber: string | null };
  };
  isUpdatingStatus?: boolean;
  onToggleStatus: () => void;
};

export function ContactDetailsPanel({ visible, onClose, conversation, isUpdatingStatus = false, onToggleStatus }: PanelProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [customerOpen, setCustomerOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(false);
  const [attachmentFilter, setAttachmentFilter] = useState<'MEDIA' | 'DOCUMENTS'>('MEDIA');
  const [tagInput, setTagInput] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(TAG_COLOR_OPTIONS[0]);

  // Only fetch sidebar data when the panel is open (matches web: notes/files load on expand).
  const conversationTagsQuery = useQuery({
    queryKey: ['conversation-tags', conversation.id],
    queryFn: () => fetchConversationTags(conversation.id),
    enabled: visible,
    staleTime: 30000,
  });
  const workspaceTagsQuery = useQuery({
    queryKey: ['workspace-tags', conversation.workspaceId],
    queryFn: () => fetchWorkspaceTags(conversation.workspaceId),
    enabled: visible && Boolean(conversation.workspaceId),
    staleTime: 60000,
  });
  const notesQuery = useQuery({
    queryKey: ['conversation-notes', conversation.id],
    queryFn: () => fetchConversationNotes({ conversationId: conversation.id, limit: 50 }),
    enabled: visible,
    staleTime: 15000,
  });
  const attachmentsQuery = useQuery({
    queryKey: ['conversation-attachments', conversation.id],
    queryFn: () => fetchConversationAttachments({ conversationId: conversation.id, limit: 50 }),
    enabled: visible && filesOpen,
    staleTime: 15000,
  });

  const conversationTags = useMemo(() => (conversationTagsQuery.data?.items ?? []).filter((tag) => !tag.isArchived), [conversationTagsQuery.data?.items]);
  const conversationTagIds = useMemo(() => new Set(conversationTags.map((tag) => tag.id)), [conversationTags]);
  const workspaceTags = useMemo(() => [...(workspaceTagsQuery.data?.items ?? [])].sort((a, b) => a.text.localeCompare(b.text)), [workspaceTagsQuery.data?.items]);
  const mediaAttachments = useMemo(() => (attachmentsQuery.data?.items ?? []).filter((a) => ['IMAGE', 'VIDEO', 'STICKER'].includes(a.mediaType?.toUpperCase?.() ?? '')), [attachmentsQuery.data?.items]);
  const documentAttachments = useMemo(() => (attachmentsQuery.data?.items ?? []).filter((a) => !['IMAGE', 'VIDEO', 'STICKER'].includes(a.mediaType?.toUpperCase?.() ?? '')), [attachmentsQuery.data?.items]);

  const displayPhone = conversation.contact.primaryPhone ?? null;
  const displayEmail = conversation.contact.primaryEmail ?? null;
  const canEditPhone = conversation.channel.channelType !== 'WHATSAPP';
  const contactTitle = conversation.contact.displayName?.trim() || formatPhoneNumberDisplay(displayPhone) || formatPhoneNumberDisplay(conversation.channel.displayPhoneNumber) || conversation.channel.channelName || 'Contact';

  const notes = useMemo(() => [...(notesQuery.data?.items ?? [])].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()), [notesQuery.data?.items]);

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['conversation-tags', conversation.id] });
    void queryClient.invalidateQueries({ queryKey: ['conversation-notes', conversation.id] });
    void queryClient.invalidateQueries({ queryKey: ['conversation-attachments', conversation.id] });
  }, [conversation.id, queryClient]);

  const phoneMutation = useMutation({
    mutationFn: (primaryPhone: string) => updateCrmContact(conversation.contact.id, { primaryPhone }),
    onSuccess: () => { setEditingPhone(false); setPhoneDraft(''); invalidateAll(); },
    onError: (error: Error) => Alert.alert('Could not update phone', error.message),
  });
  const emailMutation = useMutation({
    mutationFn: (primaryEmail: string) => updateCrmContact(conversation.contact.id, { primaryEmail }),
    onSuccess: () => { setEditingEmail(false); setEmailDraft(''); invalidateAll(); },
    onError: (error: Error) => Alert.alert('Could not update email', error.message),
  });

  const attachMutation = useMutation({ mutationFn: (tagId: string) => attachConversationTag(conversation.id, tagId), onSuccess: invalidateAll });
  const detachMutation = useMutation({ mutationFn: (tagId: string) => detachConversationTag(conversation.id, tagId), onSuccess: invalidateAll });
  const createTagMutation = useMutation({ mutationFn: () => createConversationTag(conversation.id, { text: tagInput.trim(), color: selectedColor }), onSuccess: () => { setTagInput(''); invalidateAll(); }, onError: (error: Error) => Alert.alert('Could not create tag', error.message) });

  const createNoteMutation = useMutation({ mutationFn: (content: string) => createConversationNote(conversation.id, content), onSuccess: () => { setNoteDraft(''); void queryClient.invalidateQueries({ queryKey: ['conversation-notes', conversation.id] }); }, onError: (error: Error) => Alert.alert('Could not add note', error.message) });
  const updateNoteMutation = useMutation({ mutationFn: ({ noteId, content }: { noteId: string; content: string }) => updateConversationNote(conversation.id, noteId, content), onSuccess: () => { setEditingNoteId(null); setEditingNoteDraft(''); void queryClient.invalidateQueries({ queryKey: ['conversation-notes', conversation.id] }); }, onError: (error: Error) => Alert.alert('Could not update note', error.message) });
  const deleteNoteMutation = useMutation({ mutationFn: (noteId: string) => deleteConversationNote(conversation.id, noteId), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['conversation-notes', conversation.id] }); }, onError: (error: Error) => Alert.alert('Could not delete note', error.message) });

  const handleAttach = (tag: ConversationTag) => { if (!conversationTagIds.has(tag.id)) attachMutation.mutate(tag.id); };
  const handleDetach = (tagId: string) => { if (conversationTagIds.has(tagId)) detachMutation.mutate(tagId); };

  const savePhone = () => { const trimmed = phoneDraft.trim(); if (!trimmed) { setEditingPhone(false); return; } phoneMutation.mutate(trimmed); };
  const saveEmail = () => { const trimmed = emailDraft.trim(); if (!trimmed) { setEditingEmail(false); return; } emailMutation.mutate(trimmed); };

  const saveNote = () => { const content = noteDraft.trim(); if (!content) return; createNoteMutation.mutate(content); };
  const saveEditingNote = () => { if (!editingNoteId) return; const content = editingNoteDraft.trim(); if (!content) return; updateNoteMutation.mutate({ noteId: editingNoteId, content }); };

  const downloadDocument = async (attachment: ConversationAttachment) => {
    if (!attachment.downloadUrl) return;
    if (downloadingId) return;
    setDownloadingId(attachment.id);
    try {
      const token = await SecureStore.getItemAsync('access-token');
      const name = attachment.originalName ?? 'attachment';
      const target = `${FileSystem.cacheDirectory}${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const result = await FileSystem.downloadAsync(apiUrl(attachment.downloadUrl) ?? '', target, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (result.status === 200) Alert.alert('Downloaded', `Saved to:\n${result.uri}`);
      else Alert.alert('Download failed', `Status ${result.status}`);
    } catch (error) {
      Alert.alert('Download failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const resetState = () => {
    setCustomerOpen(true); setTagsOpen(true); setNotesOpen(true); setFilesOpen(false);
    setTagInput(''); setNoteDraft(''); setEditingNoteId(null); setEditingPhone(false); setEditingEmail(false); setLightbox(null); setDownloadingId(null);
  };
  useEffect(() => { if (visible) resetState(); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <DrawerShell onClose={onClose}>
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Contact details</Text>
           <Pressable onPress={onClose} hitSlop={10} style={styles.drawerClose}><X color="#64748b" size={20} /></Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
            <View style={styles.chatSummaryPill}>
              <View style={styles.sparkWrap}><Sparkles color="#5a83f6" size={15} /></View>
              <Text style={styles.chatSummaryTitle}>Chat Summary</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Customer Information</Text>
                <Pressable onPress={() => setCustomerOpen((v) => !v)} hitSlop={8} style={styles.collapseBtn}>{customerOpen ? <ChevronUp color="#64748b" size={16} /> : <ChevronDown color="#64748b" size={16} />}</Pressable>
              </View>
              {customerOpen ? (
                <View style={styles.customerBox}>
                  <View style={styles.customerTop}>
                    <View style={styles.customerAvatarWrap}>
                      <ColorfulAvatar
                        name={contactTitle}
                        size={52}
                        url={conversation.contact.avatarUrl ? (apiUrl(conversation.contact.avatarUrl) ?? conversation.contact.avatarUrl) : null}
                      />
                    </View>
                    <View style={styles.customerIdentity}>
                      <Text style={styles.customerName} numberOfLines={1}>{contactTitle}</Text>
                      <Text style={styles.customerMeta} numberOfLines={1}>{formatPhoneNumberDisplay(displayPhone) ?? formatPhoneNumberDisplay(conversation.channel.displayPhoneNumber) ?? conversation.channel.channelName}</Text>
                      {displayEmail ? <Text style={styles.customerEmail} numberOfLines={1}>{displayEmail}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.infoRows}>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Channel</Text>
                      <Text style={styles.infoValue} numberOfLines={1}>{conversation.channel.channelName}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Phone</Text>
                      {editingPhone ? (
                        <View style={styles.editFieldWrap}>
                          <TextInput value={phoneDraft} onChangeText={setPhoneDraft} autoFocus style={styles.editInput} placeholder="Write phone and press done" placeholderTextColor="#94a3b8" onSubmitEditing={savePhone} />
                          <Pressable onPress={savePhone} hitSlop={6} style={styles.editConfirm}><Check color="#2563eb" size={14} /></Pressable>
                        </View>
                      ) : (
                        <View style={styles.infoValueWrap}>
                          <Text style={styles.infoValue} numberOfLines={1}>{formatPhoneNumberDisplay(displayPhone) ?? formatPhoneNumberDisplay(conversation.channel.displayPhoneNumber) ?? 'Not available'}</Text>
                          {canEditPhone ? (
                            <Pressable onPress={() => { setPhoneDraft(displayPhone ?? ''); setEditingPhone(true); }} hitSlop={8} style={styles.editBtn}><Pencil color="#94a3b8" size={13} /></Pressable>
                          ) : null}
                        </View>
                      )}
                    </View>
                    {phoneMutation.isError ? <Text style={styles.errorText}>{phoneMutation.error instanceof Error ? phoneMutation.error.message : 'Could not update phone'}</Text> : null}
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Email</Text>
                      {editingEmail ? (
                        <View style={styles.editFieldWrap}>
                          <TextInput value={emailDraft} onChangeText={setEmailDraft} autoFocus keyboardType="email-address" style={styles.editInput} placeholder="Write email and press done" placeholderTextColor="#94a3b8" onSubmitEditing={saveEmail} />
                          <Pressable onPress={saveEmail} hitSlop={6} style={styles.editConfirm}><Check color="#2563eb" size={14} /></Pressable>
                        </View>
                      ) : (
                        <View style={styles.infoValueWrap}>
                          <Text style={styles.infoValue} numberOfLines={1}>{displayEmail ?? 'Not available'}</Text>
                          <Pressable onPress={() => { setEmailDraft(displayEmail ?? ''); setEditingEmail(true); }} hitSlop={8} style={styles.editBtn}><Pencil color="#94a3b8" size={13} /></Pressable>
                        </View>
                      )}
                    </View>
                    {emailMutation.isError ? <Text style={styles.errorText}>{emailMutation.error instanceof Error ? emailMutation.error.message : 'Could not update email'}</Text> : null}
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Tags</Text>
                <Pressable onPress={() => setTagsOpen((v) => !v)} hitSlop={8} style={styles.collapseBtn}>{tagsOpen ? <ChevronUp color="#64748b" size={16} /> : <ChevronDown color="#64748b" size={16} />}</Pressable>
              </View>
              {tagsOpen ? (
                <View style={styles.tagsBody}>
                  {conversationTags.length > 0 ? (
                    <View style={styles.chipRow}>
                      {conversationTags.map((tag) => (
                        <Pressable key={tag.id} onPress={() => handleDetach(tag.id)} style={[styles.chip, { backgroundColor: tag.color ?? '#e8eef7' }]}>
                          <Text style={styles.chipText}>{tag.text}</Text>
                          <Text style={styles.chipRemove}>×</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptyText}>No tags attached yet.</Text>
                  )}
                  <View style={styles.tagSearchWrap}>
                    <TextInput value={tagInput} onChangeText={setTagInput} style={styles.tagSearchInput} placeholder="Search or create a tag..." placeholderTextColor="#94a3b8" />
                    <View style={styles.colorRow}>
                      {TAG_COLOR_OPTIONS.map((color) => (
                        <Pressable key={color} onPress={() => setSelectedColor(color)} style={[styles.colorDot, { backgroundColor: color }, selectedColor === color && styles.colorDotActive]} />
                      ))}
                    </View>
                  </View>
                  <View style={styles.suggestedTags}>
                    {workspaceTags.filter((tag) => !conversationTagIds.has(tag.id)).slice(0, 12).map((tag) => (
                      <Pressable key={tag.id} onPress={() => handleAttach(tag)} style={[styles.suggestChip, { borderColor: tag.color ?? '#cbd5e1' }]}>
                        <Plus color={tag.color ?? '#64748b'} size={12} />
                        <Text style={styles.suggestChipText}>{tag.text}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {tagInput.trim().length > 0 && !workspaceTags.some((tag) => tag.text.toLowerCase() === tagInput.trim().toLowerCase()) ? (
                    <Pressable onPress={() => createTagMutation.mutate()} style={styles.createTagBtn}>
                      {createTagMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.createTagText}>Create tag "{tagInput.trim()}"</Text>}
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Notes</Text>
                <Pressable onPress={() => setNotesOpen((v) => !v)} hitSlop={8} style={styles.collapseBtn}>{notesOpen ? <ChevronUp color="#64748b" size={16} /> : <ChevronDown color="#64748b" size={16} />}</Pressable>
              </View>
              {notesOpen ? (
                <View style={styles.notesBody}>
                  {notesQuery.isLoading ? <PanelSkeleton rows={3} /> : notes.length > 0 ? (
                    notes.map((note) => (
                      <View key={note.id} style={styles.noteItem}>
                        {editingNoteId === note.id ? (
                          <>
                            <TextInput value={editingNoteDraft} onChangeText={setEditingNoteDraft} style={[styles.noteEditInput, { minHeight: 64 }]} multiline autoFocus />
                            <View style={styles.noteActions}>
                              <Pressable onPress={saveEditingNote} hitSlop={6} style={styles.noteActionBtn}><Text style={styles.noteActionSave}>Save</Text></Pressable>
                              <Pressable onPress={() => { setEditingNoteId(null); setEditingNoteDraft(''); }} hitSlop={6} style={styles.noteActionBtn}><Text style={styles.noteActionCancel}>Cancel</Text></Pressable>
                            </View>
                          </>
                        ) : (
                          <>
                            <Text style={styles.noteText}>{note.content}</Text>
                            <View style={styles.noteMetaRow}>
                              <Text style={styles.noteMeta}>{note.author?.userName ?? note.author?.userEmail ?? 'Unknown'}</Text>
                              <View style={styles.noteMetaActions}>
                                <Pressable onPress={() => { setEditingNoteId(note.id); setEditingNoteDraft(note.content); }} hitSlop={8}><Pencil color="#94a3b8" size={13} /></Pressable>
                                <Pressable onPress={() => Alert.alert('Delete note', 'Are you sure?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteNoteMutation.mutate(note.id) }])} hitSlop={8}><Text style={styles.noteDelete}>×</Text></Pressable>
                              </View>
                            </View>
                          </>
                        )}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>No notes yet.</Text>
                  )}
                  <View style={styles.noteComposer}>
                    <TextInput value={noteDraft} onChangeText={setNoteDraft} style={styles.noteInput} placeholder="Add a note..." placeholderTextColor="#94a3b8" multiline />
                    <Pressable onPress={saveNote} disabled={createNoteMutation.isPending || !noteDraft.trim()} style={[styles.noteAddBtn, (!noteDraft.trim() || createNoteMutation.isPending) && styles.noteAddBtnDisabled]}>
                      {createNoteMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.noteAddText}>Add</Text>}
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Files</Text>
                <Pressable onPress={() => setFilesOpen((v) => !v)} hitSlop={8} style={styles.collapseBtn}>{filesOpen ? <ChevronUp color="#64748b" size={16} /> : <ChevronDown color="#64748b" size={16} />}</Pressable>
              </View>
              {filesOpen ? (
                <View style={styles.filesBody}>
                  <View style={styles.filterTabs}>
                    <Pressable onPress={() => setAttachmentFilter('MEDIA')} style={[styles.filterTab, attachmentFilter === 'MEDIA' && styles.filterTabActive]}><Text style={[styles.filterTabText, attachmentFilter === 'MEDIA' && styles.filterTabTextActive]}>Media ({mediaAttachments.length})</Text></Pressable>
                    <Pressable onPress={() => setAttachmentFilter('DOCUMENTS')} style={[styles.filterTab, attachmentFilter === 'DOCUMENTS' && styles.filterTabActive]}><Text style={[styles.filterTabText, attachmentFilter === 'DOCUMENTS' && styles.filterTabTextActive]}>Documents ({documentAttachments.length})</Text></Pressable>
                  </View>
                  {attachmentsQuery.isLoading ? <PanelSkeleton rows={3} /> : attachmentFilter === 'MEDIA' ? (
                    mediaAttachments.length > 0 ? (
                      <View style={styles.mediaGrid}>
                        {mediaAttachments.map((attachment) => {
                          const src = apiUrl(attachment.previewUrl ?? attachment.thumbnailUrl ?? attachment.downloadUrl ?? null);
                          return (
                            <Pressable key={attachment.id} onPress={() => setLightbox(src)} style={styles.mediaTile}>
                              {src ? <AuthenticatedImage url={src} resizeMode="cover" style={styles.mediaThumb} /> : <View style={[styles.mediaThumb, styles.mediaThumbEmpty]}><Text style={styles.mediaThumbEmptyText}>{attachment.mediaType?.[0] ?? '?'}</Text></View>}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : <Text style={styles.emptyText}>No media has been shared in this conversation yet.</Text>
                  ) : documentAttachments.length > 0 ? (
                    documentAttachments.map((attachment) => {
                      const mime = (attachment.mimeType ?? '').toLowerCase();
                      const isAudio = mime.startsWith('audio/') || attachment.mediaType === 'AUDIO' || attachment.mediaType === 'VOICE';
                      const isVideo = attachment.mediaType === 'VIDEO' || mime.startsWith('video/');
                      const isPdf = mime === 'application/pdf' || attachment.originalName?.toLowerCase().endsWith('.pdf');
                      const Icon = isVideo ? Film : isAudio ? Music : isPdf ? FileText : File;
                      return (
                        <View key={attachment.id} style={styles.docRow}>
                          <View style={[styles.docIcon, isPdf && styles.docIconPdf]}>
                            <Icon color="#64748b" size={16} />
                          </View>
                          <View style={styles.docInfo}>
                            <Text style={styles.docName} numberOfLines={1}>{attachment.originalName ?? 'Attachment'}</Text>
                            <Text style={styles.docMeta}>{formatAttachmentSize(attachment.sizeBytes) ?? 'Unknown size'}</Text>
                          </View>
                          <Pressable onPress={() => downloadDocument(attachment)} disabled={downloadingId === attachment.id} hitSlop={8} style={styles.docDownload}>
                            {downloadingId === attachment.id ? <ActivityIndicator color="#2563eb" size="small" /> : <Download color="#64748b" size={15} />}
                          </Pressable>
                        </View>
                      );
                    })
                  ) : <Text style={styles.emptyText}>No documents have been shared in this conversation yet.</Text>}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={[styles.statusBar, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable onPress={onToggleStatus} disabled={isUpdatingStatus} style={[styles.statusBtn, conversation.status === 'CLOSED' ? styles.statusBtnClosed : styles.statusBtnOpen]}>
            {isUpdatingStatus ? <ActivityIndicator color={conversation.status === 'CLOSED' ? '#2563eb' : '#10b981'} size="small" /> : conversation.status === 'CLOSED' ? <RotateCcw color="#2563eb" size={17} /> : <Check color="#10b981" size={17} />}
            <Text style={[styles.statusBtnText, conversation.status === 'CLOSED' ? styles.statusBtnTextClosed : styles.statusBtnTextOpen]}>{conversation.status === 'CLOSED' ? 'Reopen conversation' : 'Mark as closed'}</Text>
          </Pressable>
        </View>
      </DrawerShell>
      <Modal visible={Boolean(lightbox)} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable style={styles.lightbox} onPress={() => setLightbox(null)}>
          {lightbox ? <Image source={{ uri: lightbox }} resizeMode="contain" style={styles.lightboxImage} /> : null}
        </Pressable>
      </Modal>
    </Modal>
  );
}

function DrawerShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const translateY = useRef(new Animated.Value(700)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [translateY, opacity]);
  return (
    <View style={styles.drawerRoot}>
      <Animated.View style={[styles.drawerBackdrop, { opacity }]}>
        <Pressable style={styles.drawerBackdropPress} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.drawer, { transform: [{ translateY }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawerRoot: { flex: 1, justifyContent: 'flex-end' },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  drawerBackdropPress: { flex: 1 },
  drawer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 16,
    height: '92%',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  drawerHeader: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e5e7eb', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16 },
  drawerTitle: { color: '#17233a', fontSize: 17, fontWeight: '700', flex: 1 },
  drawerClose: { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 18, height: 34, justifyContent: 'center', width: 34 },
  chatSummaryPill: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#c9def8', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, paddingVertical: 11 },
  sparkWrap: { alignItems: 'center', backgroundColor: '#eef5ff', borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  chatSummaryTitle: { color: '#0d1b2a', flex: 1, fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderColor: '#dfe9f8', borderRadius: 18, borderWidth: 1, marginHorizontal: 16, marginTop: 12, padding: 16 },
  cardHeaderRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { color: '#0f172a', fontSize: 14, fontWeight: '800' },
  collapseBtn: { alignItems: 'center', backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 16, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  customerBox: { borderColor: '#e7eefb', borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 14 },
  customerTop: { flexDirection: 'row', gap: 14 },
  customerAvatarWrap: { height: 52, width: 52 },
  customerAvatar: { borderRadius: 26, height: 52, width: 52 },
  customerAvatarFallback: { alignItems: 'center', backgroundColor: '#2563eb', justifyContent: 'center' },
  customerAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  customerIdentity: { flex: 1, justifyContent: 'center', minWidth: 0 },
  customerName: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  customerMeta: { color: '#64748b', fontSize: 13, marginTop: 3 },
  customerEmail: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  infoRows: { borderTopColor: '#eef2f7', borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  infoRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  infoLabel: { color: '#64748b', fontSize: 13 },
  infoValueWrap: { alignItems: 'center', flexDirection: 'row', gap: 6, maxWidth: '68%' },
  infoValue: { color: '#0f172a', flexShrink: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  editBtn: { alignItems: 'center', height: 26, justifyContent: 'center', width: 26 },
  editFieldWrap: { alignItems: 'center', flexDirection: 'row', gap: 6, maxWidth: '70%' },
  editInput: { backgroundColor: '#fff', borderColor: '#c9def8', borderRadius: 10, borderWidth: 1, color: '#0f172a', flex: 1, fontSize: 12, fontWeight: '600', height: 34, paddingHorizontal: 10 },
  editConfirm: { alignItems: 'center', height: 26, justifyContent: 'center', width: 26 },
  errorText: { color: '#e11d48', fontSize: 11, marginBottom: 6, textAlign: 'right' },
  tagsBody: { marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  chipRemove: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700' },
  emptyText: { color: '#94a3b8', fontSize: 12, paddingVertical: 6 },
  tagSearchWrap: { marginTop: 12 },
  tagSearchInput: { backgroundColor: '#f6f9ff', borderColor: '#dbe4f1', borderRadius: 12, borderWidth: 1, color: '#0f172a', fontSize: 13, height: 40, paddingHorizontal: 12 },
  colorRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  colorDot: { borderRadius: 10, height: 22, width: 22 },
  colorDotActive: { borderColor: '#0f172a', borderWidth: 2 },
  suggestedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  suggestChip: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
  suggestChipText: { color: '#334155', fontSize: 12, fontWeight: '600' },
  createTagBtn: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, height: 40, justifyContent: 'center', marginTop: 12 },
  createTagText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  notesBody: { marginTop: 12 },
  noteItem: { borderBottomColor: '#eef2f7', borderBottomWidth: 1, paddingVertical: 10 },
  noteText: { color: '#0f172a', fontSize: 13, lineHeight: 19 },
  noteMetaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  noteMeta: { color: '#94a3b8', fontSize: 11 },
  noteMetaActions: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  noteDelete: { color: '#e11d48', fontSize: 17, fontWeight: '700' },
  noteEditInput: { backgroundColor: '#f6f9ff', borderColor: '#dbe4f1', borderRadius: 12, borderWidth: 1, color: '#0f172a', fontSize: 13, padding: 10, textAlignVertical: 'top' },
  noteActions: { flexDirection: 'row', gap: 14, marginTop: 8 },
  noteActionBtn: { paddingVertical: 4 },
  noteActionSave: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  noteActionCancel: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  noteComposer: { flexDirection: 'row', gap: 8, marginTop: 12 },
  noteInput: { backgroundColor: '#f6f9ff', borderColor: '#dbe4f1', borderRadius: 12, borderWidth: 1, color: '#0f172a', flex: 1, fontSize: 13, maxHeight: 90, minHeight: 40, paddingHorizontal: 12, paddingVertical: 9 },
  noteAddBtn: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, justifyContent: 'center', paddingHorizontal: 16 },
  noteAddBtnDisabled: { opacity: 0.5 },
  noteAddText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  filesBody: { marginTop: 12 },
  filterTabs: { backgroundColor: '#eaf4ff', borderRadius: 18, flexDirection: 'row', gap: 4, padding: 4 },
  filterTab: { alignItems: 'center', borderRadius: 14, flex: 1, paddingVertical: 8 },
  filterTabActive: { backgroundColor: '#fff' },
  filterTabText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  filterTabTextActive: { color: '#334155' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  mediaTile: { borderRadius: 12, height: 96, overflow: 'hidden', width: 96 },
  mediaThumb: { height: 96, width: 96 },
  mediaThumbEmpty: { alignItems: 'center', backgroundColor: '#e8eef7', justifyContent: 'center' },
  mediaThumbEmptyText: { color: '#94a3b8', fontSize: 18, fontWeight: '700' },
  docRow: { alignItems: 'center', borderRadius: 16, borderColor: '#e4ebf5', borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 10, padding: 10 },
  docIcon: { alignItems: 'center', backgroundColor: '#eef2f7', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  docIconPdf: { backgroundColor: '#fde8e8' },
  docInfo: { flex: 1, minWidth: 0 },
  docName: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  docMeta: { color: '#94a3b8', fontSize: 10, letterSpacing: 0.4, marginTop: 2, textTransform: 'uppercase' },
  docDownload: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  statusBar: { backgroundColor: '#fff', borderTopColor: '#e2e8f0', borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12 },
  statusBtn: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 8, height: 48, justifyContent: 'center' },
  statusBtnOpen: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  statusBtnClosed: { backgroundColor: '#fff', borderColor: '#b9ccff' },
  statusBtnText: { fontSize: 15, fontWeight: '700' },
  statusBtnTextOpen: { color: '#10b981' },
  statusBtnTextClosed: { color: '#2563eb' },
  lightbox: { alignItems: 'center', backgroundColor: '#050505', flex: 1, justifyContent: 'center' },
  lightboxImage: { height: '100%', width: '100%' },
});
