import {
  Clock3,
  ArrowUpRight,
  Inbox,
  MessageSquareText,
  UserCheck,
  Wifi,
} from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import type { DashboardChannelHealthItem, DashboardResponse, DashboardTeamCommandCenterMember, DashboardTrendPoint } from '../api/dashboard';
import type { WorkspaceUsage } from '../api/billing';
import { channelBrandColor, ChannelLogo } from './ChannelLogo';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { AppCard } from '../ui';
import { styles } from './DashboardStyles';

export type RangePreset = 'today' | '7d' | '30d';
type PresenceFilter = 'all' | 'online' | 'offline';

const RANGE_LABELS: Record<RangePreset, string> = { today: 'Today', '7d': '7 Days', '30d': '30 Days' };
const INITIAL_VISIBLE_CHANNELS = 6;
const TONE_COLORS: Record<string, string> = { healthy: '#22c55e', degraded: '#f59e0b', warning: '#ef4444', offline: '#94a3b8' };
export const EMPTY_CHANNEL_MIX: DashboardResponse['channelMix'] = [];

export function mixHex(hex: string, target: string, amount: number) {
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
export function darkGradient(light: [string, string]): [string, string] {
  return [mixHex(light[0], '#0f172a', 0.6), mixHex(light[1], '#0f172a', 0.6)];
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function resolveRange(preset: RangePreset) {
  const now = new Date();
  const from = startOfDay(now);
  if (preset === '7d') from.setDate(from.getDate() - 6);
  if (preset === '30d') from.setDate(from.getDate() - 29);
  return { from, to: now };
}

export function toUtcIso(value: Date) {
  const pad = (part: number, length = 2) => String(part).padStart(length, '0');
  return [
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`,
    `.${pad(value.getMilliseconds(), 3)}`,
    'Z',
  ].join('');
}

export function formatDateRangeLabel(from: Date, to: Date) {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const left = new Intl.DateTimeFormat(undefined, options).format(from);
  const right = new Intl.DateTimeFormat(undefined, options).format(to);
  return `${left} – ${right}, ${to.getFullYear()}`;
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined).format(value ?? 0);
}

export function formatDuration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  const totalSeconds = Math.max(0, Math.round(minutes * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  return `${secs}s`;
}

export function compareValues(previous: number | null | undefined, current: number | null | undefined, higherIsBetter = true) {
  if (previous === null || previous === undefined || current === null || current === undefined) return { label: null, positive: true };
  if (previous === 0) return { label: null, positive: true };
  const deltaPercent = ((current - previous) / previous) * 100;
  return { label: `${deltaPercent >= 0 ? '+' : '−'}${Math.abs(deltaPercent).toFixed(1)}%`, positive: higherIsBetter ? current >= previous : current <= previous };
}

export function getTrendSnapshot(trends: DashboardTrendPoint[]) {
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

export function RangeSegment({ value, onChange, colors }: { value: RangePreset; onChange: (next: RangePreset) => void; colors: ThemeColors }) {
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

export function Section({ title, subtitle, action, children, colors }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; colors: ThemeColors }) {
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

export function CarouselSection({
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

export function MetricStack({ children, itemCount }: { children: ReactNode[]; itemCount: number }) {
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

export function UberCard({
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

function ChannelMixComponent({ mix, colors }: { mix: DashboardResponse['channelMix']; colors: ThemeColors }) {
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

export const ChannelMix = memo(ChannelMixComponent);

function TeamCommandCenterComponent({ data, colors, isDark }: { data: DashboardResponse | undefined; colors: ThemeColors; isDark: boolean }) {
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

export const TeamCommandCenter = memo(TeamCommandCenterComponent);

function LiveChannelStatusComponent({ data, colors }: { data: DashboardResponse | undefined; colors: ThemeColors }) {
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

export const LiveChannelStatus = memo(LiveChannelStatusComponent);

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

export function BillingUsageCard({
  usage,
  loading,
  onPress,
  colors,
  isDark,
}: {
  usage?: WorkspaceUsage;
  loading: boolean;
  onPress: () => void;
  colors: ThemeColors;
  isDark: boolean;
}) {
  const conversationCount = usage?.conversationCount;
  const conversationLimit = usage?.conversationLimit;
  const conversationPercent = conversationLimit != null && conversationLimit > 0 && conversationCount != null
    ? Math.min(100, Math.round(conversationCount / conversationLimit * 100))
    : 0;
  const usageBreakdown = [
    { label: 'Conversations', count: usage?.conversationCount, limit: usage?.conversationLimit, color: colors.primary, softColor: colors.primarySoft },
    { label: 'Team members', count: usage?.seatCount, limit: usage?.seatLimit, color: colors.indigo, softColor: colors.indigoSoft },
    { label: 'Channels', count: usage?.channelCount, limit: usage?.channelLimit, color: colors.success, softColor: colors.successSoft },
  ];
  const circumference = 2 * Math.PI * 23;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open billing and plan usage">
      <View style={[styles.billingUsageCard, { backgroundColor: isDark ? colors.primarySoft : mixHex(colors.primary, colors.surface, 0.88), borderColor: colors.primaryBorder }]}>
        <View style={styles.usageHero}>
          <View style={styles.usageHeroCopy}>
            <Text style={[styles.usageSummaryLabel, { color: colors.textSecondary }]}>Conversations this cycle</Text>
            <View style={styles.usageHeroValueRow}>
              <Text style={[styles.usageHeroValue, { color: colors.text }]}>{loading || !usage ? '—' : formatNumber(conversationCount)}</Text>
              <Text style={[styles.usageHeroLimit, { color: colors.textMuted }]}> / {loading || !usage ? '—' : conversationLimit == null ? '∞' : formatNumber(conversationLimit)}</Text>
            </View>
          </View>
          <View style={styles.usageHeroRing}>
            <Svg width={58} height={58} viewBox="0 0 58 58">
              <Circle cx="29" cy="29" r="23" fill="none" stroke={colors.surfaceSecondary} strokeWidth="5" />
              <Circle cx="29" cy="29" r="23" fill="none" stroke={colors.text} strokeWidth="5" strokeDasharray={`${circumference * conversationPercent / 100} ${circumference}`} strokeLinecap="round" rotation="-90" origin="29, 29" />
            </Svg>
            <View style={styles.usageHeroRingCenter}><Text style={[styles.usageHeroPercent, { color: colors.text }]}>{loading || !usage ? '—' : `${conversationPercent}%`}</Text></View>
          </View>
        </View>
        <View style={[styles.usageDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.usageRingsRow}>
        {usageBreakdown.map(({ label, count, limit, color, softColor }) => {
          const percent = limit != null && limit > 0 && count != null ? Math.min(100, Math.round(count / limit * 100)) : 0;
          return (
            <View key={label} style={[styles.usageRingItem, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.usageBreakdownValue, { color: colors.text }]} numberOfLines={1}>{loading || !usage ? '—' : formatNumber(count)}</Text>
              <Text style={[styles.usageRingLabel, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
              <View style={styles.usageRing}>
                <Svg width={38} height={38} viewBox="0 0 38 38">
                  <Circle cx="19" cy="19" r="15" fill="none" stroke={softColor} strokeWidth="4" />
                  <Circle cx="19" cy="19" r="15" fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${2 * Math.PI * 15 * percent / 100} ${2 * Math.PI * 15}`} strokeLinecap="round" rotation="-90" origin="19, 19" />
                </Svg>
                <View style={styles.usageRingCenter}><Text style={[styles.usageRingPercent, { color: colors.textSecondary }]}>{loading || !usage ? '—' : `${percent}%`}</Text></View>
              </View>
              <Text style={[styles.usageRingDetail, { color: colors.textMuted }]} numberOfLines={1}>{loading || !usage ? 'Loading' : `${limit == null ? 'No limit' : `${formatNumber(Math.max(0, limit - (count ?? 0)))} left`}`}</Text>
            </View>
          );
        })}
        </View>
        <View style={styles.billingUsageFooter}><Text style={[styles.billingUsageFooterText, { color: colors.primary }]}>View billing details</Text><ArrowUpRight color={colors.primary} size={14} /></View>
      </View>
    </Pressable>
  );
}

export function MetricCarousel({
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

export { styles };
