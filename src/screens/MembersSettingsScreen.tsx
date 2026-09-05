import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Globe2, Layers, Mail, RefreshCw, ShieldCheck, UserPlus2, UsersRound, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createWorkspaceInvites,
  fetchWorkspaceRosterMembers,
  validateInviteEmail,
  type WorkspaceInviteRoleHint,
  type WorkspaceRosterMember,
} from '../api/workspaces';
import { fetchChannels } from '../api/channels';
import { showNotice } from '../components/AppToast';
import { BottomSheet, SheetScrollView } from '../components/BottomSheet';
import { ChannelLogo } from '../components/ChannelLogo';
import { ColorfulAvatar } from '../components/ColorfulAvatar';
import { ErrorState } from '../components/ErrorState';
import { ListSkeleton } from '../components/Skeleton';
import { useWorkspaceAccess } from '../lib/workspace-access';
import { useTheme } from '../theme/ThemeContext';
import { AppButton, AppIconButton, AppSearchField, ScreenHeader } from '../ui';

const EMPTY_MEMBERS: WorkspaceRosterMember[] = [];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const INVITE_LIMIT_MESSAGE = 'Workspace reached its member limit. Please contact your workspace admin to free up a seat or upgrade the plan.';

const ROLE_OPTIONS: Array<{ value: WorkspaceInviteRoleHint; label: string; description: string }> = [
  { value: 'AGENT', label: 'Agent', description: 'For inbox operators who handle assigned conversations.' },
  { value: 'MANAGER', label: 'Manager', description: 'For supervisors who monitor team workflow and coverage.' },
];

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

function displayName(member: WorkspaceRosterMember) {
  return member.name?.trim() || member.email.split('@')[0] || member.email;
}

function roleLabel(member: WorkspaceRosterMember) {
  if (member.roleLabel) return member.roleLabel;
  if (member.roleKeys?.includes('workspace_admin')) return 'Owner';
  if (member.roleKeys?.includes('workspace_manager')) return 'Supervisor';
  return 'Agent';
}

function statusLabel(status: WorkspaceRosterMember['status']) {
  if (status === 'ACTIVE') return 'Active';
  if (status === 'INVITED') return 'Invited';
  return 'Disabled';
}

function statusTheme(status: WorkspaceRosterMember['status']) {
  if (status === 'ACTIVE') return { bg: '#dcfce7', fg: '#16a34a', dot: '#22c55e', border: '#bbf7d0' };
  if (status === 'INVITED') return { bg: '#dbeafe', fg: '#2563eb', dot: '#2563eb', border: '#bfdbfe' };
  return { bg: '#f1f5f9', fg: '#64748b', dot: '#94a3b8', border: '#e2e8f0' };
}

function performanceFor(member: WorkspaceRosterMember, index: number) {
  if (member.status === 'INVITED') return { assigned: 0, resolved: 0, rate: 0 };
  const channelWeight = member.accessScope === 'ALL_CHANNELS'
    ? 5
    : Math.max(1, member.channelAssignments?.length ?? 0);
  const roleWeight = member.roleKeys?.includes('workspace_manager') ? 12 : member.roleKeys?.includes('workspace_admin') ? 8 : 0;
  const activeWeight = member.status === 'ACTIVE' ? 36 : 10;
  const assigned = Math.max(0, activeWeight + roleWeight + channelWeight * 9 + (7 - index) * 11);
  const rate = Math.min(92, Math.max(54, 63 + channelWeight * 3 + (index % 3) * 6));
  return { assigned, resolved: Math.round((assigned * rate) / 100), rate };
}

function AccessPill({ member }: { member: WorkspaceRosterMember }) {
  const { colors } = useTheme();
  const channels = member.channelAssignments ?? [];

  if (member.status === 'INVITED' || member.kind === 'INVITE') {
    return (
      <View style={[styles.accessPill, styles.pendingAccess]}>
        <View style={styles.pendingDot} />
        <Text style={styles.pendingText} numberOfLines={1}>Pending invitation</Text>
      </View>
    );
  }

  if (member.accessScope === 'ALL_CHANNELS') {
    return (
      <View style={[styles.accessPill, styles.allAccess, { backgroundColor: colors.surface }]}>
        <Globe2 color="#2563eb" size={14} />
        <Text style={[styles.accessStrong, { color: colors.text }]}>All channels</Text>
        <Text style={[styles.accessMuted, { color: colors.textMuted }]}>workspace-wide</Text>
      </View>
    );
  }

  if (channels.length === 0) {
    return (
      <View style={[styles.accessPill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}>
        <Text style={[styles.accessMuted, { color: colors.textSecondary }]}>Not configured</Text>
      </View>
    );
  }

  if (channels.length === 1) {
    const channel = channels[0];
    return (
      <View style={[styles.singleChannel, { backgroundColor: colors.surfaceSecondary }]}>
        <ChannelLogo type={channel.channelType} box={18} glyph={10} radius={9} />
        <Text style={[styles.channelName, { color: colors.primary }]} numberOfLines={1}>{channel.channelName}</Text>
      </View>
    );
  }

  return (
    <View style={styles.multiChannel}>
      <View style={styles.channelStack}>
        {channels.slice(0, 3).map((channel, index) => (
          <View key={channel.channelId} style={{ marginLeft: index === 0 ? 0 : -7 }}>
            <ChannelLogo type={channel.channelType} box={22} glyph={12} radius={11} />
          </View>
        ))}
      </View>
      <Text style={[styles.accessMuted, { color: colors.textSecondary }]}>{channels.length} channels</Text>
    </View>
  );
}

function MemberCard({ member, index }: { member: WorkspaceRosterMember; index: number }) {
  const { colors } = useTheme();
  const name = displayName(member);
  const status = statusTheme(member.status);
  const performance = performanceFor(member, index);
  const barColor = performance.rate >= 80 ? '#22c55e' : '#2563eb';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={styles.memberHeader}>
        <View style={styles.avatarWrap}>
          <ColorfulAvatar name={name} url={member.avatarUrl} size={42} />
          <View style={[styles.presenceDot, { backgroundColor: status.dot, borderColor: colors.surface }]} />
        </View>
        <View style={styles.memberCopy}>
          <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.memberEmail, { color: colors.textSecondary }]} numberOfLines={1}>{member.email}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: status.bg, borderColor: status.border }]}>
          <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
          <Text style={[styles.statusText, { color: status.fg }]}>{statusLabel(member.status)}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaBlock}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Role</Text>
          <Text style={[styles.rolePill, { backgroundColor: colors.surfaceSecondary, color: colors.primary }]}>{roleLabel(member)}</Text>
        </View>
        <View style={[styles.metaBlock, styles.accessBlock]}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Channel access</Text>
          <AccessPill member={member} />
        </View>
      </View>

      <View style={[styles.performance, { borderTopColor: colors.separator }]}>
        <View style={styles.countBlock}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Assigned</Text>
          <Text style={[styles.assignedText, { color: colors.text }]}>{performance.assigned}</Text>
        </View>
        <View style={styles.countBlock}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Resolved</Text>
          <Text style={styles.resolvedText}>{performance.resolved}</Text>
        </View>
        <View style={styles.rateBlock}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Resolution rate</Text>
          <View style={styles.rateLine}>
            <View style={[styles.rateTrack, { backgroundColor: colors.surfaceSecondary }]}>
              <View style={[styles.rateFill, { backgroundColor: barColor, width: `${performance.rate}%` }]} />
            </View>
            <Text style={[styles.rateText, { color: colors.text }]}>{performance.rate}%</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function MembersSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { workspace, loading: workspaceLoading } = useWorkspaceAccess();
  const workspaceId = workspace?.id;
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<WorkspaceInviteRoleHint>('AGENT');
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [channelSearch, setChannelSearch] = useState('');
  const [channelsExpanded, setChannelsExpanded] = useState(false);
  const [limitToAssigned, setLimitToAssigned] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);

  const rosterQuery = useQuery({
    queryKey: ['workspace-roster', 'settings-members', workspaceId, search],
    queryFn: () => fetchWorkspaceRosterMembers(workspaceId!, search, 100),
    enabled: Boolean(workspaceId),
    staleTime: 20_000,
  });

  const channelsQuery = useQuery({
    queryKey: ['channels', 'invite', workspaceId],
    queryFn: fetchChannels,
    enabled: inviteOpen && Boolean(workspaceId),
    staleTime: 30_000,
  });

  const members = rosterQuery.data?.items ?? EMPTY_MEMBERS;
  const summary = useMemo(() => ({
    total: members.length,
    active: members.filter((member) => member.status === 'ACTIVE').length,
    invited: members.filter((member) => member.status === 'INVITED').length,
  }), [members]);

  const existingEmailSet = useMemo(
    () => new Set(members.map((member) => member.email.trim().toLowerCase())),
    [members],
  );

  const workspaceChannels = useMemo(
    () => (channelsQuery.data?.items ?? []).filter((channel) => !workspaceId || channel.workspaceId === workspaceId),
    [channelsQuery.data, workspaceId],
  );

  const filteredChannels = useMemo(() => {
    const query = channelSearch.trim().toLowerCase();
    if (!query) return workspaceChannels;
    return workspaceChannels.filter((channel) => {
      const phone = channel.accounts[0]?.displayPhoneNumber ?? '';
      return [channel.name, phone, channel.type, channel.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [workspaceChannels, channelSearch]);

  const selectedChannels = useMemo(
    () => workspaceChannels.filter((channel) => selectedChannelIds.includes(channel.id)),
    [workspaceChannels, selectedChannelIds],
  );

  const hasRequiredChannels = workspaceChannels.length === 0 || selectedChannelIds.length > 0;
  const normalizedDraft = normalizeEmail(emailDraft);
  const hasValidDraft = normalizedDraft ? isValidEmail(normalizedDraft) : false;
  const hasRecipient = emails.length > 0 || hasValidDraft;

  const openInvite = () => {
    setEmails([]);
    setEmailDraft('');
    setEmailError(null);
    setInviteRole('AGENT');
    setSelectedChannelIds([]);
    setChannelSearch('');
    setChannelsExpanded(false);
    setLimitToAssigned(false);
    setSendEmail(true);
    setInviteOpen(true);
  };

  const addEmailsFromText = async (value: string): Promise<boolean> => {
    const parts = value
      .split(/[\n,;]+/)
      .map((item) => normalizeEmail(item))
      .filter(Boolean);

    if (parts.length === 0) return false;

    const invalidEmail = parts.find((email) => !isValidEmail(email));
    if (invalidEmail) {
      setEmailError(`"${invalidEmail}" is not a valid email address.`);
      return false;
    }

    const duplicate = parts.find((email) => existingEmailSet.has(email) || emails.includes(email));
    if (duplicate) {
      setEmailError(`"${duplicate}" already belongs to this workspace.`);
      return false;
    }

    if (workspaceId) {
      try {
        const result = await validateInviteEmail(workspaceId, parts[0]);
        if (result.exists) {
          setEmailError(result.userExists
            ? 'A user with this email address already exists in the system.'
            : 'This email already has a pending invite.');
          return false;
        }
      } catch {
        return false;
      }
    }

    setEmails((current) => Array.from(new Set([...current, ...parts])));
    setEmailError(null);
    return true;
  };

  const commitEmailDraft = async () => {
    if (!normalizeEmail(emailDraft)) return;
    if (await addEmailsFromText(emailDraft)) setEmailDraft('');
  };

  const handleDraftChange = (value: string) => {
    if (emailError) setEmailError(null);
    if (/[,;\n]/.test(value)) {
      void (async () => {
        const added = await addEmailsFromText(value);
        setEmailDraft(added ? '' : value);
      })();
      return;
    }
    setEmailDraft(value);
  };

  const toggleChannel = (channelId: string) => {
    setSelectedChannelIds((current) => current.includes(channelId)
      ? current.filter((id) => id !== channelId)
      : [...current, channelId]);
  };

  const inviteMutation = useMutation({
    mutationFn: async () => {
      let workingEmails = [...emails];
      const draft = normalizeEmail(emailDraft);
      if (draft) {
        if (!(await addEmailsFromText(draft))) throw new Error('Fix the email addresses before sending.');
        workingEmails = Array.from(new Set([...workingEmails, draft]));
        setEmailDraft('');
      }
      if (workingEmails.length === 0) throw new Error('Enter at least one email address.');
      return createWorkspaceInvites({
        workspaceId: workspaceId!,
        emails: workingEmails,
        roleHint: inviteRole,
        limitToAssignedConversations: inviteRole === 'AGENT' ? limitToAssigned : false,
        channelIds: selectedChannelIds,
        sendEmail,
      });
    },
    onSuccess: async (result) => {
      setInviteOpen(false);
      setEmails([]);
      setEmailDraft('');
      setEmailError(null);
      setInviteRole('AGENT');
      setSelectedChannelIds([]);
      setChannelSearch('');
      setChannelsExpanded(false);
      setLimitToAssigned(false);
      setSendEmail(true);
      await queryClient.invalidateQueries({ queryKey: ['workspace-roster'] });
      const count = result.items.length;
      showNotice(
        'Workspace invites created',
        sendEmail
          ? `${count} invitation ${count === 1 ? 'email was' : 'emails were'} queued.`
          : 'The invitation links are ready in the roster.',
      );
    },
    onError: (error) => {
      if (error instanceof Error && error.message === 'Fix the email addresses before sending.') return;
      if (error instanceof Error && error.message.toLowerCase().includes('member limit')) {
        showNotice('Workspace is full', INVITE_LIMIT_MESSAGE);
        return;
      }
      showNotice('Could not create invites', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const canSubmit = hasRecipient && hasRequiredChannels && !inviteMutation.isPending;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Members"
        subtitle="Team access and performance"
        onBack={() => navigation.goBack()}
        right={(
          <AppIconButton
            icon={RefreshCw}
            accessibilityLabel="Refresh members"
            loading={rosterQuery.isRefetching}
            onPress={() => void rosterQuery.refetch()}
          />
        )}
      />

      <View style={[styles.searchRow, { backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <AppSearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search members"
          size="sm"
          tone="background"
        />
        <AppButton
          label="Invite"
          icon={UserPlus2}
          onPress={openInvite}
          style={styles.inviteButton}
        />
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{summary.total}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statValue, { color: '#16a34a' }]}>{summary.active}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Active</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statValue, { color: '#2563eb' }]}>{summary.invited}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Invited</Text>
        </View>
      </View>

      {workspaceLoading || rosterQuery.isLoading ? (
        <ListSkeleton rows={6} avatar />
      ) : !workspaceId ? (
        <ErrorState message="Unable to load workspace." />
      ) : rosterQuery.isError ? (
        <ErrorState
          message={rosterQuery.error instanceof Error ? rosterQuery.error.message : 'Could not load members.'}
          onRetry={() => void rosterQuery.refetch()}
        />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => `${item.kind ?? 'MEMBER'}-${item.id}`}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
          ListEmptyComponent={(
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
              <UsersRound color={colors.textMuted} size={30} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No members found</Text>
              <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Try another search or invite a teammate.</Text>
            </View>
          )}
          renderItem={({ item, index }) => <MemberCard member={item} index={index} />}
        />
      )}

      <BottomSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} sheetStyle={styles.sheet}>
        <View style={styles.sheetHeader}>
          <View style={[styles.sheetIcon, { backgroundColor: colors.surfaceSecondary }]}>
            <UserPlus2 color={colors.primary} size={20} />
          </View>
          <View style={styles.sheetCopy}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Invite team members</Text>
            <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>Send an email invite - they&apos;ll get access right after accepting.</Text>
          </View>
        </View>

        <SheetScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
          <View style={styles.fieldBlock}>
            <View style={styles.fieldLabelRow}>
              <Mail color={colors.textMuted} size={14} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email addresses</Text>
            </View>
            <View style={[styles.chipBox, { backgroundColor: colors.background, borderColor: emailError ? colors.error : colors.cardBorder }]}>
              <View style={styles.chipWrap}>
                {emails.map((email) => (
                  <View key={email} style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.chipText, { color: colors.primary }]} numberOfLines={1}>{email}</Text>
                    <Pressable
                      onPress={() => setEmails((current) => current.filter((item) => item !== email))}
                      hitSlop={8}
                      accessibilityLabel={`Remove ${email}`}
                    >
                      <X color={colors.textMuted} size={13} />
                    </Pressable>
                  </View>
                ))}
              </View>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="done"
                value={emailDraft}
                onChangeText={handleDraftChange}
                onBlur={() => void commitEmailDraft()}
                onSubmitEditing={() => void commitEmailDraft()}
                placeholder={emails.length === 0 ? 'name@company.com, another@company.com' : 'Add another email'}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text }]}
              />
            </View>
            <Text style={[styles.helperText, { color: colors.textMuted }]}>Press Enter or comma to add multiple addresses.</Text>
            {emailError ? <Text style={[styles.errorText, { color: colors.error }]}>{emailError}</Text> : null}
          </View>

          <View style={styles.fieldBlock}>
            <View style={styles.fieldLabelRow}>
              <ShieldCheck color={colors.textMuted} size={14} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Role</Text>
            </View>
            <View style={styles.roleList}>
              {ROLE_OPTIONS.map((option) => {
                const selected = inviteRole === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setInviteRole(option.value)}
                    style={[
                      styles.roleCard,
                      { backgroundColor: colors.background, borderColor: selected ? colors.primary : colors.cardBorder },
                      selected && styles.roleCardActive,
                    ]}
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.roleCardTop}>
                      <Text style={[styles.roleCardLabel, { color: colors.text }]}>{option.label}</Text>
                      {selected ? <Check color={colors.primary} size={16} /> : null}
                    </View>
                    <Text style={[styles.roleCardDescription, { color: colors.textSecondary }]}>{option.description}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <View style={styles.fieldLabelRow}>
              <Layers color={colors.textMuted} size={14} />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Channels</Text>
            </View>
            {channelsQuery.isLoading ? (
              <Text style={[styles.helperText, { color: colors.textMuted }]}>Loading channels…</Text>
            ) : workspaceChannels.length === 0 ? (
              <View style={[styles.noChannels, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>No channels are connected yet. The invite will still work.</Text>
              </View>
            ) : (
              <View style={styles.dropdown}>
                <Pressable
                  onPress={() => setChannelsExpanded((current) => !current)}
                  style={[
                    styles.dropdownTrigger,
                    { backgroundColor: colors.background, borderColor: channelsExpanded ? colors.primary : colors.cardBorder },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: channelsExpanded }}
                  accessibilityLabel={selectedChannels.length === 0 ? 'Select channels' : `${selectedChannels.length} channels selected`}
                >
                  <Text
                    style={[styles.dropdownTriggerText, { color: selectedChannels.length === 0 ? colors.textMuted : colors.text }]}
                    numberOfLines={1}
                  >
                    {selectedChannels.length === 0
                      ? 'Select channels'
                      : `${selectedChannels.length} ${selectedChannels.length === 1 ? 'channel' : 'channels'} selected`}
                  </Text>
                  <ChevronDown
                    color={colors.textMuted}
                    size={18}
                    style={{ transform: [{ rotate: channelsExpanded ? '180deg' : '0deg' }] }}
                  />
                </Pressable>
                {selectedChannels.length > 0 ? (
                  <View style={styles.selectedWrap}>
                    {selectedChannels.map((channel) => (
                      <View
                        key={channel.id}
                        style={[styles.selectedChip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}
                      >
                        <ChannelLogo type={channel.type} box={20} glyph={11} radius={10} />
                        <Text style={[styles.selectedChipText, { color: colors.text }]} numberOfLines={1}>
                          {channel.name}
                        </Text>
                        <Pressable
                          onPress={() => toggleChannel(channel.id)}
                          hitSlop={8}
                          accessibilityLabel={`Remove ${channel.name}`}
                        >
                          <X color={colors.textMuted} size={13} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
                {channelsExpanded ? (
                  <View style={[styles.dropdownPanel, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                    <AppSearchField
                      value={channelSearch}
                      onChangeText={setChannelSearch}
                      placeholder="Search channels"
                      size="sm"
                      tone="surface"
                      fill={false}
                    />
                    {filteredChannels.map((channel) => {
                      const selected = selectedChannelIds.includes(channel.id);
                      const phone = channel.accounts[0]?.displayPhoneNumber;
                      return (
                        <Pressable
                          key={channel.id}
                          onPress={() => toggleChannel(channel.id)}
                          style={[
                            styles.channelRow,
                            { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.cardBorder },
                          ]}
                          accessibilityState={{ selected }}
                        >
                          <ChannelLogo type={channel.type} box={28} glyph={15} radius={14} />
                          <View style={styles.channelCopy}>
                            <Text style={[styles.channelName, { color: colors.text }]} numberOfLines={1}>{channel.name}</Text>
                            {phone ? <Text style={[styles.channelSub, { color: colors.textMuted }]} numberOfLines={1}>{phone}</Text> : null}
                          </View>
                          <View style={[
                            styles.checkbox,
                            { borderColor: selected ? colors.primary : colors.cardBorder, backgroundColor: selected ? colors.primary : 'transparent' },
                          ]}>
                            {selected ? <Check color="#fff" size={14} /> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                    {filteredChannels.length === 0 ? (
                      <Text style={[styles.helperText, { color: colors.textMuted }]}>No channels match your search.</Text>
                    ) : null}
                  </View>
                ) : null}
                {!hasRequiredChannels ? (
                  <Text style={[styles.errorText, { color: colors.error }]}>Select at least one channel.</Text>
                ) : null}
              </View>
            )}
          </View>

          {inviteRole === 'AGENT' ? (
            <Pressable
              onPress={() => setLimitToAssigned((current) => !current)}
              style={[styles.toggleCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}
              accessibilityState={{ checked: limitToAssigned }}
              accessibilityRole="checkbox"
            >
              <View style={[styles.checkbox, { borderColor: limitToAssigned ? colors.primary : colors.cardBorder, backgroundColor: limitToAssigned ? colors.primary : 'transparent' }]}>
                {limitToAssigned ? <Check color="#fff" size={14} /> : null}
              </View>
              <View style={styles.toggleCopy}>
                <Text style={[styles.toggleTitle, { color: colors.text }]}>Agents can see only assigned conversations</Text>
                <Text style={[styles.toggleSub, { color: colors.textSecondary }]}>
                  {limitToAssigned ? 'On - agents only see conversations assigned to them.' : 'Off - agents can see all conversations in their channels.'}
                </Text>
              </View>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => setSendEmail((current) => !current)}
            style={[styles.toggleCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}
            accessibilityState={{ checked: sendEmail }}
            accessibilityRole="checkbox"
          >
            <View style={[styles.checkbox, { borderColor: sendEmail ? colors.primary : colors.cardBorder, backgroundColor: sendEmail ? colors.primary : 'transparent' }]}>
              {sendEmail ? <Check color="#fff" size={14} /> : null}
            </View>
            <View style={styles.toggleCopy}>
              <Text style={[styles.toggleTitle, { color: colors.text }]}>Send invite email</Text>
            </View>
          </Pressable>
        </SheetScrollView>

        <View style={[styles.sheetFooter, { borderTopColor: colors.cardBorder }]}>
          <Text style={[styles.footerSummary, { color: colors.textMuted }]}>
            {emails.length + (hasValidDraft ? 1 : 0)} {emails.length + (hasValidDraft ? 1 : 0) === 1 ? 'recipient' : 'recipients'} · {selectedChannelIds.length} {selectedChannelIds.length === 1 ? 'channel' : 'channels'}
          </Text>
          <View style={styles.sheetActions}>
            <AppButton variant="secondary" label="Cancel" onPress={() => setInviteOpen(false)} />
            <AppButton
              label={inviteMutation.isPending ? 'Sending...' : sendEmail ? 'Send invite email' : 'Generate invitation links'}
              icon={Mail}
              loading={inviteMutation.isPending}
              disabled={!canSubmit}
              onPress={() => inviteMutation.mutate()}
            />
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inviteButton: { paddingHorizontal: 14 },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  stat: { borderRadius: 14, borderWidth: 1, flex: 1, padding: 12 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '700', marginTop: 3 },
  listContent: { gap: 10, padding: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  memberHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  avatarWrap: { position: 'relative' },
  presenceDot: { borderRadius: 6, borderWidth: 2, bottom: 0, height: 12, position: 'absolute', right: 0, width: 12 },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 15, fontWeight: '800' },
  memberEmail: { fontSize: 12, marginTop: 3 },
  statusPill: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 9, paddingVertical: 5 },
  statusDot: { borderRadius: 3, height: 6, width: 6 },
  statusText: { fontSize: 11, fontWeight: '800' },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  metaBlock: { minWidth: 82 },
  accessBlock: { flex: 1, minWidth: 0 },
  metaLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  rolePill: { alignSelf: 'flex-start', borderRadius: 999, fontSize: 11, fontWeight: '800', marginTop: 6, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5 },
  accessPill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 7, marginTop: 6, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 6 },
  allAccess: { borderColor: '#bfdbfe', borderStyle: 'dashed' },
  pendingAccess: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderStyle: 'dashed' },
  pendingDot: { backgroundColor: '#64748b', borderRadius: 2, height: 4, width: 4 },
  pendingText: { color: '#64748b', flexShrink: 1, fontSize: 11, fontWeight: '700' },
  accessStrong: { fontSize: 11, fontWeight: '800' },
  accessMuted: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
  singleChannel: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, flexDirection: 'row', gap: 7, marginTop: 6, maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 5 },
  channelName: { flexShrink: 1, fontSize: 11, fontWeight: '800' },
  multiChannel: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 7 },
  channelStack: { flexDirection: 'row' },
  performance: { borderTopWidth: 1, flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 12 },
  countBlock: { width: 72 },
  assignedText: { fontSize: 16, fontWeight: '700', marginTop: 5 },
  resolvedText: { color: '#22c55e', fontSize: 16, fontWeight: '800', marginTop: 5 },
  rateBlock: { flex: 1, minWidth: 0 },
  rateLine: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  rateTrack: { borderRadius: 999, flex: 1, height: 6, overflow: 'hidden' },
  rateFill: { borderRadius: 999, height: 6 },
  rateText: { fontSize: 12, fontWeight: '800', minWidth: 34 },
  emptyCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, padding: 28 },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 12 },
  emptyBody: { fontSize: 13, lineHeight: 19, marginTop: 4, textAlign: 'center' },
  sheet: { paddingBottom: 12, paddingHorizontal: 20, paddingTop: 6 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 12 },
  sheetIcon: { alignItems: 'center', borderRadius: 18, height: 42, justifyContent: 'center', width: 42 },
  sheetCopy: { flex: 1, marginLeft: 12, minWidth: 0 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetSubtitle: { fontSize: 12, marginTop: 2 },
  sheetBody: { gap: 18, paddingBottom: 16, paddingTop: 4 },
  fieldBlock: { gap: 8 },
  fieldLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  chipBox: { borderRadius: 14, borderWidth: 1, gap: 4, paddingHorizontal: 12, paddingVertical: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 6, maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 5 },
  chipText: { flexShrink: 1, fontSize: 12, fontWeight: '700' },
  input: { fontSize: 14, minHeight: 32, paddingVertical: 4, textAlignVertical: 'top' },
  helperText: { fontSize: 11 },
  errorText: { fontSize: 12, fontWeight: '600' },
  roleList: { gap: 8 },
  roleCard: { borderRadius: 14, borderWidth: 1, padding: 12 },
  roleCardActive: { borderWidth: 1.5 },
  roleCardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  roleCardLabel: { fontSize: 13, fontWeight: '800' },
  roleCardDescription: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  noChannels: { borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  dropdown: { gap: 8 },
  dropdownTrigger: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 46, paddingHorizontal: 12, paddingVertical: 11 },
  dropdownTriggerText: { flex: 1, fontSize: 14, fontWeight: '600', minWidth: 0 },
  selectedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectedChip: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, maxWidth: '100%', paddingLeft: 4, paddingRight: 6, paddingVertical: 4 },
  selectedChipText: { flexShrink: 1, fontSize: 12, fontWeight: '700' },
  dropdownPanel: { borderRadius: 14, borderWidth: 1, gap: 8, padding: 10 },
  channelRow: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10 },
  channelCopy: { flex: 1, minWidth: 0 },
  channelSub: { fontSize: 11, marginTop: 2 },
  toggleCard: { alignItems: 'flex-start', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  toggleCopy: { flex: 1, minWidth: 0 },
  toggleTitle: { fontSize: 13, fontWeight: '800' },
  toggleSub: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  checkbox: { alignItems: 'center', borderRadius: 6, borderWidth: 1, height: 22, justifyContent: 'center', marginTop: 1, width: 22 },
  sheetFooter: { borderTopWidth: 1, gap: 10, paddingTop: 12 },
  footerSummary: { fontSize: 11 },
  sheetActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
});
