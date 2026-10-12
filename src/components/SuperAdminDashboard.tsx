import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Building2, Package, ShieldCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminQueryKeys, fetchAdminPlans, fetchAdminWorkspaces, type AdminWorkspace } from '../api/admin';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/tokens';
import { AppBadge, AppButton, AppCard, AppText } from '../ui';
import { useAuth } from '../auth/AuthContext';

type Props = {
  onWorkspaces: () => void;
  onPackages: () => void;
  onWorkspace: (workspace: AdminWorkspace) => void;
};

export function SuperAdminDashboard({ onWorkspaces, onPackages, onWorkspace }: Props) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const overview = useQuery({
    queryKey: [...adminQueryKeys.all, 'overview'],
    queryFn: () => fetchAdminWorkspaces(1, '', ''),
    staleTime: 30_000,
  });
  const plans = useQuery({ queryKey: adminQueryKeys.plans, queryFn: fetchAdminPlans, staleTime: 30_000 });
  const refresh = async () => {
    setRefreshing(true);
    try { await Promise.all([overview.refetch(), plans.refetch()]); }
    finally { setRefreshing(false); }
  };
  const metrics = [
    { title: 'Workspaces', value: overview.data?.meta.total, subtitle: 'Across the platform', Icon: Building2, onPress: onWorkspaces },
    { title: 'Packages', value: plans.data?.items.length, subtitle: 'Billing packages', Icon: Package, onPress: onPackages },
    { title: 'Active packages', value: plans.data?.items.filter((plan) => plan.isActive !== false).length, subtitle: 'Available for subscription', Icon: ShieldCheck, onPress: onPackages },
  ];
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={colors.primary} />}>
      <View style={styles.copy}>
        <AppText variant="heading">Welcome back{session?.user.name ? `, ${session.user.name.split(' ')[0]}` : ''}</AppText>
        <AppText variant="caption" tone="secondary">Here’s what’s happening with your platform.</AppText>
      </View>
      <View style={styles.metrics}>
        {metrics.map(({ title, value, subtitle, Icon, onPress }) => (
          <Pressable key={title} style={styles.metric} accessibilityRole="button" accessibilityLabel={`View ${title.toLowerCase()}`} onPress={onPress}>
            <AppCard style={styles.metricCard}>
              <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Icon color={colors.primary} size={18} /></View>
              <AppText variant="caption" tone="secondary">{title}</AppText>
              <AppText variant="display">{value === undefined ? '—' : value.toLocaleString()}</AppText>
              <AppText variant="small" tone="muted">{subtitle}</AppText>
            </AppCard>
          </Pressable>
        ))}
      </View>
      {overview.error || plans.error ? <AppCard style={styles.card}>
        <AppText tone="error">{overview.error?.message ?? plans.error?.message}</AppText>
        <AppButton label="Retry" variant="secondary" onPress={() => { void refresh(); }} />
      </AppCard> : null}
      <AppCard style={styles.card}>
        <AppText variant="subheading">Quick actions</AppText>
        <View style={styles.actions}>
          <AppButton label="Manage workspaces" icon={Building2} onPress={onWorkspaces} block />
          <AppButton label="View packages" icon={Package} variant="secondary" onPress={onPackages} block />
        </View>
      </AppCard>
      <AppCard style={styles.card}>
        <View style={styles.sectionHeader}><View style={styles.copy}><AppText variant="subheading">Recent workspaces</AppText><AppText variant="small" tone="secondary">Most recently created</AppText></View><AppButton label="View all" variant="ghost" onPress={onWorkspaces} /></View>
        <View style={styles.actions}>
          {overview.isPending ? <ActivityIndicator color={colors.primary} /> : null}
          {overview.data?.items.length === 0 ? <AppText tone="secondary">No workspaces yet.</AppText> : null}
          {overview.data?.items.slice(0, 5).map((workspace) => (
            <Pressable key={workspace.id} style={[styles.workspaceRow, { borderTopColor: colors.cardBorder }]} accessibilityRole="button" onPress={() => onWorkspace(workspace)}>
              <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}><AppText variant="bodyStrong" tone="primary">{workspace.name.slice(0, 2).toUpperCase()}</AppText></View>
              <View style={styles.workspaceCopy}>
                <AppText variant="subheading">{workspace.name}</AppText>
                <AppText variant="caption" tone="secondary">{workspace.ownerEmail ?? workspace.ownerName ?? 'No owner'}</AppText>
                <View style={styles.row}>
                  <AppBadge label={workspace.status} tone={workspace.status === 'SUSPENDED' ? 'danger' : 'neutral'} />
                  <AppText variant="caption" tone="secondary">{workspace.planName ?? 'No plan'}</AppText>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </AppCard>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
  copy: { gap: spacing.sm },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metric: { flexBasis: '46%', flexGrow: 1 },
  metricCard: { padding: spacing.lg, gap: spacing.sm, flex: 1 },
  icon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  workspaceRow: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  workspaceCopy: { flex: 1, gap: spacing.sm },
  actions: { gap: spacing.md },
  card: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
