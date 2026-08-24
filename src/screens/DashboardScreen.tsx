import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock3,
  Inbox,
  MessageSquareText,
  Percent,
  RefreshCw,
  Search,
  TrendingUp,
  UserCheck,
  Users,
  Wifi,
} from 'lucide-react-native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { fetchDashboard, type DashboardChannelHealthItem, type DashboardResponse, type DashboardTeamCommandCenterMember, type DashboardTrendPoint } from '../api/dashboard';
import { channelBrandColor, ChannelLogo } from '../components/ChannelLogo';
import { NotificationBell, NotificationCenter } from '../components/NotificationCenter';
import { DashboardSkeleton } from '../components/Skeleton';
import { useWorkspaceAccess } from '../lib/workspace-access';
import { isBillingLocked, pollingWhileUnlocked } from '../lib/billing-lock';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

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

function getNiceAxisMax(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  if (normalized <= 1) return 1 * magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] ?? current;
    const afterNext = points[index + 2] ?? next;
    const c1x = current.x + (next.x - previous.x) / 6;
    const c1y = current.y + (next.y - previous.y) / 6;
    const c2x = next.x - (afterNext.x - current.x) / 6;
    const c2y = next.y - (afterNext.y - current.y) / 6;
    path += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${next.x} ${next.y}`;
  }
  return path;
}

function buildAreaPath(points: Array<{ x: number; y: number }>, baseline: number) {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${buildSmoothPath(points)} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
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
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function VolumeChart({ trends, width, colors }: { trends: DashboardTrendPoint[]; width: number; colors: ThemeColors }) {
  const chart = useMemo(() => {
    const height = 160;
    const pad = { top: 12, right: 4, bottom: 8, left: 4 };
    const chartW = Math.max(width - pad.left - pad.right, 1);
    const chartH = height - pad.top - pad.bottom;
    const points = trends ?? [];
    const max = Math.max(1, ...points.flatMap((p) => [p.incoming, p.resolved]));
    const axisMax = getNiceAxisMax(max);
    const scaleY = (v: number) => pad.top + chartH - (v / axisMax) * chartH;
    const scaleX = (i: number) => pad.left + (i * chartW) / Math.max(points.length - 1, 1);
    const series = points.map((p, i) => ({ x: scaleX(i), incoming: scaleY(p.incoming), resolved: scaleY(p.resolved) }));
    const baseline = pad.top + chartH;
    return {
      series,
      incomingPath: buildSmoothPath(series.map((s) => ({ x: s.x, y: s.incoming }))),
      resolvedPath: buildSmoothPath(series.map((s) => ({ x: s.x, y: s.resolved }))),
      incomingArea: buildAreaPath(series.map((s) => ({ x: s.x, y: s.incoming })), baseline),
      tickLines: [0, axisMax / 2, axisMax].map((t) => ({ y: pad.top + chartH - (t / axisMax) * chartH, value: t })),
      pad,
      width,
      height,
    };
  }, [trends, width]);

  if (!chart.series.length) {
    return (
      <View style={[styles.emptyBox, { borderColor: colors.cardBorder }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No conversation volume in this range.</Text>
      </View>
    );
  }

  return (
    <View style={styles.chartWrap}>
      <Svg height={chart.height} viewBox={`0 0 ${chart.width} ${chart.height}`} width={chart.width}>
        {chart.tickLines.map((line) => (
          <Path key={line.value} d={`M ${chart.pad.left} ${line.y} L ${chart.width - chart.pad.right} ${line.y}`} stroke={colors.cardBorder} strokeDasharray="4 6" />
        ))}
        <Path d={chart.incomingArea} fill={colors.primary} opacity={0.15} />
        <Path d={chart.incomingPath} fill="none" stroke={colors.primary} strokeWidth={2.25} strokeLinecap="round" />
        <Path d={chart.resolvedPath} fill="none" stroke="#10b981" strokeWidth={2.25} strokeLinecap="round" />
      </Svg>
    </View>
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

function HScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      decelerationRate="normal"
      contentContainerStyle={styles.carouselContent}
    >
      {children}
    </ScrollView>
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
  const statWidth = Math.min(220, Math.max(188, windowWidth * 0.55));
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

        <HScroll>
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
        </HScroll>
      </CarouselSection>

      <Section title="Your agents" subtitle={filter === 'all' ? 'Sorted by assigned load' : `${filter} agents`} colors={colors}>
        <View style={styles.memberList}>
          {list.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No agents in this state.</Text>
          ) : list.map((row) => (
            <View style={[styles.memberCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }, row.status === 'offline' && styles.memberOffline]} key={row.key}>
              <View style={styles.memberTop}>
                <View style={styles.memberAvatarWrap}>
                  <View style={[styles.memberAvatar, { backgroundColor: isDark ? colors.surfaceSecondary : '#eef4ff' }]}><Text style={[styles.memberInitials, { color: colors.primary }]}>{row.initials}</Text></View>
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
                <Text style={[styles.memberMetric, { color: colors.textSecondary }]}><Text style={[styles.memberMetricStrong, { color: colors.text }]}>{formatNumber(row.replied)}</Text> replied</Text>
                <Text style={[styles.memberMetricDot, { color: colors.textMuted }]}>·</Text>
                <Text style={[styles.memberMetric, { color: colors.textSecondary }]}><Text style={[styles.memberMetricBlue, { color: colors.primary }]}>{formatNumber(row.open)}</Text> open</Text>
                <Text style={[styles.memberMetricDot, { color: colors.textMuted }]}>·</Text>
                <Text style={[styles.memberMetric, { color: colors.textSecondary }]}><Text style={[styles.memberMetricStrong, { color: colors.text }]}>{formatNumber(row.assigned)}</Text> assigned</Text>
              </View>

              <View style={styles.memberBottom}>
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
  const cardWidth = Math.min(248, Math.max(210, windowWidth * 0.62));

  return (
    <CarouselSection title={title} subtitle={subtitle} colors={colors}>
      <HScroll>
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} width={cardWidth} isDark={isDark} />
        ))}
      </HScroll>
    </CarouselSection>
  );
}

export function DashboardScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const { canManage } = useWorkspaceAccess();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(windowWidth - 32, 280);
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

  // Silent refresh when returning to the tab — only if cached data is stale.
  useFocusEffect(
    useCallback(() => {
      if (isBillingLocked()) return;
      void queryClient.refetchQueries({ queryKey: ['dashboard', query], stale: true });
    }, [queryClient, query]),
  );

  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await dashboard.refetch();
    } finally {
      setPullRefreshing(false);
    }
  }, [dashboard.refetch]);

  const rangeLabel = formatDateRangeLabel(range.from, range.to);

  const summary = dashboard.data?.summary;
  const trends = dashboard.data?.trends.conversationVolume ?? [];
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
  }, [summary, snapshot, isDark, colors, canManage]);

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
  const glanceWidth = Math.min(220, Math.max(188, windowWidth * 0.55));

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topbar, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.topbarCopy}>
          <Text style={[styles.topTitle, { color: colors.text }]}>Dashboard</Text>
          <Text style={[styles.topDate, { color: colors.textSecondary }]} numberOfLines={1}>{rangeLabel}</Text>
        </View>
        <NotificationBell onOpen={() => setNotificationsOpen(true)} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} tintColor={colors.primary} />}
      >
        <View style={[styles.controlsCard, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={[styles.search, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
            <Search color={colors.textMuted} size={18} />
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
          <RangeSegment value={preset} onChange={setPreset} colors={colors} />
        </View>

        {dashboard.isLoading && !dashboard.data ? (
          <DashboardSkeleton />
        ) : dashboard.isError ? (
          <View style={[styles.errorBox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Text style={[styles.errorTitle, { color: colors.text }]}>Dashboard offline</Text>
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>{dashboard.error instanceof Error ? dashboard.error.message : 'Unable to load live metrics.'}</Text>
            <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => dashboard.refetch()}>
              <RefreshCw color="#fff" size={16} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CarouselSection title="At a glance" colors={colors}>
              <HScroll>
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
              </HScroll>
            </CarouselSection>

            <MetricCarousel title="Key metrics" metrics={metrics} colors={colors} isDark={isDark} />

            <Section
              title="Conversation volume"
              colors={colors}
              action={<TrendingUp color={colors.textSecondary} size={18} />}
            >
              <View style={styles.legend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.primary }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>Incoming</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#10b981' }]} /><Text style={[styles.legendText, { color: colors.textSecondary }]}>Resolved</Text></View>
              </View>
              <VolumeChart trends={trends} width={contentWidth - 32} colors={colors} />
            </Section>

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
  content: { paddingTop: 12 },
  topbar: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  topbarCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  topTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  topDate: { fontSize: 13, marginTop: 2 },

  controlsCard: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: 16,
    padding: 14,
  },
  search: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 44,
    marginLeft: 8,
  },
  clearSearch: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  rangeChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rangeChip: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  rangeChipText: {
    fontSize: 13,
    fontWeight: '700',
  },

  section: {
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
  },
  sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, marginBottom: 14 },
  sectionHeaderCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  sectionSubtitle: { fontSize: 12, lineHeight: 16, marginTop: 3 },

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
  carouselContent: {
    gap: 14,
    paddingHorizontal: 16,
    paddingRight: 32,
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

  legend: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  legendDot: { borderRadius: 4, height: 8, width: 8 },
  legendText: { fontSize: 12, fontWeight: '600' },
  chartWrap: { marginTop: 4 },

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

  memberList: { gap: 10 },
  memberCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  memberOffline: { opacity: 0.72 },
  memberTop: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  memberAvatarWrap: { position: 'relative' },
  memberAvatar: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  memberInitials: { fontSize: 13, fontWeight: '700' },
  presenceDot: { borderRadius: 6, borderWidth: 2, bottom: -1, height: 12, position: 'absolute', right: -1, width: 12 },
  memberIdentity: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 14, fontWeight: '700' },
  memberActivity: { fontSize: 12, marginTop: 2 },
  presenceBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  presenceBadgeText: { fontSize: 11, fontWeight: '700' },
  memberMetrics: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 },
  memberMetric: { fontSize: 12 },
  memberMetricDot: { fontSize: 12 },
  memberMetricStrong: { fontWeight: '700' },
  memberMetricBlue: { fontWeight: '700' },
  memberBottom: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 10 },
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
