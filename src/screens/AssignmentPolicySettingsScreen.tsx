import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  Hand,
  Save,
  UserRound,
  Workflow,
} from 'lucide-react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { showNotice } from '../components/AppToast';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { AppButton, ScreenHeader } from '../ui';
import {
  fetchWorkspaceAssignmentPolicy,
  updateWorkspaceAssignmentPolicy,
  type WorkspaceAssignmentMode,
  type WorkspaceAssignmentPolicy,
} from '../api/assignmentPolicy';
import {
  fetchMyWorkspaces,
  fetchWorkspaceRosterMembers,
  workspaceCanUpdateSettings,
} from '../api/workspaces';
import { AppToggle } from '../components/AppToggle';
import { BottomSheet, SheetFlatList } from '../components/BottomSheet';
import { ErrorState } from '../components/ErrorState';
import { FormSkeleton, PanelSkeleton } from '../components/Skeleton';

const MODE_CARDS: Array<{
  value: WorkspaceAssignmentMode;
  title: string;
  description: string;
  icon: typeof Workflow;
}> = [
  { value: 'ROUND_ROBIN', title: 'Round robin', description: 'Share evenly across eligible agents', icon: Workflow },
  { value: 'DEFAULT_OWNER', title: 'Default owner', description: 'Always assign to a designated owner', icon: UserRound },
  { value: 'UNASSIGNED', title: 'Manual only', description: 'Agents pick up new threads themselves', icon: Hand },
];

const CALL_CARDS: Array<{
  value: 'BROADCAST' | 'ROUND_ROBIN';
  title: string;
  description: string;
  icon: typeof Workflow;
}> = [
  {
    value: 'BROADCAST',
    title: 'Broadcast',
    description: 'Show the call to all eligible online members, including admins.',
    icon: Workflow,
  },
  {
    value: 'ROUND_ROBIN',
    title: 'Round robin',
    description: 'Route unassigned calls to one eligible online manager or agent at a time.',
    icon: UserRound,
  },
];

function ModeCard({
  title,
  description,
  icon: Icon,
  selected,
  disabled,
  onSelect,
  colors,
}: {
  title: string;
  description: string;
  icon: typeof Workflow;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  colors: { text: string; textSecondary: string; primary: string; surface: string; cardBorder: string };
}) {
  return (
    <Pressable
      style={[styles.modeCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, selected && { borderColor: colors.primary }, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onSelect}
    >
      <View style={[styles.modeIcon, selected && { backgroundColor: colors.primary }]}>
        <Icon color={selected ? '#fff' : colors.textSecondary} size={18} />
      </View>
      <View style={styles.modeCopy}>
        <View style={styles.modeTitleRow}>
          <Text style={[styles.modeTitle, { color: colors.text }]}>{title}</Text>
          {selected ? <Check color={colors.primary} size={16} /> : null}
        </View>
        <Text style={[styles.modeBody, { color: colors.textSecondary }]}>{description}</Text>
      </View>
    </Pressable>
  );
}

function AssignmentPolicyForm({
  workspaceId,
  workspaceName,
  canUpdate,
  policy,
}: {
  workspaceId: string;
  workspaceName: string;
  canUpdate: boolean;
  policy: WorkspaceAssignmentPolicy | null;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [enabled, setEnabled] = useState(policy?.enabled ?? true);
  const [mode, setMode] = useState<WorkspaceAssignmentMode>(policy?.mode ?? 'DEFAULT_OWNER');
  const [defaultOwnerUserId, setDefaultOwnerUserId] = useState<string | null>(policy?.defaultOwnerUserId ?? null);
  const [onlyOnlineAgents, setOnlyOnlineAgents] = useState(policy?.onlyOnlineAgents ?? false);
  const [maxConversationsPerAgent, setMaxConversationsPerAgent] = useState(
    policy?.maxConversationsPerAgent == null ? '' : String(policy.maxConversationsPerAgent),
  );
  const [whatsappCallRoutingMode, setWhatsappCallRoutingMode] = useState<'BROADCAST' | 'ROUND_ROBIN'>(
    policy?.whatsappCallRoutingMode ?? 'BROADCAST',
  );
  const [whatsappCallAssignedOnly, setWhatsappCallAssignedOnly] = useState(policy?.whatsappCallAssignedOnly ?? false);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState('');
  const deferredOwnerSearch = useDeferredValue(ownerSearch.trim());

  const ownersQuery = useQuery({
    queryKey: ['workspace-roster', workspaceId, deferredOwnerSearch],
    queryFn: () => fetchWorkspaceRosterMembers(workspaceId, deferredOwnerSearch || undefined, 20),
    enabled: ownerPickerOpen,
    staleTime: 60_000,
  });

  const owners = useMemo(
    () => (ownersQuery.data?.items ?? []).filter((member) => member.status === 'ACTIVE'),
    [ownersQuery.data?.items],
  );

  const selectedOwnerLabel = useMemo(() => {
    const fromList = owners.find((member) => member.userId === defaultOwnerUserId);
    if (fromList) return fromList.name?.trim() || fromList.email;
    return policy?.defaultOwner?.name?.trim()
      || policy?.defaultOwner?.email
      || (defaultOwnerUserId ? 'Selected owner' : 'Select default owner');
  }, [defaultOwnerUserId, owners, policy?.defaultOwner]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsedMax = maxConversationsPerAgent.trim() === ''
        ? null
        : Number(maxConversationsPerAgent);
      if (
        maxConversationsPerAgent.trim() !== ''
        && (parsedMax == null || !Number.isInteger(parsedMax) || parsedMax <= 0)
      ) {
        throw new Error('Max conversations must be a positive whole number.');
      }
      if (mode === 'DEFAULT_OWNER' && !defaultOwnerUserId) {
        throw new Error('Select a default owner before saving.');
      }
      return updateWorkspaceAssignmentPolicy(workspaceId, {
        enabled,
        mode,
        defaultOwnerUserId: mode === 'DEFAULT_OWNER' ? defaultOwnerUserId : null,
        onlyOnlineAgents,
        maxConversationsPerAgent: parsedMax,
        whatsappCallRoutingMode,
        whatsappCallAssignedOnly,
      });
    },
    onSuccess: async (result) => {
      await queryClient.setQueryData(['workspace-assignment-policy', workspaceId], result);
      showNotice('Assignment policy saved');
    },
    onError: (error: Error) => {
      showNotice('Could not save assignment policy', error.message);
    },
  });

  const disabled = !canUpdate || saveMutation.isPending;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Assignment Policy"
        subtitle={`How new conversations are assigned in ${workspaceName}`}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        {!canUpdate ? (
          <View style={styles.infoBanner}>
            <AlertCircle color="#c2410c" size={16} />
            <Text style={styles.infoBannerText}>You can view this policy, but only admins and managers can change it.</Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.rowBetween}>
            <View style={styles.flexCopy}>
              <View style={styles.titleLine}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Auto-assign conversations</Text>
                <Text style={[styles.badge, enabled ? styles.badgeOn : styles.badgeOff]}>{enabled ? 'On' : 'Off'}</Text>
              </View>
              <Text style={[styles.cardBody, { color: colors.textSecondary }]}>Route new threads automatically using your selected mode below.</Text>
            </View>
            <AppToggle value={enabled} onValueChange={setEnabled} disabled={disabled} accessibilityLabel="Auto-assign conversations" />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Assignment mode</Text>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>How the system selects an agent.</Text>
          <View style={styles.modeList}>
            {MODE_CARDS.map((option) => (
              <ModeCard
                key={option.value}
                title={option.title}
                description={option.description}
                icon={option.icon}
                selected={mode === option.value}
                disabled={disabled}
                onSelect={() => setMode(option.value)}
                colors={colors}
              />
            ))}
          </View>

          {mode === 'DEFAULT_OWNER' ? (
            <View style={[styles.nestedCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Default owner</Text>
              <Text style={[styles.cardBody, { color: colors.textSecondary }]}>Choose the owner who receives all new conversations in this mode.</Text>
              <Pressable
                style={[styles.ownerButton, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, disabled && styles.disabled]}
                disabled={disabled}
                onPress={() => setOwnerPickerOpen(true)}
              >
                <Text style={[styles.ownerButtonText, { color: colors.text }]} numberOfLines={1}>{selectedOwnerLabel}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              {mode === 'ROUND_ROBIN'
                ? 'Share new conversations evenly across eligible agents.'
                : 'New conversations stay open for manual assignment.'}
            </Text>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Constraints</Text>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>Keep routing safe and balanced.</Text>

          <View style={[styles.constraintRow, styles.rowBorder, { borderBottomColor: colors.separator }]}>
            <View style={styles.flexCopy}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Only assign to online agents</Text>
              <Text style={[styles.cardBody, { color: colors.textSecondary }]}>Skip agents who are currently offline.</Text>
            </View>
            <AppToggle value={onlyOnlineAgents} onValueChange={setOnlyOnlineAgents} disabled={disabled} accessibilityLabel="Only assign to online agents" />
          </View>

          <View style={[styles.constraintRow, styles.rowBorder, { borderBottomColor: colors.separator }]}>
            <View style={styles.flexCopy}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Max open conversations per agent</Text>
              <Text style={[styles.cardBody, { color: colors.textSecondary }]}>Leave empty for no limit.</Text>
            </View>
            <TextInput
              value={maxConversationsPerAgent}
              onChangeText={setMaxConversationsPerAgent}
              editable={!disabled}
              keyboardType="number-pad"
              placeholder="Unlimited"
              placeholderTextColor={colors.textMuted}
              style={[styles.numberInput, { backgroundColor: colors.surface, borderColor: colors.cardBorder, color: colors.text }]}
            />
          </View>

          <View style={styles.fallbackRow}>
            <View style={styles.fallbackIcon}>
              <AlertCircle color="#d97706" size={16} />
            </View>
            <View style={styles.flexCopy}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Fallback behavior</Text>
              <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
                If no agent is eligible, the conversation stays unassigned rather than forcing a bad match.
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Call routing</Text>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>Control how incoming WhatsApp calls are routed and who can receive them.</Text>
          <View style={styles.modeList}>
            {CALL_CARDS.map((option) => (
              <ModeCard
                key={option.value}
                title={option.title}
                description={option.description}
                icon={option.icon}
                selected={whatsappCallRoutingMode === option.value}
                disabled={disabled}
                onSelect={() => setWhatsappCallRoutingMode(option.value)}
                colors={colors}
              />
            ))}
          </View>

          <View style={[styles.nestedCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
            <View style={styles.rowBetween}>
              <View style={styles.flexCopy}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Send calls only to assigned member</Text>
                <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
                  When enabled, assigned conversation calls skip broadcast and round robin, then ring only the assignee.
                </Text>
              </View>
              <AppToggle
                value={whatsappCallAssignedOnly}
                onValueChange={setWhatsappCallAssignedOnly}
                disabled={disabled}
                accessibilityLabel="Send calls only to assigned member"
              />
            </View>
          </View>
        </View>

        <AppButton
          block
          style={styles.saveButtonSpacing}
          icon={Save}
          label="Save settings"
          loading={saveMutation.isPending}
          disabled={disabled}
          onPress={() => saveMutation.mutate()}
        />
      </ScrollView>

      <BottomSheet visible={ownerPickerOpen} onClose={() => setOwnerPickerOpen(false)} sheetStyle={styles.sheetSurface}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Select default owner</Text>
            <TextInput
              value={ownerSearch}
              onChangeText={setOwnerSearch}
              placeholder="Search workspace members"
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { backgroundColor: colors.background, borderColor: colors.cardBorder, color: colors.text }]}
            />
            {ownersQuery.isLoading ? (
              <PanelSkeleton rows={5} />
            ) : (
              <SheetFlatList
                data={owners}
                keyExtractor={(item) => item.userId}
                style={{ marginTop: 10, maxHeight: 360 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const selected = item.userId === defaultOwnerUserId;
                  return (
                    <Pressable
                      style={[styles.ownerRow, selected && { backgroundColor: colors.surfaceSecondary }]}
                      onPress={() => {
                        setDefaultOwnerUserId(item.userId);
                        setOwnerPickerOpen(false);
                        setOwnerSearch('');
                      }}
                    >
                      <View style={styles.flexCopy}>
                        <Text style={[styles.ownerName, { color: colors.text }]}>{item.name?.trim() || item.email}</Text>
                        {item.name?.trim() ? <Text style={[styles.ownerEmail, { color: colors.textSecondary }]}>{item.email}</Text> : null}
                      </View>
                      {selected ? <Check color={colors.primary} size={18} /> : null}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={<Text style={[styles.emptyOwners, { color: colors.textMuted }]}>No active members match your search.</Text>}
              />
            )}
        </BottomSheet>
    </View>
  );
}

export function AssignmentPolicySettingsScreen() {
  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });
  const workspace = workspacesQuery.data?.items?.[0] ?? null;
  const workspaceId = workspace?.id;
  const canUpdate = workspaceCanUpdateSettings(workspace);

  const policyQuery = useQuery({
    queryKey: workspaceId ? ['workspace-assignment-policy', workspaceId] : ['workspace-assignment-policy', 'disabled'],
    queryFn: () => fetchWorkspaceAssignmentPolicy(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });

  if (workspacesQuery.isLoading || policyQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <FormSkeleton fields={6} />
      </View>
    );
  }

  if (workspacesQuery.isError || !workspaceId) {
    return (
      <View style={styles.screen}>
        <ErrorState
          message={workspacesQuery.error instanceof Error ? workspacesQuery.error.message : 'Unable to load workspace.'}
          onRetry={() => workspacesQuery.refetch()}
        />
      </View>
    );
  }

  if (policyQuery.isError) {
    return (
      <View style={styles.screen}>
        <ErrorState
          message={policyQuery.error instanceof Error ? policyQuery.error.message : 'Unable to load assignment policy.'}
          onRetry={() => policyQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <AssignmentPolicyForm
      key={policyQuery.data?.policy?.updatedAt ?? workspaceId}
      workspaceId={workspaceId}
      workspaceName={policyQuery.data?.workspaceName ?? workspace.name}
      canUpdate={canUpdate}
      policy={policyQuery.data?.policy ?? null}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loader: { marginTop: 80 },
  content: { gap: 12, padding: 16 },
  infoBanner: { alignItems: 'flex-start', backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 12 },
  infoBannerText: { color: '#c2410c', flex: 1, fontSize: 13, lineHeight: 18 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardBody: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  rowBetween: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  flexCopy: { flex: 1, minWidth: 0 },
  titleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { borderRadius: 999, fontSize: 10, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, textTransform: 'uppercase' },
  badgeOn: { backgroundColor: '#ecfdf5', color: '#047857' },
  badgeOff: { backgroundColor: '#f1f5f9', color: '#64748b' },
  modeList: { gap: 10, marginTop: 14 },
  modeCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
  modeCardSelected: { backgroundColor: '#f3f7ff' },
  modeIcon: { alignItems: 'center', backgroundColor: '#edf4ff', borderRadius: 14, height: 40, justifyContent: 'center', width: 40 },
  modeCopy: { flex: 1, minWidth: 0 },
  modeTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  modeTitle: { fontSize: 14, fontWeight: '700' },
  modeBody: { fontSize: 12, marginTop: 2 },
  nestedCard: { borderRadius: 16, borderWidth: 1, marginTop: 14, padding: 12 },
  ownerButton: { borderRadius: 12, borderWidth: 1, marginTop: 10, paddingHorizontal: 12, paddingVertical: 12 },
  ownerButtonText: { fontSize: 14, fontWeight: '600' },
  helperText: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  constraintRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  numberInput: { borderRadius: 12, borderWidth: 1, minWidth: 100, paddingHorizontal: 12, paddingVertical: 10, textAlign: 'center' },
  fallbackRow: { flexDirection: 'row', gap: 12, paddingTop: 14 },
  fallbackIcon: { alignItems: 'center', backgroundColor: '#fffbeb', borderRadius: 999, height: 32, justifyContent: 'center', width: 32 },
  saveButtonSpacing: { marginTop: 4 },
  disabled: { opacity: 0.55 },
  sheetOverlay: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheetSurface: { paddingBottom: 20, paddingHorizontal: 20, paddingTop: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  searchInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  ownerRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 12 },
  ownerName: { fontSize: 14, fontWeight: '700' },
  ownerEmail: { fontSize: 12, marginTop: 2 },
  emptyOwners: { fontSize: 13, paddingVertical: 16, textAlign: 'center' },
});
