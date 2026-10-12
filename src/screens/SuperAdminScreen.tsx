import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminQueryKeys, fetchAdminPlans, fetchAdminWorkspace, fetchAdminWorkspaces, runAdminWorkspaceAction, updateAdminPackage, type AdminWorkspace, type AdminWorkspaceAction } from '../api/admin';
import type { BillingPlan } from '../api/billing';
import { useSuperAdminAccess } from '../hooks/useSuperAdminAccess';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/tokens';
import { AppBadge, AppButton, AppCard, AppChip, AppIconButton, AppSearchField, AppText, ScreenHeader, toneForStatus } from '../ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { SuperAdminDashboard } from '../components/SuperAdminDashboard';
import { Building2, CalendarDays, Check, ChevronRight, Filter, LayoutDashboard, Package, Pencil, RefreshCw, UsersRound } from 'lucide-react-native';
import { BottomSheet, SheetScrollView } from '../components/BottomSheet';
import { AdminWorkspaceEditor } from '../components/AdminWorkspaceEditor';
import { AdminPackageEditor } from '../components/AdminPackageEditor';

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
  const [statusFilter, setStatusFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftPlan, setDraftPlan] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [selected, setSelected] = useState<AdminWorkspace | null>(null);
  const [action, setAction] = useState<AdminWorkspaceAction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<BillingPlan | null>(null);
  const togglePackage = useMutation({
    mutationFn: (plan: BillingPlan) => updateAdminPackage(plan.key, { isActive: plan.isActive === false }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: adminQueryKeys.all }), queryClient.invalidateQueries({ queryKey: ['billing-plans'] })]);
    },
  });
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const workspaces = useInfiniteQuery({
    queryKey: adminQueryKeys.workspaces(debouncedSearch, statusFilter, planFilter),
    queryFn: ({ pageParam }) => fetchAdminWorkspaces(pageParam, debouncedSearch, statusFilter, planFilter),
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
            <View style={styles.searchRow}>
              <AppSearchField value={search} onChangeText={setSearch} placeholder="Search workspaces or owners" size="sm" />
              <View>
                <AppIconButton icon={Filter} accessibilityLabel={`Filter workspaces${planFilter || statusFilter ? ', filters active' : ''}`} onPress={() => { setDraftPlan(planFilter); setDraftStatus(statusFilter); setFilterOpen(true); }} />
                {planFilter || statusFilter ? <View pointerEvents="none" style={[styles.filterActiveDot, { backgroundColor: colors.primary, borderColor: colors.surface }]} /> : null}
              </View>
            </View>
            <View style={styles.filterHeading}>
              <AppText variant="caption" tone="secondary">{workspaces.data?.pages[0]?.meta.total ?? '—'} workspaces</AppText>
            </View>
            {planFilter || statusFilter ? <View style={styles.row}>
              {statusFilter ? <AppChip label={`${statusFilter === 'ACTIVE' ? 'Active' : 'Expired'} ×`} selected onPress={() => setStatusFilter('')} /> : null}
              {planFilter ? <AppChip label={`${plans.data?.items.find((plan) => plan.key === planFilter)?.name ?? planFilter} ×`} selected onPress={() => setPlanFilter('')} /> : null}
            </View> : null}
          </> : null}
        </View> : null}
        {!selected && tab === 'overview' ? <SuperAdminDashboard onWorkspaces={() => setTab('workspaces')} onPackages={() => setTab('packages')} onWorkspace={setSelected} /> : pending ? <ActivityIndicator style={styles.content} color={colors.primary} /> : error ? <View style={styles.content}>
          <AppText tone="error">{error.message}</AppText>
          <AppButton label="Retry" onPress={() => { void (selected ? detail.refetch() : tab === 'workspaces' ? workspaces.refetch() : plans.refetch()); }} />
        </View> : selected && workspace ? (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
            <AppCard style={styles.card}>
              <View style={styles.workspaceHeader}>
                <View style={[styles.workspaceAvatar, { backgroundColor: colors.primarySoft }]}><Building2 color={colors.primary} size={22} /></View>
                <View style={styles.workspaceCopy}><AppText variant="heading">{workspace.name}</AppText><AppText variant="small" tone="secondary">Created {dateLabel(workspace.createdAt ?? selected.createdAt)}</AppText></View>
              </View>
              <View style={styles.row}><AppBadge label={selectedStatus ?? 'Unknown'} tone={isSuspended ? 'danger' : toneForStatus(selectedStatus)} /></View>
              <View style={[styles.detailSection, { borderTopColor: colors.cardBorder }]}>
                <AppText variant="small" tone="muted">WORKSPACE OWNER</AppText>
                <AppText variant="bodyStrong">{workspace.ownerName ?? selected.ownerName ?? 'No owner name'}</AppText>
                <AppText variant="caption" tone="secondary" selectable>{workspace.ownerEmail ?? selected.ownerEmail ?? 'No owner email'}</AppText>
                {workspace.timezone ? <AppText variant="small" tone="secondary">Timezone · {workspace.timezone}</AppText> : null}
              </View>
              <View style={[styles.detailSection, { borderTopColor: colors.cardBorder }]}>
                <View style={styles.filterHeading}><View style={styles.row}><Package color={colors.primary} size={16} /><AppText variant="bodyStrong">Subscription</AppText></View><AppButton label="Edit" variant="ghost" disabled={mutation.isPending} onPress={() => setEditOpen(true)} /></View>
                <View style={[styles.subscriptionPanel, { backgroundColor: colors.surfaceSecondary }]}>
                  <AppText variant="subheading">{plans.data?.items.find((plan) => plan.key === (workspace.currentSubscription?.planKey ?? workspace.billingPlanKey ?? selected.planName))?.name ?? workspace.currentSubscription?.planKey ?? workspace.billingPlanKey ?? selected.planName ?? 'No plan'}</AppText>
                  <View style={styles.filterHeading}><AppText variant="caption" tone="secondary">Status</AppText><AppText variant="caption">{workspace.currentSubscription?.status ?? workspace.billingStatus ?? 'Not set'}</AppText></View>
                  <View style={styles.filterHeading}><AppText variant="caption" tone="secondary">Billing cycle</AppText><AppText variant="caption">{workspace.currentSubscription?.billingCycle?.toUpperCase() === 'YEARLY' ? 'Yearly' : workspace.currentSubscription?.billingCycle ? 'Monthly' : 'Not set'}</AppText></View>
                  <View style={styles.filterHeading}><AppText variant="caption" tone="secondary">Expires</AppText><AppText variant="bodyStrong">{dateLabel(workspace.currentSubscription?.currentPeriodEnd ?? workspace.billingCurrentPeriodEnd ?? workspace.billingTrialEndsAt ?? selected.expiresAt)}</AppText></View>
                </View>
              </View>
              <View style={[styles.detailSection, { borderTopColor: colors.cardBorder }]}>
                <AppText variant="small" tone="muted">WORKSPACE TOTALS</AppText>
                <View style={styles.row}>
                  {[{ label: 'Members', value: workspace._count?.members ?? selected.memberCount }, { label: 'Channels', value: workspace._count?.channels }, { label: 'Conversations', value: workspace._count?.conversations }].map((item) => <View key={item.label} style={[styles.totalTile, { backgroundColor: colors.surfaceSecondary }]}><AppText variant="subheading">{item.value ?? '—'}</AppText><AppText variant="small" tone="secondary">{item.label}</AppText></View>)}
                </View>
              </View>
              {workspace.description ? <View style={[styles.detailSection, { borderTopColor: colors.cardBorder }]}><AppText variant="small" tone="muted">DESCRIPTION</AppText><AppText variant="caption" tone="secondary">{workspace.description}</AppText></View> : null}
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
          <View style={styles.filterHeading}>
            <View style={styles.workspaceCopy}><AppText variant="heading">Billing packages</AppText><AppText variant="caption" tone="secondary">{plans.data?.items.length ?? 0} packages across the platform</AppText></View>
            <AppIconButton icon={RefreshCw} accessibilityLabel="Refresh packages" loading={plans.isFetching} onPress={() => { void plans.refetch(); }} />
          </View>
          {!plans.data?.items.length ? <AppText tone="secondary">No packages found.</AppText> : null}
          {togglePackage.error ? <AppText tone="error">{togglePackage.error.message}</AppText> : null}
          {plans.data?.items.map((plan) => <AppCard key={plan.key} style={[styles.packageCard, plan.highlighted ? { borderColor: colors.primary } : undefined]}>
            <View style={styles.workspaceHeader}>
              <View style={[styles.workspaceAvatar, { backgroundColor: colors.primarySoft }]}><Package size={22} color={colors.primary} /></View>
              <View style={styles.workspaceCopy}><AppText variant="heading">{plan.name}</AppText><AppText variant="small" tone="muted">{plan.key}</AppText></View>
              <AppBadge label={plan.isActive === false ? 'Inactive' : 'Active'} tone={plan.isActive === false ? 'neutral' : 'success'} />
            </View>
            {plan.badge ? <View style={styles.row}><AppBadge label={plan.badge} tone="primary" /></View> : null}
            {plan.description ? <AppText variant="caption" tone="secondary">{plan.description}</AppText> : null}
            <View style={styles.packagePricing}>
              {(['monthly', 'yearly'] as const).map((interval) => {
                const available = !plan.intervals || Boolean(plan.intervals[interval]);
                return <View key={interval} style={[styles.packagePriceTile, { backgroundColor: colors.surfaceSecondary }]}>
                  <AppText variant="small" tone="secondary">{interval === 'monthly' ? 'MONTHLY' : 'YEARLY'}</AppText>
                  <AppText variant="heading">{available ? plan.intervals?.[interval]?.price ?? (interval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice) : '—'}</AppText>
                  <AppText variant="small" tone="muted">{available ? `${plan.currency} / ${interval === 'monthly' ? 'month' : 'year'}` : 'Not offered'}</AppText>
                </View>;
              })}
            </View>
            {plan.features.length ? <View style={[styles.detailSection, { borderTopColor: colors.cardBorder }]}>
              <AppText variant="small" tone="muted">INCLUDED FEATURES</AppText>
              {plan.features.map((feature) => <View key={feature.key} style={styles.packageFeature}>
                <View style={[styles.featureIcon, { backgroundColor: colors.primarySoft }]}><Check size={12} color={colors.primary} /></View>
                <View style={styles.workspaceCopy}><AppText variant="caption">{feature.label}</AppText>{feature.info ? <AppText variant="small" tone="secondary">{feature.info}</AppText> : null}</View>
              </View>)}
            </View> : null}
            <View style={[styles.packageActions, { borderTopColor: colors.cardBorder }]}>
              <View style={styles.row}><Switch accessibilityLabel={`Activate ${plan.name}`} value={plan.isActive !== false} disabled={togglePackage.isPending} onValueChange={() => { togglePackage.reset(); togglePackage.mutate(plan); }} trackColor={{ true: colors.primary }} /><AppText variant="caption">{plan.isActive === false ? 'Inactive' : 'Active'}</AppText></View>
              <AppButton label="Edit" icon={Pencil} variant="secondary" disabled={togglePackage.isPending} onPress={() => setEditingPackage(plan)} />
            </View>
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
      <BottomSheet visible={filterOpen} onClose={() => setFilterOpen(false)} sheetStyle={{ backgroundColor: colors.surface, maxHeight: '80%' }}>
        <View style={styles.sheetHeader}><AppText variant="heading">Filters</AppText><AppButton label="Close" variant="ghost" onPress={() => setFilterOpen(false)} /></View>
        <SheetScrollView contentContainerStyle={styles.content}>
          <AppText variant="bodyStrong">Billing status</AppText>
          <View style={styles.row}>
            {[{ label: 'All', value: '' }, { label: 'Active', value: 'ACTIVE' }, { label: 'Expired', value: 'EXPIRED' }].map((item) => <AppChip key={item.value} label={item.label} selected={draftStatus === item.value} onPress={() => setDraftStatus(item.value)} />)}
          </View>
          <AppText variant="bodyStrong">Package</AppText>
          <View style={styles.row}>
            <AppChip label="All packages" selected={!draftPlan} onPress={() => setDraftPlan('')} />
            {plans.data?.items.map((plan) => <AppChip key={plan.key} label={plan.name} selected={draftPlan === plan.key} onPress={() => setDraftPlan(plan.key)} />)}
          </View>
          {plans.isPending ? <ActivityIndicator color={colors.primary} /> : null}
          {plans.error ? <><AppText tone="error">Unable to load packages.</AppText><AppButton label="Retry" variant="secondary" onPress={() => { void plans.refetch(); }} /></> : null}
        </SheetScrollView>
        <View style={[styles.sheetActions, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <AppButton label="Reset" variant="secondary" onPress={() => { setDraftPlan(''); setDraftStatus(''); setPlanFilter(''); setStatusFilter(''); setFilterOpen(false); }} />
          <AppButton label="Apply filters" onPress={() => { setPlanFilter(draftPlan); setStatusFilter(draftStatus); setFilterOpen(false); }} />
        </View>
      </BottomSheet>
      {editOpen && selected && workspace && access.isSuperAdmin ? <AdminWorkspaceEditor key={workspace.id} workspace={workspace} onClose={() => setEditOpen(false)} /> : null}
      {editingPackage && access.isSuperAdmin ? <AdminPackageEditor key={editingPackage.key} plan={editingPackage} onClose={() => setEditingPackage(null)} /> : null}
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterActiveDot: { position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: radius.pill, borderWidth: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  sheetActions: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg, gap: spacing.md },
  workspaceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  workspaceAvatar: { height: 44, width: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  workspaceCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  workspacePlan: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  workspaceFooter: { borderTopWidth: 1, paddingTop: spacing.md, marginTop: spacing.xs, flexDirection: 'row', gap: spacing.md },
  detailSection: { borderTopWidth: 1, paddingTop: spacing.lg, marginTop: spacing.sm, gap: spacing.sm },
  subscriptionPanel: { borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  totalTile: { flex: 1, minWidth: 80, alignItems: 'center', borderRadius: radius.md, paddingVertical: spacing.md, gap: spacing.xs },
  packageCard: { padding: spacing.lg, gap: spacing.lg },
  packagePricing: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  packagePriceTile: { flex: 1, minWidth: 120, padding: spacing.md, borderRadius: radius.md, gap: spacing.sm },
  packageFeature: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs },
  featureIcon: { width: 20, height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  packageActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: spacing.md },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, paddingTop: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.sm },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: spacing.md },
});
