import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers3, PackageOpen, Search, ShoppingBag, Store, Truck } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { listCourierConnections } from '../api/couriers';
import { updateWorkspaceSettings } from '../api/workspaces';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useWorkspaceAccess } from '../lib/workspace-access';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppButton, AppCard, AppText, ScreenHeader } from '../ui';

const CATALOG_TOTAL = 4;

export function IntegrationsScreen() {
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { workspace, canManage } = useWorkspaceAccess();
  const connectionsQuery = useQuery({ queryKey: ['courier-connections'], queryFn: listCourierConnections });
  const connected = (connectionsQuery.data?.items ?? []).filter((item) => item.status === 'CONNECTED');
  const ecommerceMutation = useMutation({
    mutationFn: (enabled: boolean) => {
      if (!workspace?.id) throw new Error('Workspace is not ready. Please try again.');
      return updateWorkspaceSettings(workspace.id, { ecommerceEnabled: enabled });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces', 'mine'] });
    },
    onError: (cause: Error) => Alert.alert('Could not update Ecommerce Setup', cause.message),
  });
  const browseCatalog = () => navigation.navigate('IntegrationCatalog');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Integrations"
        onBack={() => navigation.goBack()}
        right={<AppButton icon={Search} label="Browse Catalog" onPress={browseCatalog} />}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statsGrid}>
          <StatCard label="Connected" value={String(connected.length)} icon={Layers3} color={colors.primary} soft={colors.primarySoft} />
          <StatCard label="Available" value={String(CATALOG_TOTAL)} icon={PackageOpen} color={colors.success} soft={colors.successSoft} />
          <StatCard label="Stores" value="2" icon={Store} color={colors.indigo} soft={colors.indigoSoft} />
          <StatCard label="Delivery partners" value="2" icon={Truck} color={colors.warning} soft={colors.warningSoft} />
        </View>

        <AppCard style={styles.ecommerceCard}>
          <View style={[styles.ecommerceIcon, { backgroundColor: colors.warningSoft }]}><ShoppingBag color={colors.warning} size={20} /></View>
          <View style={styles.ecommerceCopy}>
            <AppText variant="bodyStrong">Ecommerce Setup</AppText>
          </View>
          <AppButton
            label={ecommerceMutation.isPending ? 'Saving...' : workspace?.ecommerceEnabled ? 'Disable' : 'Enable'}
            variant={workspace?.ecommerceEnabled ? 'secondary' : 'primary'}
            loading={ecommerceMutation.isPending}
            disabled={!workspace?.id || !canManage}
            onPress={() => ecommerceMutation.mutate(!workspace?.ecommerceEnabled)}
          />
        </AppCard>

        <View style={styles.sectionHeader}>
          <AppText variant="section">Connected integrations</AppText>
          <Pressable onPress={browseCatalog} accessibilityRole="button"><AppText variant="small" tone="primary">Browse catalog</AppText></Pressable>
        </View>
        {connected.length ? (
          <View style={styles.connectedList}>
            {connected.map((connection) => (
              <AppCard key={connection.id} style={styles.connectedCard}>
                <View style={[styles.connectedIcon, { backgroundColor: colors.primarySoft }]}><Truck color={colors.primary} size={18} /></View>
                <View style={styles.ecommerceCopy}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{connection.displayName}</AppText>
                  <AppText variant="small" tone="secondary">{connection.provider}</AppText>
                </View>
                <AppText variant="small" tone="primary">Connected</AppText>
              </AppCard>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyState, { borderColor: colors.cardBorder, backgroundColor: colors.surfaceSecondary }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}><PackageOpen color={colors.textSecondary} size={21} /></View>
            <AppText variant="bodyStrong">No integrations connected yet</AppText>
            <AppText variant="small" tone="secondary" style={styles.emptyDescription}>Connect a store or delivery partner from the catalog to start receiving orders and tracking shipments.</AppText>
            <AppButton icon={Search} label="Browse Catalog" onPress={browseCatalog} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, icon: Icon, color, soft }: { label: string; value: string; icon: LucideIcon; color: string; soft: string }) {
  return (
    <AppCard padding="md" style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: soft }]}><Icon color={color} size={16} /></View>
      <View style={styles.statCopy}>
        <AppText variant="tiny" tone="secondary">{label.toUpperCase()}</AppText>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxxl },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  statCard: { alignItems: 'center', flexBasis: '48%', flexDirection: 'row', gap: spacing.sm },
  statIcon: { alignItems: 'center', borderRadius: radius.md, height: 34, justifyContent: 'center', width: 34 },
  statCopy: { flex: 1, minWidth: 0 },
  statValue: { fontSize: fontSize.heading, fontWeight: fontWeight.extrabold, marginTop: 2 },
  ecommerceCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  ecommerceIcon: { alignItems: 'center', borderRadius: radius.md, height: 44, justifyContent: 'center', width: 44 },
  ecommerceCopy: { flex: 1, minWidth: 0 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  connectedList: { gap: spacing.sm },
  connectedCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  connectedIcon: { alignItems: 'center', borderRadius: radius.md, height: 38, justifyContent: 'center', width: 38 },
  emptyState: { alignItems: 'center', borderRadius: radius.xl, borderStyle: 'dashed', borderWidth: 1, gap: spacing.sm, justifyContent: 'center', minHeight: 210, padding: spacing.xl },
  emptyIcon: { alignItems: 'center', borderRadius: radius.pill, height: 44, justifyContent: 'center', width: 44 },
  emptyDescription: { lineHeight: 18, maxWidth: 300, textAlign: 'center' },
});
