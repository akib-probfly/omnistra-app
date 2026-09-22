import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  Bell,
  Building2,
  ChevronRight,
  CreditCard,
  FileText,
  LogOut,
  Mail,
  Megaphone,
  Moon,
  Package,
  Palette,
  Plus,
  Receipt,
  Sun,
  Tag,
  UserRound,
  UsersRound,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { apiUrl } from '../api/client';
import { fetchMyProfile } from '../api/profile';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NotificationBell, NotificationCenter } from '../components/NotificationCenter';
import { canViewBroadcast } from '../lib/broadcast-access';
import { useBillingLockReason } from '../lib/billing-lock';
import { useWorkspaceAccess } from '../lib/workspace-access';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';
import { fontWeight, iconTiles, radius, spacing } from '../theme/tokens';
import { AppBadge, AppCard, AppSearchField, AppText } from '../ui';

type BillingTab = 'current' | 'packages' | 'invoices' | 'history';

type GeneralRoute = 'Profile' | 'Workspace' | 'Members' | 'Notifications' | 'InboxAppearance' | 'QuickReplies' | 'Tags' | 'AssignmentPolicy' | 'Broadcast' | 'BroadcastCreate' | '__appearance__';

type SettingsRow =
  | { kind: 'route'; id: string; label: string; description: string; icon: LucideIcon; iconBg: string; iconColor: string; route: GeneralRoute; badge?: string }
  | { kind: 'billing'; id: string; label: string; description: string; icon: LucideIcon; iconBg: string; iconColor: string; tab: BillingTab };

type SettingsGroup = {
  label: string;
  items: SettingsRow[];
};

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: 'General Settings',
    items: [
      { kind: 'route', id: 'profile', label: 'Profile', description: 'Name, email, password, and avatar', icon: UserRound, iconBg: iconTiles.blue.bg, iconColor: iconTiles.blue.fg, route: 'Profile' },
      { kind: 'route', id: 'workspace', label: 'Workspace', description: 'Workspace name and timezone', icon: Building2, iconBg: iconTiles.green.bg, iconColor: iconTiles.green.fg, route: 'Workspace' },
      { kind: 'route', id: 'notifications', label: 'Notifications', description: 'Alerts, sound, and push preferences', icon: Bell, iconBg: iconTiles.orange.bg, iconColor: iconTiles.orange.fg, route: 'Notifications' },
      { kind: 'route', id: 'appearance', label: 'Appearance', description: 'Light, dark, or system theme', icon: Moon, iconBg: iconTiles.dark.bg, iconColor: iconTiles.dark.fg, route: '__appearance__' },
      { kind: 'route', id: 'inbox-appearance', label: 'Inbox Appearance', description: 'Thread patterns, backgrounds, and avatars', icon: Palette, iconBg: iconTiles.blue.bg, iconColor: iconTiles.blue.fg, route: 'InboxAppearance' },
      { kind: 'route', id: 'assignment', label: 'Assignment Policy', description: 'Auto-assign and call routing rules', icon: Workflow, iconBg: iconTiles.indigo.bg, iconColor: iconTiles.indigo.fg, route: 'AssignmentPolicy' },
      { kind: 'route', id: 'quick-replies', label: 'Quick Replies', description: 'Create and manage reply snippets', icon: Zap, iconBg: iconTiles.yellow.bg, iconColor: iconTiles.yellow.fg, route: 'QuickReplies' },
      { kind: 'route', id: 'tags', label: 'Tags', description: 'Organize conversations and contacts', icon: Tag, iconBg: iconTiles.pink.bg, iconColor: iconTiles.pink.fg, route: 'Tags' },
    ],
  },
  {
    label: 'Team Management',
    items: [
      { kind: 'route', id: 'members', label: 'Members', description: 'Team access and workspace coverage', icon: UsersRound, iconBg: iconTiles.blue.bg, iconColor: iconTiles.blue.fg, route: 'Members' },
    ],
  },
  {
    label: 'Broadcast',
    items: [
      { kind: 'route', id: 'broadcast-campaigns', label: 'Campaigns', description: 'Run, schedule, and analyze campaigns', icon: Megaphone, iconBg: iconTiles.orange.bg, iconColor: iconTiles.orange.fg, route: 'Broadcast' },
      { kind: 'route', id: 'broadcast-create', label: 'Create Campaign', description: 'Start a new WhatsApp broadcast', icon: Plus, iconBg: iconTiles.blue.bg, iconColor: iconTiles.blue.fg, route: 'BroadcastCreate' },
    ],
  },
  {
    label: 'Billing',
    items: [
      { kind: 'billing', id: 'billing-current', label: 'Current Plan', description: 'Active plan and usage', icon: CreditCard, iconBg: iconTiles.blue.bg, iconColor: iconTiles.blue.fg, tab: 'current' },
      { kind: 'billing', id: 'billing-packages', label: 'Packages & Add-ons', description: 'Browse plans and pricing', icon: Package, iconBg: iconTiles.green.bg, iconColor: iconTiles.green.fg, tab: 'packages' },
      { kind: 'billing', id: 'billing-invoices', label: 'Invoices', description: 'Paid and pending invoices', icon: Receipt, iconBg: iconTiles.orange.bg, iconColor: iconTiles.orange.fg, tab: 'invoices' },
      { kind: 'billing', id: 'billing-subscriptions', label: 'Subscription History', description: 'Past subscriptions', icon: FileText, iconBg: iconTiles.slate.bg, iconColor: iconTiles.slate.fg, tab: 'history' },
    ],
  },
];

function getInitials(value?: string | null) {
  const parts = (value ?? '?').split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2);
  return (parts.join('') || '?').toUpperCase();
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const { session, logout } = useAuth();
  const { mode, setMode, isDark } = useTheme();
  const { workspace, canManage } = useWorkspaceAccess();
  const lockReason = useBillingLockReason();
  const subscriptionExpired = Boolean(lockReason);
  const showBroadcast = canViewBroadcast(workspace);
  const visibleGroups = useMemo(
    () => SETTINGS_GROUPS
      .map((group) => {
        if (group.label === 'Broadcast' && !showBroadcast) return { ...group, items: [] };
        if (group.label === 'Billing' && !canManage && !subscriptionExpired) return { ...group, items: [] };
        if (group.label === 'Billing' && subscriptionExpired) {
          return {
            ...group,
            items: group.items.map((item) =>
              item.kind === 'billing' && item.tab === 'packages'
                ? { ...item, label: 'Renew plan', description: 'Choose a plan to restore workspace access' }
                : item,
            ),
          };
        }
        if (group.label === 'General Settings' && !canManage) {
          return { ...group, items: group.items.filter((item) => item.id !== 'assignment') };
        }
        return group;
      })
      .filter((group) => group.items.length > 0),
    [showBroadcast, canManage, subscriptionExpired],
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [search, setSearch] = useState('');
  const profileQuery = useQuery({
    queryKey: ['user-profile', 'me'],
    queryFn: fetchMyProfile,
    enabled: Boolean(session?.user.email),
  });

  const name = profileQuery.data?.name?.trim() || session?.user.name?.trim() || session?.user.email?.trim() || 'User';
  const email = profileQuery.data?.email?.trim() || session?.user.email?.trim() || '';
  const storedAvatarUrl = profileQuery.data?.avatarUrl ?? session?.user.avatarUrl ?? null;
  const displayAvatarUrl = storedAvatarUrl ? apiUrl(storedAvatarUrl) : null;

  const cycleTheme = () => {
    if (mode === 'system') setMode('light');
    else if (mode === 'light') setMode('dark');
    else setMode('system');
  };

  const normalizedSearch = search.trim().toLowerCase();
  const themeLabel = mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light';
  const searchedGroups = visibleGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(normalizedSearch)),
    }))
    .filter((group) => group.items.length > 0);

  const handleSignOut = () => setSignOutOpen(true);

  const onPressRow = (item: SettingsRow) => {
    if (item.kind === 'route') {
      if (item.route === '__appearance__') {
        cycleTheme();
        return;
      }
      navigation.navigate(item.route);
      return;
    }
    navigation.navigate('Billing', { tab: item.tab });
  };

  const { colors } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topbar, { paddingTop: insets.top + spacing.sm + 2, backgroundColor: colors.background, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.topbarCopy}>
          <AppText variant="title">Settings</AppText>
        </View>
        <NotificationBell onOpen={() => setNotificationsOpen(true)} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AppCard style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            {displayAvatarUrl ? (
              <Image
                source={{ uri: displayAvatarUrl }}
                style={[styles.avatarImage, { backgroundColor: colors.surfaceSecondary }]}
                cachePolicy="memory-disk"
                contentFit="cover"
              />
            ) : (
              <AppText variant="subheading" tone="inverse">{getInitials(name)}</AppText>
            )}
          </View>
          <View style={styles.copy}>
            <AppText variant="subheading" numberOfLines={1}>{name}</AppText>
            <View style={styles.emailLine}>
              <Mail color={colors.textSecondary} size={14} />
              <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.email}>{email || 'Account'}</AppText>
            </View>
          </View>
        </AppCard>

        <AppSearchField value={search} onChangeText={setSearch} placeholder="Search settings" tone="surface" />

        {subscriptionExpired ? (
          <Pressable
            onPress={() => navigation.navigate('Billing', { tab: 'packages' })}
            style={[styles.renewCard, { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder }]}
          >
            <View style={[styles.tile, { backgroundColor: colors.dangerBorder }]}>
              <CreditCard color={colors.error} size={18} />
            </View>
            <View style={styles.copy}>
              <AppText variant="bodyStrong">Renew plan</AppText>
              <AppText variant="small" tone="secondary" numberOfLines={2}>
                {lockReason}
              </AppText>
            </View>
            <ChevronRight color={colors.textMuted} size={18} />
          </Pressable>
        ) : null}

        {searchedGroups.map((group) => {
          return (
            <View key={group.label} style={styles.group}>
              <AppText variant="section" style={styles.groupTitle}>{group.label}</AppText>
              <AppCard style={styles.groupCard}>
                <View style={styles.grid}>
                  {group.items.map((item) => {
                    const isAppearance = item.kind === 'route' && item.route === '__appearance__';
                    const RowIcon = isAppearance ? (isDark ? Moon : Sun) : item.icon;
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="button"
                        onPress={() => onPressRow(item)}
                        style={styles.gridItem}
                      >
                        <View style={[styles.gridIcon, styles.gridIconShadow, { backgroundColor: item.iconBg }]}>
                          <RowIcon color={item.iconColor} size={22} />
                        </View>
                        <AppText variant="caption" numberOfLines={2} style={styles.gridLabel}>{item.label}</AppText>
                        {isAppearance ? <AppText variant="tiny" tone="primary" style={styles.appearanceMode}>{themeLabel}</AppText> : null}
                        {item.kind === 'route' && item.badge ? <AppBadge label={item.badge} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </AppCard>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.signOutWrap, { paddingBottom: Math.max(insets.bottom, spacing.lg), backgroundColor: colors.background, borderTopColor: colors.cardBorder }]}>
        <Pressable style={[styles.signOut, { backgroundColor: colors.surface, borderColor: colors.dangerBorder }]} onPress={handleSignOut}>
          <LogOut color={colors.error} size={20} />
          <AppText variant="bodyStrong" tone="error" style={styles.signOutText}>Sign out</AppText>
        </Pressable>
      </View>

      <NotificationCenter visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <ConfirmDialog
        visible={signOutOpen}
        title="Sign out"
        body="Are you sure you want to sign out of your account?"
        confirmLabel="Sign out"
        destructive
        icon={LogOut}
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          void logout();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topbar: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.md + 2,
    paddingHorizontal: spacing.xl,
  },
  topbarCopy: { flex: 1, minWidth: 0 },
  scroll: { flex: 1 },
  content: { gap: spacing.lg, paddingBottom: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  renewCard: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    padding: spacing.lg,
  },
  profileCard: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: { alignItems: 'center', borderRadius: radius.xxl + 4, height: 48, justifyContent: 'center', overflow: 'hidden', width: 48 },
  avatarImage: { borderRadius: radius.xxl + 4, height: 48, width: 48 },
  copy: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  emailLine: { alignItems: 'center', flexDirection: 'row', marginTop: spacing.xs },
  email: { flex: 1, marginLeft: spacing.xs },
  tile: { alignItems: 'center', borderRadius: radius.xxl, height: 40, justifyContent: 'center', width: 40 },
  groupHeader: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md + 2,
  },
  group: { gap: spacing.sm },
  groupTitle: { paddingHorizontal: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  gridItem: {
    alignItems: 'center',
    minHeight: 112,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    width: '33.333%',
  },
  gridIcon: {
    alignItems: 'center',
    borderRadius: radius.xxl,
    height: 52,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 52,
  },
  gridIconShadow: {
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  gridLabel: { fontSize: 12, fontWeight: fontWeight.semibold, textAlign: 'center' },
  appearanceMode: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  groupCard: {
    marginTop: spacing.sm,
    overflow: 'hidden',
    padding: spacing.xs,
  },
  signOutWrap: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  signOut: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  signOutText: { marginLeft: spacing.sm },
});
