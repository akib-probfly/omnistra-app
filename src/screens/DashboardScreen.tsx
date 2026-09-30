import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock3,
  ArrowUpRight,
  Inbox,
  MessageSquareText,
  Percent,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  Wifi,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useIsFocused, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { fetchDashboard, type DashboardChannelHealthItem, type DashboardResponse, type DashboardTeamCommandCenterMember, type DashboardTrendPoint } from '../api/dashboard';
import { fetchWorkspaceUsage, type WorkspaceUsage } from '../api/billing';
import { channelBrandColor, ChannelLogo } from '../components/ChannelLogo';
import { NotificationBell, NotificationCenter } from '../components/NotificationCenter';
import { DashboardSkeleton } from '../components/Skeleton';
import { ColorfulAvatar } from '../components/ColorfulAvatar';
import { useWorkspaceAccess } from '../lib/workspace-access';
import { workspaceIdFromAccessToken } from '../lib/jwt-workspace';
import { isBillingLocked, pollingWhileUnlocked } from '../lib/billing-lock';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppButton, AppCard } from '../ui';
import type { MainTabParamList } from '../navigation/MainTabs';

type RangePreset = 'today' | '7d' | '30d';
type PresenceFilter = 'all' | 'online' | 'offline';

const RANGE_LABELS: Record<RangePreset, string> = { today: 'Today', '7d': '7 Days', '30d': '30 Days' };
const INITIAL_VISIBLE_CHANNELS = 6;
const TONE_COLORS: Record<string, string> = { healthy: '#22c55e', degraded: '#f59e0b', warning: '#ef4444', offline: '#94a3b8' };

function mixHex(hex: string, target: string, amount: number) {
  const parse = (value: string) => {
    let normalized = value.replace('#', '');
    if (normalized.length === 3) normalized = normalized.split('').map((c) => c + c).join('');
    return normalized;
  };
  const from = parse(hex);
  const to = parse(target);
  const a = [parseInt(from.slice(0, 2), 16), parseInt(from.slice(2, 4), 16), parseInt(from.slice(4, 6), 16)];
  const b = [parseInt(to.slice(0, 2), 16), parseInt(to.slice(2, 4), 16), parseInt(to.slice(4, 6), 16)];
  const out = a.map((v, i) => Math.round(v * (1 - amount) + b[i] * amount));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Dark, tinted version of a light gradient so Uber cards stay colorful but readable in dark mode. */
function darkGradient(light: [string, string]): [string, string] {
  return [mixHex(light[0], '#0f172a', 0.6), mixHex(light[1], '#0f172a', 0.6)];
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function resolveRange(preset: RangePreset) {
  const now = new Date();
  const from = startOfDay(now);
  if (preset === '7d') from.setDate(from.getDate() - 6);
  if (preset === '30d') from.setDate(from.getDate() - 29);
  return { from, to: now };
}

function toUtcIso(value: Date) {
  const pad = (part: number, length = 2) => String(part).padStart(length, '0');
  return [
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`,
    `.${pad(value.getMilliseconds(), 3)}`,
    'Z',
  ].join('');
}

function formatDateRangeLabel(from: Date, to: Date) {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const left = new Intl.DateTimeFormat(undefined, options).format(from);
  const right = new Intl.DateTimeFormat(undefined, options).format(to);
  return `${left} – ${right}, ${to.getFullYear()}`;
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined).format(value ?? 0);
}

function formatDuration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  const totalSeconds = Math.max(0, Math.round(minutes * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  return `${secs}s`;
}

function compareValues(previous: number | null | undefined, current: number | null | undefined, higherIsBetter = true) {
  if (previous === null || previous === undefined || current === null || current === undefined) return { label: null, positive: true };
  if (previous === 0) return { label: null, positive: true };
  const deltaPercent = ((current - previous) / previous) * 100;
  return { label: `${deltaPercent >= 0 ? '+' : '−'}${Math.abs(deltaPercent).toFixed(1)}%`, positive: higherIsBetter ? current >= previous : current <= previous };
}

function getTrendSnapshot(trends: DashboardTrendPoint[]) {
  const first = trends[0] ?? null;
  const last = trends[trends.length - 1] ?? null;
  return {
    total: { previous: first ? first.incoming + first.resolved : null, current: last ? last.incoming + last.resolved : null },
    response: { previous: first?.avgFirstResponseMinutes ?? null, current: last?.avgFirstResponseMinutes ?? null },
    rate: {
      previous: first && first.incoming + first.resolved > 0 ? (first.resolved / (first.incoming + first.resolved)) * 100 : null,
      current: last && last.incoming + last.resolved > 0 ? (last.resolved / (last.incoming + last.resolved)) * 100 : null,
    },
  };
}

function channelLabel(channelType: string) {
  switch ((channelType ?? '').toUpperCase()) {
    case 'WHATSAPP': return 'WhatsApp';
    case 'MESSENGER': return 'Messenger';
    case 'INSTAGRAM': return 'Instagram';
    case 'TELEGRAM': return 'Telegram';
    case 'TIKTOK': return 'TikTok';
    case 'EMAIL': return 'Email';
    default: return channelType ? channelType.charAt(0).toUpperCase() + channelType.slice(1).toLowerCase() : 'Channel';
  }
}

function deriveChannelStatuses(channels: DashboardChannelHealthItem[]) {
  return (channels ?? [])
    .filter((channel) => channel.lifecycleState !== 'DISABLED' && channel.lifecycleState !== 'REMOVED')
    .filter((channel) => channel.channelStatus !== 'DISCONNECTED' && channel.accountStatus !== 'DISCONNECTED')
    .map((channel) => {
      const isOffline = channel.channelStatus === 'DISCONNECTED' || channel.accountStatus === 'DISCONNECTED';
      const isWarning = channel.channelStatus === 'ERROR' || channel.lastWebhookError !== null;
      const isDegraded = channel.channelStatus === 'NEEDS_ACTION' || channel.channelStatus === 'PENDING' || channel.connectedAccounts === 0;
      const tone = isOffline ? 'offline' : channel.lifecycleState === 'PAUSED' ? 'warning' : isWarning ? 'warning' : isDegraded ? 'degraded' : 'healthy';
      const detail = isOffline
        ? 'Disconnected'
        : isWarning
          ? 'Needs attention'
          : isDegraded
            ? `${channel.connectedAccounts}/${Math.max(channel.activeAccounts, 1)} connected`
            : `${channel.connectedAccounts}/${Math.max(channel.activeAccounts, 1)} healthy`;
      return { channelId: channel.channelId, name: channel.channelName, channelType: channel.channelType, tone, detail, messagesInRange: channel.messagesInRange };
    });
}

function RangeSegment({ value, onChange, colors }: { value: RangePreset; onChange: (next: RangePreset) => void; colors: ThemeColors }) {
  return (
    <View style={styles.rangeChipRow}>
      {(['today', '7d', '30d'] as RangePreset[]).map((item) => {
        const active = value === item;
        return (
          <Pressable key={item} style={[styles.rangeChip, !active && { backgroundColor: colors.surfaceSecondary }, active && { backgroundColor: colors.primary }]} onPress={() => onChange(item)}>
            <Text style={[styles.rangeChipText, !active && { color: colors.textSecondary }, active && { color: '#fff' }]} numberOfLines={1}>{RANGE_LABELS[item]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Section({ title, subtitle, action, children, colors }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; colors: ThemeColors }) {
  return (
    <AppCard style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </AppCard>
  );
}

function CarouselSection({
  title,
  subtitle,
  action,
  children,
  colors,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  colors?: ThemeColors;
}) {
  return (
    <View style={styles.carouselSection}>
      <View style={styles.carouselHeader}>
        <View style={styles.carouselHeaderCopy}>
          <Text style={[styles.carouselTitle, colors ? { color: colors.text } : null]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.carouselSubtitle, colors ? { color: colors.textSecondary } : null]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function MetricStack({ children, itemCount }: { children: ReactNode[]; itemCount: number }) {
  const { width: screenWidth } = useWindowDimensions();
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const dragX = useRef(new Animated.Value(0)).current;
  const depthValues = useRef(new Map<number, Animated.Value>());
  const safeActiveIndex = activeIndex % Math.max(itemCount, 1);
  const advance = useCallback((direction: -1 | 1) => {
    setActiveIndex((current) => ((current % itemCount) + direction + itemCount) % itemCount);
  }, [itemCount]);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => itemCount > 1 && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
    onPanResponderMove: (_event, gesture) => dragX.setValue(gesture.dx),
    onPanResponderRelease: (_event, gesture) => {
      const direction: -1 | 1 = gesture.dx < 0 ? 1 : -1;
      if (Math.abs(gesture.dx) > 88 || Math.abs(gesture.vx) > 0.65) {
        Animated.timing(dragX, {
          toValue: direction > 0 ? -screenWidth : screenWidth,
          duration: 210,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!finished) return;
          advance(direction);
          dragX.setValue(0);
        });
      } else {
        Animated.spring(dragX, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(dragX, { toValue: 0, useNativeDriver: true }).start(),
  }), [advance, dragX, itemCount, screenWidth]);

  useEffect(() => {
    for (let depth = 0; depth < Math.min(itemCount, 3); depth += 1) {
      const index = (safeActiveIndex + depth) % itemCount;
      const value = depthValues.current.get(index);
      if (value) {
        Animated.spring(value, { toValue: depth, useNativeDriver: true, speed: 18, bounciness: 3 }).start();
      }
    }
  }, [itemCount, safeActiveIndex]);

  const visibleCards = Array.from({ length: Math.min(itemCount, 3) }, (_, depth) => {
    const index = (safeActiveIndex + depth) % itemCount;
    let depthValue = depthValues.current.get(index);
    if (!depthValue) {
      depthValue = new Animated.Value(depth);
      depthValues.current.set(index, depthValue);
    }
    return { child: children[index], depth, depthValue, index };
  }).reverse();

  return (
    <View style={styles.metricDeck} {...panResponder.panHandlers}>
      {itemCount === 1 ? (
        <>
          <View pointerEvents="none" style={[styles.metricDeckSingleBack, styles.metricDeckSingleBackFar, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]} />
          <View pointerEvents="none" style={[styles.metricDeckSingleBack, styles.metricDeckSingleBackNear, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]} />
        </>
      ) : null}
      {visibleCards.map(({ child, depth, depthValue, index }) => {
        const isFront = depth === 0;
        const cardMotionStyle = {
          transform: [
            { translateX: isFront ? dragX : 0 },
            { translateY: depthValue.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 9, 18] }) },
            { scale: depthValue.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 0.955, 0.91] }) },
            { rotate: isFront ? dragX.interpolate({ inputRange: [-180, 0, 180], outputRange: ['-2deg', '0deg', '2deg'], extrapolate: 'clamp' }) : '0deg' },
          ],
        };
        return (
          <Animated.View
            // Keep the card instance stable as it moves from the stack to front.
            key={index}
            pointerEvents={isFront ? 'auto' : 'none'}
            style={[
              styles.metricDeckCard,
              { zIndex: 3 - depth },
              cardMotionStyle,
            ]}
          >
            {child}
          </Animated.View>
        );
      })}
      <View style={styles.metricDeckFooter}>
        <View style={styles.metricDeckDots}>
          {children.map((_, index) => (
            <View key={index} style={[styles.metricDeckDot, index === safeActiveIndex && styles.metricDeckDotActive]} />
          ))}
        </View>
        <Text style={styles.metricDeckHint}>Swipe to explore</Text>
      </View>
    </View>
  );
}

function UberCard({
  width,
  colors,
  icon,
  value,
  badge,
  footerBadge,
  title,
  subtitle,
  isDark = false,
  onDark = true,
  valueColor,
}: {
  width: number;
  colors: [string, string];
  icon: ReactNode;
  value: string;
  badge?: ReactNode;
  footerBadge?: ReactNode;
  title: string;
  subtitle: string;
  isDark?: boolean;
  onDark?: boolean;
  valueColor?: string;
}) {
  const effectiveOnDark = isDark ? true : onDark;
  return (
    <View style={[styles.uberCard, { width }]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.uberPoster}>
        <View style={[styles.uberOrb, styles.uberOrbA]} />
        <View style={[styles.uberOrb, styles.uberOrbB]} />

        <View style={styles.uberHeader}>
          <View style={effectiveOnDark ? styles.posterIconChip : [styles.posterIconChipDark, styles.posterIconChipSoft]}>
            {icon}
          </View>
          <View style={styles.uberHeaderRight}>
            {badge ? <View style={effectiveOnDark ? styles.uberBadgeDark : styles.uberBadgeLight}>{badge}</View> : null}
            <Text
              style={[effectiveOnDark ? styles.posterHeroLight : styles.posterHeroDark, valueColor ? { color: valueColor } : null]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {value}
            </Text>
          </View>
        </View>

        <View style={styles.uberFooter}>
          <View style={styles.uberFooterCopy}>
            <Text style={effectiveOnDark ? styles.uberCardTitleLight : styles.uberCardTitle} numberOfLines={1}>{title}</Text>
            <Text style={effectiveOnDark ? styles.uberCardSubtitleLight : styles.uberCardSubtitle} numberOfLines={2}>{subtitle}</Text>
          </View>
          {footerBadge ? (
            <View style={effectiveOnDark ? styles.uberBadgeDark : styles.uberBadgeLight}>{footerBadge}</View>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

function ChannelMix({ mix, colors }: { mix: DashboardResponse['channelMix']; colors: ThemeColors }) {
  const segments = useMemo(() => {
    const total = (mix ?? []).reduce((sum, item) => sum + item.total, 0);
    return (mix ?? [])
      .map((item) => ({ ...item, value: total > 0 ? (item.total / total) * 100 : 0 }))
      .sort((left, right) => right.value - left.value);
  }, [mix]);
  const total = segments.reduce((sum, item) => sum + item.total, 0);
  const R = 46;
  const SW = 16;
  const C = 2 * Math.PI * R;
  let acc = 0;

  return (
    <View style={styles.mixLayout}>
      <View style={styles.donut}>
        <Svg width={120} height={120} viewBox="0 0 120 120" style={{ transform: [{ rotate: '-90deg' }] }}>
          {segments.length === 0 ? <Circle cx="60" cy="60" r={R} fill="none" stroke={colors.separator} strokeWidth={SW} /> : null}
          {segments.map((seg) => {
            const dash = (seg.value / 100) * C;
            const offset = -acc;
            acc += dash;
            return <Circle key={seg.channelType} cx="60" cy="60" r={R} fill="none" stroke={channelBrandColor(seg.channelType)} strokeWidth={SW} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={offset} />;
          })}
        </Svg>
        <View style={styles.donutCenter} pointerEvents="none">
          <Text style={[styles.donutValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{formatNumber(total)}</Text>
          <Text style={[styles.donutLabel, { color: colors.textMuted }]}>Total</Text>
        </View>
      </View>
      <View style={styles.mixList}>
        {segments.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No channel mix data.</Text>
        ) : segments.map((seg) => (
          <View style={styles.channelRow} key={seg.channelType}>
            <ChannelLogo type={seg.channelType} box={22} glyph={12} radius={7} />
            <Text style={[styles.channelName, { color: colors.textSecondary }]} numberOfLines={1}>{channelLabel(seg.channelType)}</Text>
            <Text style={[styles.channelPercent, { color: colors.text }]}>{seg.value.toFixed(0)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TeamCommandCenter({ data, colors, isDark }: { data: DashboardResponse | undefined; colors: ThemeColors; isDark: boolean }) {
  const { width: windowWidth } = useWindowDimensions();
  const statWidth = Math.max(windowWidth - 32, 280);
  const [filter, setFilter] = useState<PresenceFilter>('all');
  const team = data?.teamCommandCenter;
  const enriched = useMemo(() => {
    const rows = (team?.members ?? data?.agentPerformance ?? []) as DashboardTeamCommandCenterMember[];
    return rows
      .sort((left, right) => (right.assignedConversations ?? 0) - (left.assignedConversations ?? 0))
      .map((row) => {
        const status = row.onlineStatus === 'ONLINE' ? 'online' : 'offline';
        const assigned = row.assignedConversations ?? 0;
        const open = row.openConversations ?? 0;
        const replied = row.repliedConversations ?? Math.max(0, assigned - open);
        const progress = row.replyProgressPercent ?? (assigned > 0 ? Math.round((replied / assigned) * 100) : 0);
        return {
          key: row.workspaceMemberId,
          name: row.userName ?? row.userEmail ?? 'Agent',
          initials: (row.userName ?? row.userEmail ?? 'Agent').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
          status,
          activity: status === 'online' ? (row.isAtCapacity ? 'At capacity' : 'Available now') : 'No active load',
          assigned,
          open,
          replied,
          progress,
          responseLabel: formatDuration(row.avgFirstResponseMinutes),
        };
      });
  }, [data, team?.members]);

  const onlineCount = enriched.filter((row) => row.status === 'online').length;
  const offlineCount = Math.max(enriched.length - onlineCount, 0);
  const totalMembers = team?.summary.totalMembers ?? enriched.length;
  const availableNow = team?.summary.availableNowMembers ?? onlineCount;
  const totalAssigned = team?.summary.totalAssignedConversations ?? enriched.reduce((sum, row) => sum + row.assigned, 0);
  const totalOpen = team?.summary.totalOpenConversations ?? enriched.reduce((sum, row) => sum + row.open, 0);
  const totalReplied = team?.summary.totalRepliedConversations ?? Math.max(0, totalAssigned - totalOpen);
  const teamProgress = team?.summary.replyProgressPercent ?? (totalAssigned > 0 ? Math.round((totalReplied / totalAssigned) * 100) : 0);
  const avgResponseLabel = formatDuration(team?.summary.avgResponseMinutes ?? null);
  const filters = [
    { key: 'all' as PresenceFilter, label: 'All', count: team?.filters.all ?? enriched.length },
    { key: 'online' as PresenceFilter, label: 'Online', count: team?.filters.online ?? onlineCount },
    { key: 'offline' as PresenceFilter, label: 'Offline', count: team?.filters.offline ?? offlineCount },
  ];
  const list = filter === 'all' ? enriched : enriched.filter((row) => row.status === filter);
  const teamStats = [
    { label: 'Available now', value: `${availableNow}/${totalMembers}`, note: 'Agents ready to take conversations', colors: isDark ? darkGradient(['#047857', '#34d399']) : ['#047857', '#34d399'] as [string, string], Icon: UserCheck },
    { label: 'Assigned load', value: formatNumber(totalAssigned), note: 'Conversations currently with agents', colors: isDark ? darkGradient(['#1d4ed8', '#60a5fa']) : ['#1d4ed8', '#60a5fa'] as [string, string], Icon: Inbox },
    { label: 'Still open', value: formatNumber(totalOpen), note: 'Waiting on a reply from the team', colors: isDark ? darkGradient(['#c2410c', '#fb923c']) : ['#c2410c', '#fb923c'] as [string, string], Icon: MessageSquareText },
    { label: 'Avg response', value: avgResponseLabel, note: `${teamProgress}% team progress · ${formatNumber(totalReplied)} replied`, colors: isDark ? darkGradient(['#6d28d9', '#a78bfa']) : ['#6d28d9', '#a78bfa'] as [string, string], Icon: Clock3 },
  ];

  return (
    <View>
      <CarouselSection
        title="Team Command Center"
        subtitle={`${availableNow} of ${totalMembers} available`}
        colors={colors}
        action={(
          <View style={[styles.livePill, { backgroundColor: isDark ? colors.surfaceSecondary : '#ecfdf5' }]}>
            <View style={styles.liveDot} />
            <Text style={[styles.livePillText, { color: isDark ? colors.text : '#059669' }]}>Live</Text>
          </View>
        )}
      >
        <View style={styles.statusTabsRow}>
          {filters.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable key={item.key} style={[styles.statusTabChip, !active && { backgroundColor: colors.surface, borderColor: colors.cardBorder }, !isDark && active && styles.statusActive, isDark && active && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setFilter(item.key)}>
                <Text style={[styles.statusText, !active && { color: colors.textSecondary }, active && styles.statusTextActive]} numberOfLines={1}>{item.label}</Text>
                <View style={[styles.statusCount, !active && { backgroundColor: colors.cardBorder }, active && styles.statusCountActive]}>
                  <Text style={[styles.statusCountText, !active && { color: colors.textSecondary }, active && styles.statusCountTextActive]}>{item.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <MetricStack itemCount={teamStats.length}>
          {teamStats.map((stat) => {
            const Icon = stat.Icon;
            return (
              <UberCard
                key={stat.label}
                width={statWidth}
                colors={stat.colors}
                isDark={isDark}
                icon={<Icon color={isDark ? colors.text : '#fff'} size={20} strokeWidth={2.2} />}
                value={stat.value}
                title={stat.label}
                subtitle={stat.note}
              />
            );
          })}
        </MetricStack>
      </CarouselSection>

      <Section title="Your agents" subtitle={filter === 'all' ? 'Sorted by assigned load' : `${filter} agents`} colors={colors}>
        <View style={styles.memberList}>
          {list.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No agents in this state.</Text>
          ) : list.map((row) => (
            <View style={[styles.memberCard, { backgroundColor: colors.background, borderColor: colors.separator }, row.status === 'offline' && styles.memberOffline]} key={row.key}>
              <View style={styles.memberTop}>
                <View style={styles.memberAvatarWrap}>
                  <View style={[styles.memberAvatar, { backgroundColor: colors.primarySoft }]}><Text style={[styles.memberInitials, { color: colors.primary }]}>{row.initials}</Text></View>
                  <View style={[styles.presenceDot, { backgroundColor: row.status === 'online' ? '#22c55e' : colors.textMuted, borderColor: colors.surface }]} />
                </View>
                <View style={styles.memberIdentity}>
                  <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>{row.name}</Text>
                  <Text style={[styles.memberActivity, { color: colors.textSecondary }]} numberOfLines={1}>{row.activity}</Text>
                </View>
                <View style={[styles.presenceBadge, { backgroundColor: row.status === 'online' ? isDark ? colors.surfaceSecondary : '#ecfdf5' : colors.surfaceSecondary }]}>
                  <Text style={[styles.presenceBadgeText, { color: row.status === 'online' ? '#059669' : colors.textSecondary }]}>
                    {row.status === 'online' ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>

              <View style={styles.memberMetrics}>
                {[
                  { label: 'Replied', value: row.replied, color: colors.text },
                  { label: 'Open', value: row.open, color: colors.primary },
                  { label: 'Assigned', value: row.assigned, color: colors.text },
                ].map((metric) => (
                  <View key={metric.label} style={[styles.memberMetricTile, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.memberMetricValue, { color: metric.color }]}>{formatNumber(metric.value)}</Text>
                    <Text style={[styles.memberMetricLabel, { color: colors.textMuted }]}>{metric.label}</Text>
                  </View>
                ))}
              </View>

              <View style={[styles.memberBottom, { borderTopColor: colors.separator }]}>
                <View style={styles.memberProgressWrap}>
                  <View style={[styles.memberProgressTrack, { backgroundColor: colors.cardBorder }]}>
                    <View style={[styles.memberProgressFill, { width: `${Math.min(Math.max(row.progress, 0), 100)}%`, backgroundColor: row.status === 'online' ? '#10b981' : colors.textMuted }]} />
                  </View>
                  <Text style={[styles.memberProgressPct, { color: isDark ? colors.text : '#059669' }]}>{row.progress}%</Text>
                </View>
                <View style={[styles.responseChip, { backgroundColor: isDark ? colors.surfaceSecondary : '#eff6ff' }]}>
                  <Text style={[styles.responseChipText, { color: colors.primary }]} numberOfLines={1}>{row.responseLabel}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </Section>
    </View>
  );
}

function LiveChannelStatus({ data, colors }: { data: DashboardResponse | undefined; colors: ThemeColors }) {
  const [expanded, setExpanded] = useState(false);
  const statuses = useMemo(() => deriveChannelStatuses(data?.channelHealth ?? []).sort((a, b) => b.messagesInRange - a.messagesInRange), [data?.channelHealth]);
  const visible = expanded ? statuses : statuses.slice(0, INITIAL_VISIBLE_CHANNELS);
  const remaining = Math.max(statuses.length - INITIAL_VISIBLE_CHANNELS, 0);

  return (
    <Section
      title="Live Channel Status"
      subtitle="Connection health & volume"
      colors={colors}
      action={<Wifi color={colors.primary} size={18} />}
    >
      {statuses.length > 0 ? (
        <View style={styles.liveList}>
          {visible.map((status) => (
            <View style={[styles.liveRow, { borderBottomColor: colors.surfaceSecondary }]} key={status.channelId}>
              <ChannelLogo type={status.channelType} box={32} glyph={15} radius={10} />
              <View style={styles.liveCopy}>
                <Text style={[styles.liveName, { color: colors.text }]} numberOfLines={1}>{status.name}</Text>
                <View style={styles.liveStatusLine}>
                  <View style={[styles.toneDot, { backgroundColor: TONE_COLORS[status.tone] }]} />
                  <Text style={[styles.liveStatus, { color: colors.textSecondary }]} numberOfLines={1}>{status.detail}</Text>
                </View>
              </View>
              <View style={[styles.liveCountChip, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.liveCount, { color: colors.primary }]}>{formatNumber(status.messagesInRange)}</Text>
              </View>
            </View>
          ))}
          {remaining > 0 ? (
            <Pressable style={styles.loadMore} onPress={() => setExpanded((value) => !value)}>
              <Text style={[styles.loadMoreText, { color: colors.primary }]}>{expanded ? 'Show less' : `Show ${remaining} more`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={[styles.emptyBox, { borderColor: colors.cardBorder }]}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No active channel data in the current scope.</Text>
        </View>
      )}
    </Section>
  );
}

function MetricCard({
  label,
  value,
  note,
  color,
  colors,
  Icon,
  delta,
  width,
  isDark,
}: {
  label: string;
  value: string;
  note: string;
  color: string;
  colors: [string, string];
  Icon: typeof MessageSquareText;
  delta: { label: string | null; positive: boolean } | null;
  width: number;
  isDark: boolean;
}) {
  return (
    <UberCard
      width={width}
      colors={colors}
      isDark={isDark}
      onDark={false}
      valueColor={color}
      icon={<Icon color={color} size={20} strokeWidth={2.2} />}
      footerBadge={delta?.label ? (
        <Text style={[styles.uberDelta, isDark ? (delta.positive ? styles.deltaPositiveDark : styles.deltaNegativeDark) : (delta.positive ? styles.deltaPositive : styles.deltaNegative)]} numberOfLines={1}>
          {delta.label}
        </Text>
      ) : undefined}
      value={value}
      title={label}
      subtitle={note}
    />
  );
}

function BillingUsageCard({
  usage,
  loading,
  onPress,
  isDark,
}: {
  usage?: WorkspaceUsage;
  loading: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  const conversationCount = usage?.conversationCount;
  const conversationLimit = usage?.conversationLimit;
  const conversationPercent = conversationLimit != null && conversationLimit > 0 && conversationCount != null
    ? Math.min(100, Math.round(conversationCount / conversationLimit * 100))
    : 0;
  const textColor = '#ffffff';
  const mutedColor = 'rgba(255,255,255,0.78)';
  const usageBreakdown = [
    { label: 'Team', count: usage?.seatCount, limit: usage?.seatLimit, Icon: Users },
    { label: 'Channels', count: usage?.channelCount, limit: usage?.channelLimit, Icon: Wifi },
  ];
  const percentages = usageBreakdown.map(({ count, limit }) => limit != null && limit > 0 && count != null ? Math.min(100, Math.round(count / limit * 100)) : 0);
  const mainUsagePercent = loading || !usage ? 0 : conversationPercent;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open billing and plan usage">
      <LinearGradient colors={isDark ? ['#c86b5b', '#a94362'] : ['#f4775d', '#e65370']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.billingUsageCard}>
        <View pointerEvents="none" style={styles.usageGlowLarge} />
        <View style={styles.billingUsageHeader}>
          <View style={styles.billingUsageIcon}><MessageSquareText color={textColor} size={16} strokeWidth={2.2} /></View>
          <View style={styles.billingUsageHeaderCopy}>
            <Text style={[styles.billingUsageEyebrow, { color: mutedColor }]}>CURRENT PLAN</Text>
            <Text style={[styles.billingUsageTitle, { color: textColor }]} numberOfLines={1}>{usage?.planKey ? usage.planKey.replace(/[_-]+/g, ' ') : 'Plan usage'}</Text>
          </View>
          <View style={styles.billingUsageAction}><ArrowUpRight color={textColor} size={17} /></View>
        </View>

        <View style={styles.usageSummary}>
          <View style={styles.usageSummaryLine}>
            <View>
              <Text style={[styles.usageSummaryLabel, { color: mutedColor }]}>Conversations this cycle</Text>
              <Text style={[styles.usageSummaryPercent, { color: textColor }]}>{loading || !usage ? '—' : `${conversationPercent}%`}</Text>
            </View>
            <Text style={[styles.usageSummaryDetail, { color: mutedColor }]}>{loading || !usage ? 'Loading usage' : `${formatNumber(conversationCount)} / ${conversationLimit == null ? '∞' : formatNumber(conversationLimit)} conversations`}</Text>
          </View>
          <View style={styles.usageSummaryTrack}><View style={[styles.usageSummaryFill, { width: `${mainUsagePercent}%` }]} /></View>
        </View>

        <View style={styles.usageRingsRow}>
        {usageBreakdown.map(({ label, count, limit, Icon }, index) => {
          const percent = percentages[index];
          const circumference = 2 * Math.PI * 18;
          return (
            <View key={label} style={styles.usageRingItem}>
              <View style={styles.usageRing}>
                <Svg width={58} height={58} viewBox="0 0 58 58">
                  <Circle cx="29" cy="29" r="18" fill="none" stroke="rgba(255,255,255,0.24)" strokeWidth="5" />
                  <Circle cx="29" cy="29" r="18" fill="none" stroke="#ffffff" strokeWidth="5" strokeDasharray={`${circumference * percent / 100} ${circumference}`} strokeLinecap="round" rotation="-90" origin="29, 29" />
                </Svg>
                <View style={styles.usageRingCenter}><Text style={[styles.usageRingPercent, { color: textColor }]}>{loading || !usage ? '—' : `${percent}%`}</Text></View>
              </View>
              <View style={styles.usageRingLabelRow}><Icon color={textColor} size={12} /><Text style={[styles.usageRingLabel, { color: textColor }]} numberOfLines={1}>{label}</Text></View>
              <Text style={[styles.usageRingDetail, { color: mutedColor }]} numberOfLines={1}>{loading || !usage ? '—' : `${formatNumber(count)} / ${limit == null ? '∞' : formatNumber(limit)}`}</Text>
            </View>
          );
        })}
        </View>
        <Text style={[styles.billingUsageFooter, { color: textColor }]}>View billing details</Text>
      </LinearGradient>
    </Pressable>
  );
}

function MetricCarousel({
  title,
  subtitle,
  metrics,
  colors,
  isDark,
}: {
  title: string;
  subtitle?: string;
  metrics: Array<{
    label: string;
    value: string;
    note: string;
    color: string;
    colors: [string, string];
    Icon: typeof MessageSquareText;
    delta: { label: string | null; positive: boolean } | null;
  }>;
  colors: ThemeColors;
  isDark: boolean;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.max(windowWidth - 32, 280);

  return (
    <CarouselSection title={title} subtitle={subtitle} colors={colors}>
      <MetricStack itemCount={metrics.length}>
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} width={cardWidth} isDark={isDark} />
        ))}
      </MetricStack>
    </CarouselSection>
  );
}

export function DashboardScreen() {
  const { colors, isDark } = useTheme();
  const { session } = useAuth();
  const navigation = useNavigation<NavigationProp<MainTabParamList>>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const { canManage, workspace } = useWorkspaceAccess();
  const workspaceId = workspace?.id ?? workspaceIdFromAccessToken();
  const { width: windowWidth } = useWindowDimensions();
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const range = useMemo(() => resolveRange(preset), [preset]);
  const query = useMemo(() => ({ from: toUtcIso(range.from), to: toUtcIso(range.to), search: search.trim() || undefined }), [range, search]);
  const dashboard = useQuery({
    queryKey: ['dashboard', query],
    queryFn: () => fetchDashboard(query),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: pollingWhileUnlocked(() => (isFocused ? 30_000 : false)),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: () => !isBillingLocked(),
    placeholderData: keepPreviousData,
  });
  const usage = useQuery({
    queryKey: ['billing-usage', workspaceId],
    queryFn: () => fetchWorkspaceUsage(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });

  // Silent refresh when returning to the tab — only if cached data is stale.
  useFocusEffect(
    useCallback(() => {
      if (isBillingLocked()) return;
      void queryClient.refetchQueries({ queryKey: ['dashboard', query], stale: true });
    }, [queryClient, query]),
  );

  const refetchDashboard = dashboard.refetch;

  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await refetchDashboard();
    } finally {
      setPullRefreshing(false);
    }
  }, [refetchDashboard]);

  const rangeLabel = formatDateRangeLabel(range.from, range.to);

  const summary = dashboard.data?.summary;
  const trends = useMemo(() => dashboard.data?.trends.conversationVolume ?? [], [dashboard.data?.trends.conversationVolume]);
  const snapshot = useMemo(() => getTrendSnapshot(trends), [trends]);
  const mix = dashboard.data?.channelMix ?? [];
  const channelsCount = dashboard.data?.channelHealth?.length ?? mix.length;
  const teamMembers = dashboard.data?.teamCommandCenter?.summary.totalMembers ?? dashboard.data?.agentPerformance?.length ?? 0;

  const metrics = useMemo(() => {
    const totalCmp = compareValues(snapshot.total.previous, snapshot.total.current, true);
    const respCmp = compareValues(snapshot.response.previous, snapshot.response.current, false);
    const rateCmp = compareValues(snapshot.rate.previous, snapshot.rate.current, true);
    return [
      { label: 'Conversations', value: formatNumber(summary?.totalConversations), note: 'vs prior period', color: isDark ? '#d9f99d' : '#3f6212', colors: isDark ? darkGradient(['#ecfccb', '#a3e635']) : ['#ecfccb', '#a3e635'] as [string, string], Icon: MessageSquareText, delta: totalCmp },
      { label: 'Unique contacts', value: formatNumber(summary?.uniqueContactsCreated), note: 'in range', color: isDark ? '#fdba74' : '#9a3412', colors: isDark ? darkGradient(['#ffedd5', '#fb923c']) : ['#ffedd5', '#fb923c'] as [string, string], Icon: Users, delta: null },
      ...(canManage
        ? [{ label: 'Unassigned', value: formatNumber(summary?.unassignedConversations), note: 'needs owner', color: isDark ? '#7dd3fc' : '#075985', colors: isDark ? darkGradient(['#e0f2fe', '#38bdf8']) : ['#e0f2fe', '#38bdf8'] as [string, string], Icon: Inbox, delta: null }]
        : []),
      { label: 'Assigned', value: formatNumber(summary?.assignedConversations), note: 'with agents', color: isDark ? '#86efac' : '#166534', colors: isDark ? darkGradient(['#dcfce7', '#4ade80']) : ['#dcfce7', '#4ade80'] as [string, string], Icon: UserCheck, delta: null },
      { label: 'First response', value: formatDuration(summary?.avgFirstResponseMinutes ?? null), note: 'vs prior period', color: isDark ? '#fca5a5' : '#991b1b', colors: isDark ? darkGradient(['#fee2e2', '#f87171']) : ['#fee2e2', '#f87171'] as [string, string], Icon: Clock3, delta: respCmp },
      { label: 'Resolution rate', value: `${(summary?.resolutionRate ?? 0).toFixed(1)}%`, note: 'vs prior period', color: isDark ? '#6ee7b7' : '#065f46', colors: isDark ? darkGradient(['#d1fae5', '#34d399']) : ['#d1fae5', '#34d399'] as [string, string], Icon: Percent, delta: rateCmp },
    ];
  }, [summary, snapshot, isDark, canManage]);

  const overview = [
    { label: 'Conversations', value: formatNumber(summary?.totalConversations), note: 'Total in selected range', colors: isDark ? darkGradient(['#1d4ed8', '#60a5fa']) : ['#1d4ed8', '#60a5fa'] as [string, string], Icon: MessageSquareText },
    ...(canManage
      ? [
        { label: 'Channels', value: formatNumber(channelsCount), note: 'Connected in workspace', colors: isDark ? darkGradient(['#0f766e', '#2dd4bf']) : ['#0f766e', '#2dd4bf'] as [string, string], Icon: Wifi },
        { label: 'Team', value: formatNumber(teamMembers), note: 'Agents in command center', colors: isDark ? darkGradient(['#7c3aed', '#c4b5fd']) : ['#7c3aed', '#c4b5fd'] as [string, string], Icon: Users },
      ]
      : []),
  ];

  const applySearch = () => setSearch(searchInput.trim());
  const glanceWidth = Math.max(windowWidth - 32, 280);
  const introGradient: [string, string, string] = isDark
    ? [mixHex(colors.primary, colors.background, 0.76), mixHex(colors.primary, colors.background, 0.86), colors.background]
    : [mixHex(colors.primary, '#ffffff', 0.9), mixHex(colors.primary, '#ffffff', 0.84), mixHex(colors.primary, '#ffffff', 0.78)];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} tintColor={colors.primary} />}
      >
        <LinearGradient
          colors={introGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.dashboardIntro, { paddingTop: insets.top + 12 }]}
        >
          <View pointerEvents="none" style={styles.introPatternLarge} />
          <View pointerEvents="none" style={styles.introPatternSmall} />
          <View style={styles.dashboardHeaderIdentity}>
            <View style={styles.greetingCopy}>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>Hello,</Text>
              <Text style={[styles.greetingName, { color: colors.text }]} numberOfLines={1}>{session?.user.name?.trim() || 'Welcome back'}!</Text>
            </View>
            <View style={styles.headerActions}>
              <NotificationBell onOpen={() => setNotificationsOpen(true)} />
              <View style={[styles.headerAvatar, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
                <ColorfulAvatar name={session?.user.name ?? session?.user.email ?? 'You'} size={40} url={session?.user.avatarUrl ?? null} />
              </View>
            </View>
          </View>
          <Text style={[styles.heroDate, { color: colors.textMuted }]} numberOfLines={1}>{rangeLabel}</Text>
          <View style={[styles.headerSearch, {
            backgroundColor: isDark ? colors.surface : 'rgba(255,255,255,0.78)',
            borderColor: isDark ? colors.cardBorder : 'rgba(255,255,255,0.9)',
          }]}>
            <Search color={colors.textMuted} size={17} />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={applySearch}
              returnKeyType="search"
              placeholder={canManage ? 'Search agents, channels…' : 'Search conversations…'}
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
            />
            {searchInput ? (
              <Pressable onPress={() => { setSearchInput(''); setSearch(''); }} hitSlop={8}>
                <Text style={[styles.clearSearch, { color: colors.primary }]}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.periodRow}>
            <View style={styles.periodCopy}>
              <Text style={[styles.periodTitle, { color: colors.text }]}>Period</Text>
              <Text style={[styles.periodSubtitle, { color: colors.textMuted }]}>Choose a range</Text>
            </View>
            <RangeSegment value={preset} onChange={setPreset} colors={colors} />
          </View>
        </LinearGradient>

        {dashboard.isLoading && !dashboard.data ? (
          <DashboardSkeleton />
        ) : dashboard.isError ? (
          <View style={[styles.errorBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.errorTitle, { color: colors.text }]}>Dashboard offline</Text>
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>{dashboard.error instanceof Error ? dashboard.error.message : 'Unable to load live metrics.'}</Text>
            <AppButton icon={RefreshCw} label="Try again" onPress={() => { void dashboard.refetch(); }} style={styles.retryBtn} />
          </View>
        ) : (
          <>
            <CarouselSection title="At a glance" colors={colors}>
              <MetricStack itemCount={overview.length}>
                {overview.map((item) => {
                  const Icon = item.Icon;
                  return (
                    <UberCard
                      key={item.label}
                      width={glanceWidth}
                      colors={item.colors}
                      isDark={isDark}
                      icon={<Icon color={isDark ? colors.text : '#fff'} size={20} strokeWidth={2.2} />}
                      value={item.value}
                      title={item.label}
                      subtitle={item.note}
                    />
                  );
                })}
              </MetricStack>
            </CarouselSection>

            <MetricCarousel title="Key metrics" metrics={metrics} colors={colors} isDark={isDark} />

            <View style={styles.usageSection}>
              <View style={styles.usageSectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Current usage</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Your billing cycle at a glance</Text>
              </View>
              <BillingUsageCard
                usage={usage.data}
                loading={usage.isLoading}
                onPress={() => navigation.navigate('Settings', { screen: 'Billing', params: { tab: 'current' } })}
                isDark={isDark}
              />
            </View>

            <Section title="Channel mix" colors={colors}>
              <ChannelMix mix={mix} colors={colors} />
            </Section>
            {canManage ? (
              <>
                <TeamCommandCenter data={dashboard.data} colors={colors} isDark={isDark} />
                <LiveChannelStatus data={dashboard.data} colors={colors} />
              </>
            ) : null}

            <Text style={[styles.footerNote, { color: colors.textMuted }]}>Scoped to the current workspace. Search and date range update every section.</Text>
          </>
        )}
      </ScrollView>

      <NotificationCenter visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: spacing.xl },
  dashboardIntro: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
  },
  introPatternLarge: {
    borderColor: 'rgba(255,255,255,0.48)',
    borderRadius: 140,
    borderWidth: 1,
    height: 280,
    position: 'absolute',
    right: -74,
    top: -112,
    width: 280,
  },
  introPatternSmall: {
    borderColor: 'rgba(255,255,255,0.38)',
    borderRadius: 90,
    borderWidth: 1,
    height: 180,
    position: 'absolute',
    right: -25,
    top: -62,
    width: 180,
  },
  dashboardHeaderIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  greetingCopy: { flex: 1, minWidth: 0, paddingRight: spacing.md },
  greeting: { fontSize: fontSize.body, fontWeight: fontWeight.medium },
  greetingName: { fontSize: 22, fontWeight: fontWeight.extrabold, letterSpacing: -0.4, marginTop: 1 },
  heroDate: { fontSize: 11, marginTop: -spacing.sm },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  headerAvatar: { borderRadius: 24, borderWidth: 1, padding: 2 },
  periodRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  periodCopy: { minWidth: 78 },
  periodTitle: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  periodSubtitle: { fontSize: 10, marginTop: 2 },
  headerSearch: {
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    height: 44,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.body,
    height: 44,
    marginLeft: spacing.sm,
  },
  clearSearch: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 4,
  },
  rangeChipRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  rangeChip: {
    alignItems: 'center',
    borderRadius: radius.md,
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: spacing.sm + 2,
  },
  rangeChipText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
  },

  section: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm + 2, marginBottom: spacing.md + 2 },
  sectionHeaderCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  sectionSubtitle: { fontSize: 12, lineHeight: 16, marginTop: 3 },
  usageSection: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  usageSectionHeader: { marginBottom: spacing.md + 2 },

  carouselSection: {
    marginTop: 22,
  },
  carouselHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  carouselHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  carouselTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  carouselSubtitle: {
    fontSize: 13,
    marginTop: 3,
  },
  metricDeck: {
    height: 220,
    marginHorizontal: 16,
  },
  metricDeckCard: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  metricDeckSingleBack: {
    borderRadius: 22,
    borderWidth: 1,
    height: 168,
    left: 8,
    position: 'absolute',
    right: 8,
  },
  metricDeckSingleBackNear: {
    top: 9,
    zIndex: 2,
  },
  metricDeckSingleBackFar: {
    top: 18,
    zIndex: 1,
  },
  metricDeckFooter: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 4,
    position: 'absolute',
    right: 4,
  },
  metricDeckDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  metricDeckDot: {
    backgroundColor: '#94a3b8',
    borderRadius: 3,
    height: 5,
    opacity: 0.45,
    width: 5,
  },
  metricDeckDotActive: {
    backgroundColor: '#2563eb',
    opacity: 1,
    width: 16,
  },
  metricDeckHint: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  carouselEmpty: {
    marginHorizontal: 16,
    paddingVertical: 20,
  },
  uberCard: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  uberPoster: {
    borderRadius: 22,
    height: 168,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  uberHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  uberHeaderRight: {
    alignItems: 'flex-end',
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  uberFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  uberFooterCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  uberOrb: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    position: 'absolute',
  },
  uberOrbA: {
    height: 130,
    right: -36,
    top: -44,
    width: 130,
  },
  uberOrbB: {
    bottom: -42,
    height: 110,
    left: -34,
    width: 110,
  },
  posterIconChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  posterIconChipDark: {
    alignItems: 'center',
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 40,
  },
  posterIconChipSoft: {
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  uberBadgeDark: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  uberBadgeLight: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  posterHeroLight: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 32,
    textAlign: 'right',
  },
  posterHeroDark: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 32,
    textAlign: 'right',
  },
  uberCardTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  uberCardTitleLight: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  uberCardSubtitle: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 16,
  },
  uberCardSubtitleLight: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    lineHeight: 16,
  },
  uberDelta: {
    fontSize: 12,
    fontWeight: '700',
  },
  deltaPositive: { color: '#059669' },
  deltaNegative: { color: '#dc2626' },
  deltaPositiveDark: { color: '#4ade80' },
  deltaNegativeDark: { color: '#fca5a5' },

  billingUsageCard: { borderRadius: radius.xl, gap: spacing.sm + 2, overflow: 'hidden', padding: spacing.md + 2 },
  usageGlowLarge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 120, height: 240, position: 'absolute', right: -95, top: -150, width: 240 },
  billingUsageHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  billingUsageHeaderCopy: { flex: 1, minWidth: 0 },
  billingUsageEyebrow: { fontSize: fontSize.tiny, fontWeight: fontWeight.bold, letterSpacing: 0.8 },
  billingUsageTitle: { fontSize: fontSize.body, fontWeight: fontWeight.bold, marginTop: 1, textTransform: 'capitalize' },
  billingUsageIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.md, height: 30, justifyContent: 'center', width: 30 },
  billingUsageAction: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.pill, height: 28, justifyContent: 'center', width: 28 },
  usageSummary: { gap: spacing.xs, paddingHorizontal: spacing.xs },
  usageSummaryLine: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  usageSummaryLabel: { fontSize: fontSize.tiny, fontWeight: fontWeight.semibold },
  usageSummaryPercent: { fontSize: 25, fontWeight: fontWeight.extrabold, lineHeight: 28 },
  usageSummaryDetail: { fontSize: fontSize.tiny, fontWeight: fontWeight.medium, marginBottom: 3, maxWidth: '48%', textAlign: 'right' },
  usageSummaryTrack: { backgroundColor: 'rgba(255,255,255,0.32)', borderRadius: radius.pill, height: 6, overflow: 'hidden' },
  usageSummaryFill: { backgroundColor: '#ffffff', borderRadius: radius.pill, height: '100%' },
  usageRingsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  usageRingItem: { alignItems: 'center', flex: 1, gap: 2, minWidth: 0 },
  usageRing: { alignItems: 'center', height: 58, justifyContent: 'center', width: 58 },
  usageRingCenter: { alignItems: 'center', justifyContent: 'center', position: 'absolute' },
  usageRingPercent: { fontSize: fontSize.tiny, fontWeight: fontWeight.extrabold },
  usageRingLabelRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  usageRingLabel: { fontSize: fontSize.tiny, fontWeight: fontWeight.semibold },
  usageRingDetail: { fontSize: 9, fontWeight: fontWeight.medium },
  billingUsageFooter: { alignSelf: 'flex-end', fontSize: fontSize.tiny, fontWeight: fontWeight.semibold, marginTop: -spacing.xs },

  mixLayout: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  donut: { alignItems: 'center', height: 120, justifyContent: 'center', position: 'relative', width: 120 },
  donutCenter: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  donutValue: { fontSize: 22, fontWeight: '800' },
  donutLabel: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  mixList: { flex: 1, gap: 8, minWidth: 0 },
  channelRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  channelName: { flex: 1, fontSize: 13, fontWeight: '600' },
  channelPercent: { fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'right' },

  livePill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  liveDot: { backgroundColor: '#22c55e', borderRadius: 4, height: 7, width: 7 },
  livePillText: { fontSize: 11, fontWeight: '700' },
  statusTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  statusTabChip: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextActive: { color: '#fff' },
  statusCount: { borderRadius: 999, minWidth: 20, paddingHorizontal: 6, paddingVertical: 1 },
  statusCountActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  statusCountText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  statusCountTextActive: { color: '#fff' },
  statusActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },

  memberList: { gap: 12 },
  memberCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.035,
    shadowRadius: 8,
    elevation: 1,
  },
  memberOffline: { opacity: 0.72 },
  memberTop: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  memberAvatarWrap: { position: 'relative' },
  memberAvatar: { alignItems: 'center', borderRadius: 23, height: 46, justifyContent: 'center', width: 46 },
  memberInitials: { fontSize: 13, fontWeight: '700' },
  presenceDot: { borderRadius: 6, borderWidth: 2, bottom: -1, height: 12, position: 'absolute', right: -1, width: 12 },
  memberIdentity: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 14, fontWeight: '700' },
  memberActivity: { fontSize: 12, marginTop: 2 },
  presenceBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  presenceBadgeText: { fontSize: 11, fontWeight: '700' },
  memberMetrics: { flexDirection: 'row', gap: 8, marginTop: 14 },
  memberMetricTile: { alignItems: 'center', borderRadius: 12, flex: 1, minWidth: 0, paddingHorizontal: 5, paddingVertical: 8 },
  memberMetricValue: { fontSize: 15, fontWeight: '800' },
  memberMetricLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  memberBottom: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 10 },
  memberProgressWrap: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, minWidth: 0 },
  memberProgressTrack: { borderRadius: 999, flex: 1, height: 5, overflow: 'hidden' },
  memberProgressFill: { borderRadius: 999, height: '100%' },
  memberProgressPct: { fontSize: 12, fontWeight: '700', minWidth: 34, textAlign: 'right' },
  responseChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  responseChipText: { fontSize: 12, fontWeight: '700' },

  liveList: { marginTop: -4 },
  liveRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  liveCopy: { flex: 1, minWidth: 0 },
  liveName: { fontSize: 14, fontWeight: '700' },
  liveStatusLine: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 3 },
  toneDot: { borderRadius: 4, height: 7, width: 7 },
  liveStatus: { flex: 1, fontSize: 12 },
  liveCountChip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  liveCount: { fontSize: 14, fontWeight: '800' },
  loadMore: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  loadMoreText: { fontSize: 13, fontWeight: '700' },

  errorBox: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 24,
  },
  errorTitle: { fontSize: 17, fontWeight: '800' },
  errorText: { fontSize: 13, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  retryBtn: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyBox: {
    alignItems: 'center',
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 20,
  },
  emptyText: { fontSize: 13, textAlign: 'center' },
  footerNote: { fontSize: 11, lineHeight: 16, paddingHorizontal: 24, paddingTop: 16, textAlign: 'center' },
});
