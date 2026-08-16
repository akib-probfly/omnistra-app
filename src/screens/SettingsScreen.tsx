import {
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  LogOut,
  Mail,
  Moon,
  Package,
  Palette,
  Receipt,
  Sun,
  UserRound,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { NotificationBell, NotificationCenter } from '../components/NotificationCenter';
import type { SettingsStackParamList } from '../navigation/SettingsStack';
import { useTheme } from '../theme/ThemeContext';

type BillingTab = 'current' | 'packages' | 'invoices' | 'history';

type GeneralRoute = 'Profile' | 'Workspace' | 'Notifications' | 'InboxAppearance' | 'QuickReplies' | 'AssignmentPolicy' | '__appearance__';

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
      { kind: 'route', id: 'profile', label: 'Profile', description: 'Name, email, password, and avatar', icon: UserRound, iconBg: '#eff6ff', iconColor: '#2563eb', route: 'Profile' },
      { kind: 'route', id: 'workspace', label: 'Workspace', description: 'Workspace name and timezone', icon: Building2, iconBg: '#ecfdf5', iconColor: '#059669', route: 'Workspace' },
      { kind: 'route', id: 'notifications', label: 'Notifications', description: 'Alerts, sound, and push preferences', icon: Bell, iconBg: '#fff7ed', iconColor: '#ea580c', route: 'Notifications' },
      { kind: 'route', id: 'appearance', label: 'Appearance', description: 'Light, dark, or system theme', icon: Moon, iconBg: '#1e293b', iconColor: '#f1f5f9', route: '__appearance__' },
      { kind: 'route', id: 'inbox-appearance', label: 'Inbox Appearance', description: 'Thread patterns, backgrounds, and avatars', icon: Palette, iconBg: '#eff6ff', iconColor: '#2563eb', route: 'InboxAppearance' },
      { kind: 'route', id: 'assignment', label: 'Assignment Policy', description: 'Auto-assign and call routing rules', icon: Workflow, iconBg: '#eef2ff', iconColor: '#4f46e5', route: 'AssignmentPolicy', badge: 'NEW' },
      { kind: 'route', id: 'quick-replies', label: 'Quick Replies', description: 'Create and manage reply snippets', icon: Zap, iconBg: '#fefce8', iconColor: '#ca8a04', route: 'QuickReplies' },
    ],
  },
  {
    label: 'Billing',
    items: [
      { kind: 'billing', id: 'billing-current', label: 'Current Plan', description: 'Active plan and usage', icon: CreditCard, iconBg: '#eff6ff', iconColor: '#2563eb', tab: 'current' },
      { kind: 'billing', id: 'billing-packages', label: 'Packages & Add-ons', description: 'Browse plans and pricing', icon: Package, iconBg: '#ecfdf5', iconColor: '#059669', tab: 'packages' },
      { kind: 'billing', id: 'billing-invoices', label: 'Invoices', description: 'Paid and pending invoices', icon: Receipt, iconBg: '#fff7ed', iconColor: '#ea580c', tab: 'invoices' },
      { kind: 'billing', id: 'billing-subscriptions', label: 'Subscription History', description: 'Past subscriptions', icon: FileText, iconBg: '#f1f5f9', iconColor: '#475569', tab: 'history' },
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  /** Both groups start collapsed so Sign out stays visible. Only one group can be open. */
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const name = session?.user.name?.trim() || session?.user.email?.trim() || 'User';
  const email = session?.user.email?.trim() || '';

  const cycleTheme = () => {
    if (mode === 'system') setMode('light');
    else if (mode === 'light') setMode('dark');
    else setMode('system');
  };

  const themeLabel = mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light';

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

  const toggleGroup = (label: string) => {
    setOpenGroup((current) => (current === label ? null : label));
  };

  const { colors } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10, backgroundColor: colors.background, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.topbarCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>General settings and billing</Text>
        </View>
        <NotificationBell onOpen={() => setNotificationsOpen(true)} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(name)}</Text>
          </View>
          <View style={styles.copy}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
            <View style={styles.emailLine}>
              <Mail color={colors.textSecondary} size={14} />
              <Text style={[styles.email, { color: colors.textSecondary }]} numberOfLines={1}>{email || 'Account'}</Text>
            </View>
          </View>
        </View>

        {SETTINGS_GROUPS.map((group) => {
          const isOpen = openGroup === group.label;
          return (
            <View key={group.label} style={styles.group}>
              <Pressable style={[styles.groupHeader, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]} onPress={() => toggleGroup(group.label)}>
                <Text style={[styles.groupLabel, { color: colors.text }]}>{group.label}</Text>
                {isOpen ? <ChevronDown color={colors.textMuted} size={18} /> : <ChevronRight color={colors.textMuted} size={18} />}
              </Pressable>
              {isOpen ? (
                <View style={[styles.groupCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                  {group.items.map((item, index) => {
                    const Icon = item.icon;
                    const isAppearance = item.kind === 'route' && item.route === '__appearance__';
                    return (
                      <Pressable
                        key={item.id}
                        style={[styles.row, index < group.items.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: 1 }]}
                        onPress={() => onPressRow(item)}
                      >
                        <View style={[styles.rowIcon, { backgroundColor: item.iconBg }]}>
                          {isAppearance ? (
                            isDark ? <Moon color={item.iconColor} size={18} /> : <Sun color={item.iconColor} size={18} />
                          ) : (
                            <Icon color={item.iconColor} size={18} />
                          )}
                        </View>
                        <View style={styles.copy}>
                          <View style={styles.rowTitleLine}>
                            <Text style={[styles.rowName, { color: colors.text }]}>{item.label}</Text>
                            {item.kind === 'route' && item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}
                          </View>
                          <Text style={[styles.muted, { color: colors.textSecondary }]} numberOfLines={1}>
                            {isAppearance ? `Current: ${themeLabel}` : item.description}
                          </Text>
                        </View>
                        {isAppearance ? (
                          <Text style={[styles.themeValue, { color: colors.primary }]}>{themeLabel}</Text>
                        ) : (
                          <ChevronRight color={colors.textMuted} size={18} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.signOutWrap, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.background, borderTopColor: colors.cardBorder }]}>
        <Pressable style={[styles.signOut, { backgroundColor: colors.surface, borderColor: isDark ? colors.surfaceSecondary : '#fecdd3' }]} onPress={handleSignOut}>
          <LogOut color={colors.error} size={20} />
          <Text style={[styles.signOutText, { color: colors.error }]}>Sign out</Text>
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
  screen: { backgroundColor: '#f8fafc', flex: 1 },
  topbar: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderBottomColor: '#e8eef7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  topbarCopy: { flex: 1, minWidth: 0 },
  title: { color: '#0f172a', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 4 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#d8e6fb',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 16,
  },
  avatar: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  copy: { flex: 1, marginLeft: 12, minWidth: 0 },
  name: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  emailLine: { alignItems: 'center', flexDirection: 'row', marginTop: 4 },
  email: { color: '#64748b', flex: 1, fontSize: 13, marginLeft: 4 },
  group: { marginTop: 16 },
  groupHeader: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#d8e6fb',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  groupLabel: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
  groupCard: {
    backgroundColor: '#fff',
    borderColor: '#d8e6fb',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 8,
    overflow: 'hidden',
  },
  row: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1 },
  rowIcon: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  rowTitleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowName: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  badge: {
    backgroundColor: '#dbeafe',
    borderRadius: 999,
    color: '#1d4ed8',
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  muted: { color: '#64748b', fontSize: 12, marginTop: 2 },
  themeValue: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  signOutWrap: {
    backgroundColor: '#f8fafc',
    borderTopColor: '#e8eef7',
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  signOut: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#fecdd3',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 16,
  },
  signOutText: { color: '#dc2626', fontSize: 15, fontWeight: '700', marginLeft: 8 },
});
