import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminQueryKeys, fetchAdminPlans, fetchAdminWorkspace, fetchAdminWorkspaces, runAdminWorkspaceAction, type AdminWorkspace, type AdminWorkspaceAction } from '../api/admin';
import { useSuperAdminAccess } from '../hooks/useSuperAdminAccess';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/tokens';
import { AppBadge, AppButton, AppCard, AppChip, AppSearchField, AppText, ScreenHeader, toneForStatus } from '../ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { SuperAdminDashboard } from '../components/SuperAdminDashboard';
import { Building2, CalendarDays, ChevronRight, LayoutDashboard, Package, UsersRound } from 'lucide-react-native';

const actionLabels: Record<AdminWorkspaceAction, string> = { suspend: 'Suspend workspace', reactivate: 'Reactivate workspace', 'reset-usage': 'Reset usage' };
const adminTabs = [
  { key: 'overview', label: 'Dashboard', Icon: LayoutDashboard },
  { key: 'workspaces', label: 'Workspaces', Icon: Building2 },
  { key: 'packages', label: 'Packages', Icon: Package },
] as const;
function dateLabel(value?: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).toLowerCase();
}

export function SuperAdminScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { logout } = useAuth();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const access = useSuperAdminAccess();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'workspaces' | 'packages'>('overview');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [selected, setSelected] = useState<AdminWorkspace | null>(null);
  const [action, setAction] = useState<AdminWorkspaceAction | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const workspaces = useInfiniteQuery({
    queryKey: adminQueryKeys.workspaces(debouncedSearch, '', planFilter),
    queryFn: ({ pageParam }) => fetchAdminWorkspaces(pageParam, debouncedSearch, '', planFilter),
    initialPageParam: 1,
    getNextPageParam: (last) => last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    enabled: access.isSuperAdmin && tab === 'workspaces',
  });
  const detail = useQuery({
    queryKey: adminQueryKeys.workspace(selected?.id ?? null),
    queryFn: () => fetchAdminWorkspace(selected!.id),
    enabled: access.isSuperAdmin && Boolean(selected),
  });
  const plans = useQuery({ queryKey: adminQueryKeys.plans, queryFn: fetchAdminPlans, enabled: access.isSuperAdmin && (tab === 'packages' || tab === 'workspaces') });
  const mutation = useMutation({
    mutationFn: (input: { id: string; action: AdminWorkspaceAction }) => runAdminWorkspaceAction(input.id, input.action),
    onSuccess: async () => {
      setAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['billing-usage'] }),
      ]);
    },
  });
  const back = () => {
    if (selected) { setSelected(null); setAction(null); mutation.reset(); }
    else if (navigation.canGoBack()) navigation.goBack();
  };
  const items = workspaces.data?.pages.flatMap((page) => page.items) ?? [];
  const workspace = detail.data;
  const selectedStatus = workspace
    ? workspace.suspendedAt ? 'SUSPENDED' : workspace.currentSubscription?.status ?? workspace.billingStatus ?? 'ACTIVE'
    : selected?.status;
  const isSuspended = selectedStatus?.toUpperCase() === 'SUSPENDED';
  const error = selected ? detail.error : tab === 'workspaces' ? workspaces.error : plans.error;
  const pending = selected ? detail.isPending : tab === 'workspaces' ? workspaces.isPending : plans.isPending;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={selected?.name ?? adminTabs.find((item) => item.key === tab)!.label} subtitle={selected ? 'Workspace management' : 'Super admin'} onBack={selected || navigation.canGoBack() ? back : undefined}
        right={<AppButton label="Sign out" variant="ghost" onPress={() => setSignOutOpen(true)} />} />
      {!access.isSuperAdmin ? (
        <View style={styles.content}>
          {access.isPending ? <ActivityIndicator color={colors.primary} /> : <>
            <AppText tone="error">{access.error ? 'Unable to verify admin access.' : 'Super admin access required.'}</AppText>
            {access.error ? <AppButton label="Retry" onPress={() => { void access.refetch(); }} /> : null}
          </>}
        </View>
      ) : <>
        <View style={styles.screen}>
        {!selected ? <View style={styles.toolbar}>
          {tab === 'workspaces' ? <>
            <AppSearchField value={search} onChangeText={setSearch} placeholder="Search workspaces or owners" fill={false} />
            <View style={styles.filterHeading}><AppText variant="small" tone="secondary">Filter by package</AppText>
              {planFilter || search ? <AppButton label="Clear" variant="ghost" onPress={() => { setPlanFilter(''); setSearch(''); setDebouncedSearch(''); }} /> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              <AppChip label="All packages" selected={!planFilter} onPress={() => setPlanFilter('')} />
              {plans.data?.items.map((plan) => <AppChip key={plan.key} label={plan.name} selected={planFilter === plan.key} onPress={() => setPlanFilter(plan.key)} />)}
            </ScrollView>
            {plans.error ? <View style={styles.row}><AppText variant="small" tone="error">Unable to load package filters.</AppText><AppButton label="Retry" variant="ghost" onPress={() => { void plans.refetch(); }} /></View> : null}
            <AppText variant="caption" tone="secondary">{workspaces.data?.pages[0]?.meta.total ?? '—'} workspaces{planFilter ? ` · ${plans.data?.items.find((plan) => plan.key === planFilter)?.name ?? planFilter}` : ''}</AppText>
          </> : null}
        </View> : null}
        {!selected && tab === 'overview' ? <SuperAdminDashboard onWorkspaces={() => setTab('workspaces')} onPackages={() => setTab('packages')} onWorkspace={setSelected} /> : pending ? <ActivityIndicator style={styles.content} color={colors.primary} /> : error ? <View style={styles.content}>
          <AppText tone="error">{error.message}</AppText>
          <AppButton label="Retry" onPress={() => { void (selected ? detail.refetch() : tab === 'workspaces' ? workspaces.refetch() : plans.refetch()); }} />
        </View> : selected && workspace ? (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
            <AppCard style={styles.card}>
              <AppText variant="heading">{workspace.name}</AppText>
              <AppBadge label={selectedStatus ?? 'Unknown'} tone={isSuspended ? 'danger' : 'neutral'} />
              <AppText tone="secondary">{workspace.ownerName ?? selected.ownerName ?? 'No owner name'}</AppText>
              <AppText selectable>{workspace.ownerEmail ?? selected.ownerEmail ?? 'No owner email'}</AppText>
              <AppText>Plan: {workspace.currentSubscription?.planKey ?? workspace.billingPlanKey ?? selected.planName ?? 'None'}</AppText>
              <AppText>Subscription: {workspace.currentSubscription?.status ?? workspace.billingStatus ?? 'Not set'}</AppText>
              <AppText>Expires: {dateLabel(workspace.currentSubscription?.currentPeriodEnd ?? workspace.billingCurrentPeriodEnd ?? selected.expiresAt)}</AppText>
              <AppText>Members: {workspace._count?.members ?? selected.memberCount ?? '—'}</AppText>
              <AppText>Channels: {workspace._count?.channels ?? '—'} · Conversations: {workspace._count?.conversations ?? '—'}</AppText>
              <AppText>Created: {dateLabel(workspace.createdAt ?? selected.createdAt)}</AppText>
              {workspace.timezone ? <AppText>Timezone: {workspace.timezone}</AppText> : null}
              {workspace.description ? <AppText tone="secondary">{workspace.description}</AppText> : null}
            </AppCard>
            <AppButton block label={isSuspended ? 'Reactivate workspace' : 'Suspend workspace'} variant={isSuspended ? 'primary' : 'destructive'} disabled={mutation.isPending} onPress={() => { mutation.reset(); setAction(isSuspended ? 'reactivate' : 'suspend'); }} />
            <AppButton block label="Reset usage" variant="secondary" disabled={mutation.isPending} onPress={() => { mutation.reset(); setAction('reset-usage'); }} />
            {mutation.error ? <AppText tone="error">{mutation.error.message}</AppText> : null}
          </ScrollView>
        ) : tab === 'workspaces' ? (
          <FlatList data={items} keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
            refreshing={workspaces.isRefetching && !workspaces.isFetchingNextPage}
            onRefresh={() => { void workspaces.refetch(); }}
            onEndReached={() => { if (workspaces.hasNextPage && !workspaces.isFetching) void workspaces.fetchNextPage(); }}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={<AppText tone="secondary">No workspaces found.</AppText>}
            ListFooterComponent={workspaces.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
            renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${item.name}`} onPress={() => setSelected(item)}>
              <AppCard style={styles.card}>
                <View style={styles.workspaceHeader}>
                  <View style={[styles.workspaceAvatar, { backgroundColor: colors.primarySoft }]}><AppText variant="subheading" tone="primary">{item.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</AppText></View>
                  <View style={styles.workspaceCopy}><AppText variant="subheading" numberOfLines={1}>{item.name}</AppText><AppText variant="small" tone="secondary" numberOfLines={1}>{item.ownerName ?? 'No admin assigned'}</AppText></View>
                  <ChevronRight size={18} color={colors.textMuted} />
                </View>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>{item.ownerEmail ?? 'No owner email'}</AppText>
                <View style={styles.workspaceHeader}>
                  <View style={styles.workspacePlan}><Package size={14} color={colors.primary} /><AppText variant="caption" tone="primary" numberOfLines={1}>{plans.data?.items.find((plan) => plan.key === item.planName)?.name ?? item.planName ?? 'No plan'}</AppText></View>
                  <AppBadge label={item.status.replace(/_/g, ' ')} tone={item.status === 'SUSPENDED' ? 'danger' : toneForStatus(item.status)} />
                </View>
                <View style={[styles.workspaceFooter, { borderTopColor: colors.cardBorder }]}>
                  <View style={styles.workspaceCopy}><View style={styles.row}><UsersRound size={14} color={colors.textMuted} /><AppText variant="small" tone="secondary">Members</AppText></View><AppText variant="bodyStrong">{item.memberCount ?? '—'}</AppText></View>
                  <View style={styles.workspaceCopy}><View style={styles.row}><CalendarDays size={14} color={colors.textMuted} /><AppText variant="small" tone="secondary">Expires</AppText></View><AppText variant="caption">{dateLabel(item.expiresAt)}</AppText></View>
                </View>
              </AppCard>
            </Pressable>} />
        ) : <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
          <AppButton label="Refresh packages" variant="secondary" loading={plans.isFetching} onPress={() => { void plans.refetch(); }} />
          {!plans.data?.items.length ? <AppText tone="secondary">No packages found.</AppText> : null}
          {plans.data?.items.map((plan) => <AppCard key={plan.key} style={styles.card}>
            <AppText variant="subheading">{plan.name}</AppText>
            <AppBadge label={plan.isActive === false ? 'Inactive' : 'Active'} tone="neutral" />
            <AppText tone="secondary">{plan.description}</AppText>
            <AppText>{plan.monthlyPrice} / month · {plan.yearlyPrice} / year</AppText>
            {plan.features.map((feature) => <AppText key={feature.key} variant="caption" tone="secondary">{feature.label}</AppText>)}
          </AppCard>)}
        </ScrollView>}
        </View>
        <View accessibilityRole="tablist" style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.cardBorder, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {adminTabs.map(({ key, label, Icon }) => {
            const active = tab === key;
            return <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label}
              onPress={() => { if (!mutation.isPending) { setSelected(null); setAction(null); mutation.reset(); setTab(key); } }}
              style={[styles.navItem, { backgroundColor: active ? colors.primarySoft : 'transparent' }]}>
              <Icon size={21} color={active ? colors.primary : colors.textMuted} />
              <AppText variant="small" tone={active ? 'primary' : 'muted'}>{label}</AppText>
            </Pressable>;
          })}
        </View>
      </>}
      <ConfirmDialog visible={Boolean(action && selected)} title={action ? actionLabels[action] : ''}
        body={`${action === 'reset-usage' ? 'Reset conversation usage for the current billing period for' : action === 'suspend' ? 'Suspend access to' : 'Restore access to'} ${selected?.name ?? 'this workspace'}?${mutation.error ? `\n\n${mutation.error.message}` : ''}`}
        confirmLabel={action ? actionLabels[action] : 'Confirm'} destructive={action !== 'reactivate'} loading={mutation.isPending}
        onClose={() => { if (!mutation.isPending) { setAction(null); mutation.reset(); } }}
        onConfirm={() => { if (selected && action && access.isSuperAdmin) mutation.mutate({ id: selected.id, action }); }} />
      <ConfirmDialog visible={signOutOpen} title="Sign out" body="Sign out of your account?" confirmLabel="Sign out" onClose={() => setSignOutOpen(false)} onConfirm={() => { setSignOutOpen(false); void logout(); }} />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  toolbar: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  card: { padding: spacing.lg, gap: spacing.sm },
  filterHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  workspaceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  workspaceAvatar: { height: 44, width: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  workspaceCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  workspacePlan: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  workspaceFooter: { borderTopWidth: 1, paddingTop: spacing.md, marginTop: spacing.xs, flexDirection: 'row', gap: spacing.md },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, paddingTop: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.sm },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: spacing.md },
});
