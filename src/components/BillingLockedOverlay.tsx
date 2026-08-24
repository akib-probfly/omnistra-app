import { CommonActions } from '@react-navigation/native';
import { CreditCard, Lock, LogOut } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { useBillingLockReason } from '../lib/billing-lock';
import { navigationRef } from '../navigation/navigationRef';
import { useTheme } from '../theme/ThemeContext';

const UNLOCKED_ROUTES = new Set(['SettingsList', 'Billing', 'BillingPlanDetails', 'BillingCheckout']);

export function BillingLockedOverlay() {
  const reason = useBillingLockReason();
  const { logout } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [currentRoute, setCurrentRoute] = useState<string | undefined>();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const syncRoute = () => {
      try {
        if (!navigationRef.isReady()) return;
        setCurrentRoute(navigationRef.getCurrentRoute()?.name);
        unsubscribe ??= navigationRef.addListener('state', syncRoute);
      } catch {
        // NavigationContainer can mount before a navigator exists.
      }
    };
    syncRoute();
    const interval = unsubscribe ? undefined : setInterval(syncRoute, 250);
    return () => {
      if (interval) clearInterval(interval);
      unsubscribe?.();
    };
  }, []);

  if (!reason || (currentRoute && UNLOCKED_ROUTES.has(currentRoute))) return null;

  const hasNoSubscription =
    reason.toLowerCase().includes('no active subscription') || reason.toLowerCase().includes('no subscription');

  return (
    <View style={[styles.backdrop, { top: 0, left: 0, right: 0, bottom: 58 + insets.bottom, paddingTop: insets.top + 24, paddingBottom: 24, backgroundColor: isDark ? 'rgba(11,17,24,0.88)' : 'rgba(15,23,42,0.72)' }]} pointerEvents="auto">
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <View style={[styles.iconWrap, { backgroundColor: hasNoSubscription ? `${colors.textMuted}22` : `${colors.error}18` }]}>
          <Lock size={28} color={hasNoSubscription ? colors.textMuted : colors.error} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Workspace locked</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {hasNoSubscription
            ? 'No active subscription found for this workspace.'
            : reason || 'Your subscription has expired. Renew to regain full access to your workspace.'}
        </Text>
        <Pressable
          style={[styles.primary, { backgroundColor: colors.primary }]}
          onPress={() => {
            if (!navigationRef.isReady()) return;
            navigationRef.dispatch(
              CommonActions.navigate({
                name: 'Main',
                params: {
                  screen: 'Settings',
                  params: { screen: 'SettingsList' },
                },
              }),
            );
          }}
        >
          <CreditCard size={18} color="#fff" />
          <Text style={styles.primaryText}>Renew plan</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => void logout()}>
          <LogOut size={18} color={colors.textSecondary} />
          <Text style={[styles.ghostText, { color: colors.textSecondary }]}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    zIndex: 80,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 28,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 20,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  primary: {
    marginTop: 24,
    height: 48,
    borderRadius: 999,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  ghost: {
    marginTop: 8,
    height: 48,
    borderRadius: 999,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ghostText: { fontSize: 15, fontWeight: '600' },
});
