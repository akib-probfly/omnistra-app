import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Hand,
  Save,
  UserRound,
  Workflow,
} from 'lucide-react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { ErrorState } from '../components/ErrorState';

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
}: {
  title: string;
  description: string;
  icon: typeof Workflow;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      style={[styles.modeCard, selected && styles.modeCardSelected, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onSelect}
    >
      <View style={[styles.modeIcon, selected && styles.modeIconSelected]}>
        <Icon color={selected ? '#fff' : '#64748b'} size={18} />
      </View>
      <View style={styles.modeCopy}>
        <View style={styles.modeTitleRow}>
          <Text style={styles.modeTitle}>{title}</Text>
          {selected ? <Check color="#2563eb" size={16} /> : null}
        </View>
        <Text style={styles.modeBody}>{description}</Text>
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
      Alert.alert('Assignment policy saved');
    },
    onError: (error: Error) => {
      Alert.alert('Could not save assignment policy', error.message);
    },
  });

  const disabled = !canUpdate || saveMutation.isPending;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <ArrowLeft color="#0f172a" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Assignment Policy</Text>
          <Text style={styles.headerSubtitle}>How new conversations are assigned in {workspaceName}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        {!canUpdate ? (
          <View style={styles.infoBanner}>
            <AlertCircle color="#c2410c" size={16} />
            <Text style={styles.infoBannerText}>You can view this policy, but only admins and managers can change it.</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flexCopy}>
              <View style={styles.titleLine}>
                <Text style={styles.cardTitle}>Auto-assign conversations</Text>
                <Text style={[styles.badge, enabled ? styles.badgeOn : styles.badgeOff]}>{enabled ? 'On' : 'Off'}</Text>
              </View>
              <Text style={styles.cardBody}>Route new threads automatically using your selected mode below.</Text>
            </View>
            <AppToggle value={enabled} onValueChange={setEnabled} disabled={disabled} accessibilityLabel="Auto-assign conversations" />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Assignment mode</Text>
          <Text style={styles.cardBody}>How the system selects an agent.</Text>
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
              />
            ))}
          </View>

          {mode === 'DEFAULT_OWNER' ? (
            <View style={styles.nestedCard}>
              <Text style={styles.cardTitle}>Default owner</Text>
              <Text style={styles.cardBody}>Choose the owner who receives all new conversations in this mode.</Text>
              <Pressable
                style={[styles.ownerButton, disabled && styles.disabled]}
                disabled={disabled}
                onPress={() => setOwnerPickerOpen(true)}
              >
                <Text style={styles.ownerButtonText} numberOfLines={1}>{selectedOwnerLabel}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.helperText}>
              {mode === 'ROUND_ROBIN'
                ? 'Share new conversations evenly across eligible agents.'
                : 'New conversations stay open for manual assignment.'}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Constraints</Text>
          <Text style={styles.cardBody}>Keep routing safe and balanced.</Text>

          <View style={[styles.constraintRow, styles.rowBorder]}>
            <View style={styles.flexCopy}>
              <Text style={styles.rowTitle}>Only assign to online agents</Text>
              <Text style={styles.cardBody}>Skip agents who are currently offline.</Text>
            </View>
            <AppToggle value={onlyOnlineAgents} onValueChange={setOnlyOnlineAgents} disabled={disabled} accessibilityLabel="Only assign to online agents" />
          </View>

          <View style={[styles.constraintRow, styles.rowBorder]}>
            <View style={styles.flexCopy}>
              <Text style={styles.rowTitle}>Max open conversations per agent</Text>
              <Text style={styles.cardBody}>Leave empty for no limit.</Text>
            </View>
            <TextInput
              value={maxConversationsPerAgent}
              onChangeText={setMaxConversationsPerAgent}
              editable={!disabled}
              keyboardType="number-pad"
              placeholder="Unlimited"
              placeholderTextColor="#94a3b8"
              style={styles.numberInput}
            />
          </View>

          <View style={styles.fallbackRow}>
            <View style={styles.fallbackIcon}>
              <AlertCircle color="#d97706" size={16} />
            </View>
            <View style={styles.flexCopy}>
              <Text style={styles.rowTitle}>Fallback behavior</Text>
              <Text style={styles.cardBody}>
                If no agent is eligible, the conversation stays unassigned rather than forcing a bad match.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Call routing</Text>
          <Text style={styles.cardBody}>Control how incoming WhatsApp calls are routed and who can receive them.</Text>
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
              />
            ))}
          </View>

          <View style={styles.nestedCard}>
            <View style={styles.rowBetween}>
              <View style={styles.flexCopy}>
                <Text style={styles.rowTitle}>Send calls only to assigned member</Text>
                <Text style={styles.cardBody}>
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

        <Pressable
          style={[styles.saveButton, disabled && styles.disabled]}
          disabled={disabled}
          onPress={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Save color="#fff" size={16} />
              <Text style={styles.saveText}>Save settings</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <Modal visible={ownerPickerOpen} transparent animationType="slide" onRequestClose={() => setOwnerPickerOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOwnerPickerOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <Text style={styles.sheetTitle}>Select default owner</Text>
            <TextInput
              value={ownerSearch}
              onChangeText={setOwnerSearch}
              placeholder="Search workspace members"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
            {ownersQuery.isLoading ? (
              <ActivityIndicator color="#2563eb" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={owners}
                keyExtractor={(item) => item.userId}
                style={{ marginTop: 10, maxHeight: 360 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const selected = item.userId === defaultOwnerUserId;
                  return (
                    <Pressable
                      style={[styles.ownerRow, selected && styles.ownerRowSelected]}
                      onPress={() => {
                        setDefaultOwnerUserId(item.userId);
                        setOwnerPickerOpen(false);
                        setOwnerSearch('');
                      }}
                    >
                      <View style={styles.flexCopy}>
                        <Text style={styles.ownerName}>{item.name?.trim() || item.email}</Text>
                        {item.name?.trim() ? <Text style={styles.ownerEmail}>{item.email}</Text> : null}
                      </View>
                      {selected ? <Check color="#2563eb" size={18} /> : null}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={<Text style={styles.emptyOwners}>No active members match your search.</Text>}
              />
            )}
          </View>
        </View>
      </Modal>
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
        <ActivityIndicator color="#2563eb" style={styles.loader} />
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
  screen: { backgroundColor: '#f8fafc', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingBottom: 12, paddingHorizontal: 14 },
  backButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#64748b', fontSize: 12, marginTop: 2 },
  loader: { marginTop: 80 },
  content: { gap: 12, padding: 16 },
  infoBanner: { alignItems: 'flex-start', backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 12 },
  infoBannerText: { color: '#c2410c', flex: 1, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, padding: 16 },
  cardTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  cardBody: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 4 },
  rowBetween: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  flexCopy: { flex: 1, minWidth: 0 },
  titleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { borderRadius: 999, fontSize: 10, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, textTransform: 'uppercase' },
  badgeOn: { backgroundColor: '#ecfdf5', color: '#047857' },
  badgeOff: { backgroundColor: '#f1f5f9', color: '#64748b' },
  modeList: { gap: 10, marginTop: 14 },
  modeCard: { alignItems: 'center', backgroundColor: '#fffaf0', borderColor: '#d6e6ff', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
  modeCardSelected: { backgroundColor: '#f3f7ff', borderColor: '#2563eb' },
  modeIcon: { alignItems: 'center', backgroundColor: '#edf4ff', borderRadius: 14, height: 40, justifyContent: 'center', width: 40 },
  modeIconSelected: { backgroundColor: '#2563eb' },
  modeCopy: { flex: 1, minWidth: 0 },
  modeTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  modeTitle: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  modeBody: { color: '#64748b', fontSize: 12, marginTop: 2 },
  nestedCard: { backgroundColor: '#f8fbff', borderColor: '#d6e6ff', borderRadius: 16, borderWidth: 1, marginTop: 14, padding: 12 },
  ownerButton: { backgroundColor: '#fff', borderColor: '#d6e6ff', borderRadius: 12, borderWidth: 1, marginTop: 10, paddingHorizontal: 12, paddingVertical: 12 },
  ownerButtonText: { color: '#0f172a', fontSize: 14, fontWeight: '600' },
  helperText: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 12 },
  constraintRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 14 },
  rowBorder: { borderBottomColor: '#eef2f7', borderBottomWidth: 1 },
  rowTitle: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  numberInput: { backgroundColor: '#fffaf0', borderColor: '#d6e6ff', borderRadius: 12, borderWidth: 1, color: '#0f172a', minWidth: 100, paddingHorizontal: 12, paddingVertical: 10, textAlign: 'center' },
  fallbackRow: { flexDirection: 'row', gap: 12, paddingTop: 14 },
  fallbackIcon: { alignItems: 'center', backgroundColor: '#fffbeb', borderRadius: 999, height: 32, justifyContent: 'center', width: 32 },
  saveButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 4, paddingVertical: 14 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  sheetOverlay: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  searchInput: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 12, borderWidth: 1, color: '#0f172a', paddingHorizontal: 12, paddingVertical: 12 },
  ownerRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 12 },
  ownerRowSelected: { backgroundColor: '#dbeafe' },
  ownerName: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  ownerEmail: { color: '#64748b', fontSize: 12, marginTop: 2 },
  emptyOwners: { color: '#94a3b8', fontSize: 13, paddingVertical: 16, textAlign: 'center' },
});
