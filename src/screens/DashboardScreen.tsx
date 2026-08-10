// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
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
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { fetchDashboard, type DashboardChannelHealthItem, type DashboardResponse, type DashboardTeamCommandCenterMember, type DashboardTrendPoint } from '../api/dashboard';
import { channelBrandColor, ChannelLogo } from '../components/ChannelLogo';
import { NotificationBell, NotificationCenter } from '../components/NotificationCenter';

type RangePreset = 'today' | '7d' | '30d';
type PresenceFilter = 'all' | 'online' | 'offline';

const RANGE_LABELS: Record<RangePreset, string> = { today: 'Today', '7d': '7 Days', '30d': '30 Days' };
const INITIAL_VISIBLE_CHANNELS = 6;
const TONE_COLORS = { healthy: '#22c55e', degraded: '#f59e0b', warning: '#ef4444', offline: '#94a3b8' };

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

function formatNumber(value: number) {
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

function RangeSegment({ value, onChange }: { value: RangePreset; onChange: (next: RangePreset) => void }) {
  return (
    <View style={styles.rangeChipRow}>
      {(['today', '7d', '30d'] as RangePreset[]).map((item) => {
        const active = value === item;
        return (
          <Pressable key={item} style={[styles.rangeChip, active && styles.rangeChipActive]} onPress={() => onChange(item)}>
            <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]} numberOfLines={1}>{RANGE_LABELS[item]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function VolumeChart({ trends, width }: { trends: DashboardTrendPoint[]; width: number }) {
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
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>No conversation volume in this range.</Text>
      </View>
    );
  }

  return (
    <View style={styles.chartWrap}>
      <Svg height={chart.height} viewBox={`0 0 ${chart.width} ${chart.height}`} width={chart.width}>
        {chart.tickLines.map((line) => (
          <Path key={line.value} d={`M ${chart.pad.left} ${line.y} L ${chart.width - chart.pad.right} ${line.y}`} stroke="#e2e8f0" strokeDasharray="4 6" />
        ))}
        <Path d={chart.incomingArea} fill="#dbeafe" opacity={0.7} />
        <Path d={chart.incomingPath} fill="none" stroke="#2563eb" strokeWidth={2.25} strokeLinecap="round" />
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
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.carouselSection}>
      <View style={styles.carouselHeader}>
        <View style={styles.carouselHeaderCopy}>
          <Text style={styles.carouselTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.carouselSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
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
  onDark?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={[styles.uberCard, { width }]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.uberPoster}>
        <View style={[styles.uberOrb, styles.uberOrbA]} />
        <View style={[styles.uberOrb, styles.uberOrbB]} />

        <View style={styles.uberHeader}>
          <View style={onDark ? styles.posterIconChip : [styles.posterIconChipDark, styles.posterIconChipSoft]}>
            {icon}
          </View>
          <View style={styles.uberHeaderRight}>
            {badge ? <View style={onDark ? styles.uberBadgeDark : styles.uberBadgeLight}>{badge}</View> : null}
            <Text
              style={[onDark ? styles.posterHeroLight : styles.posterHeroDark, valueColor ? { color: valueColor } : null]}
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
            <Text style={onDark ? styles.uberCardTitleLight : styles.uberCardTitle} numberOfLines={1}>{title}</Text>
            <Text style={onDark ? styles.uberCardSubtitleLight : styles.uberCardSubtitle} numberOfLines={2}>{subtitle}</Text>
          </View>
          {footerBadge ? (
            <View style={onDark ? styles.uberBadgeDark : styles.uberBadgeLight}>{footerBadge}</View>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

function ChannelMix({ mix }: { mix: DashboardResponse['channelMix'] }) {
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
          {segments.length === 0 ? <Circle cx="60" cy="60" r={R} fill="none" stroke="#eef2f7" strokeWidth={SW} /> : null}
          {segments.map((seg) => {
            const dash = (seg.value / 100) * C;
            const offset = -acc;
            acc += dash;
            return <Circle key={seg.channelType} cx="60" cy="60" r={R} fill="none" stroke={channelBrandColor(seg.channelType)} strokeWidth={SW} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={offset} />;
          })}
        </Svg>
        <View style={styles.donutCenter} pointerEvents="none">
          <Text style={styles.donutValue} numberOfLines={1} adjustsFontSizeToFit>{formatNumber(total)}</Text>
          <Text style={styles.donutLabel}>Total</Text>
        </View>
      </View>
      <View style={styles.mixList}>
        {segments.length === 0 ? (
          <Text style={styles.emptyText}>No channel mix data.</Text>
        ) : segments.map((seg) => (
          <View style={styles.channelRow} key={seg.channelType}>
            <ChannelLogo type={seg.channelType} box={22} glyph={12} radius={7} />
            <Text style={styles.channelName} numberOfLines={1}>{channelLabel(seg.channelType)}</Text>
            <Text style={styles.channelPercent}>{seg.value.toFixed(0)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TeamCommandCenter({ data }: { data: DashboardResponse | undefined }) {
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
    { label: 'Available now', value: `${availableNow}/${totalMembers}`, note: 'Agents ready to take conversations', colors: ['#047857', '#34d399'] as [string, string], Icon: UserCheck },
    { label: 'Assigned load', value: formatNumber(totalAssigned), note: 'Conversations currently with agents', colors: ['#1d4ed8', '#60a5fa'] as [string, string], Icon: Inbox },
    { label: 'Still open', value: formatNumber(totalOpen), note: 'Waiting on a reply from the team', colors: ['#c2410c', '#fb923c'] as [string, string], Icon: MessageSquareText },
    { label: 'Avg response', value: avgResponseLabel, note: `${teamProgress}% team progress · ${formatNumber(totalReplied)} replied`, colors: ['#6d28d9', '#a78bfa'] as [string, string], Icon: Clock3 },
  ];

  return (
    <View>
      <CarouselSection
        title="Team Command Center"
        subtitle={`${availableNow} of ${totalMembers} available`}
        action={(
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>Live</Text>
          </View>
        )}
      >
        <View style={styles.statusTabsRow}>
          {filters.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable key={item.key} style={[styles.statusTabChip, active && styles.statusActive]} onPress={() => setFilter(item.key)}>
                <Text style={[styles.statusText, active && styles.statusTextActive]} numberOfLines={1}>{item.label}</Text>
                <View style={[styles.statusCount, active && styles.statusCountActive]}>
                  <Text style={[styles.statusCountText, active && styles.statusCountTextActive]}>{item.count}</Text>
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
                icon={<Icon color="#fff" size={20} strokeWidth={2.2} />}
                value={stat.value}
                title={stat.label}
                subtitle={stat.note}
              />
            );
          })}
        </HScroll>
      </CarouselSection>

      <Section title="Your agents" subtitle={filter === 'all' ? 'Sorted by assigned load' : `${filter} agents`}>
        <View style={styles.memberList}>
          {list.length === 0 ? (
            <Text style={styles.emptyText}>No agents in this state.</Text>
          ) : list.map((row) => (
            <View style={[styles.memberCard, row.status === 'offline' && styles.memberOffline]} key={row.key}>
              <View style={styles.memberTop}>
                <View style={styles.memberAvatarWrap}>
                  <View style={styles.memberAvatar}><Text style={styles.memberInitials}>{row.initials}</Text></View>
                  <View style={[styles.presenceDot, { backgroundColor: row.status === 'online' ? '#22c55e' : '#94a3b8' }]} />
                </View>
                <View style={styles.memberIdentity}>
                  <Text style={styles.memberName} numberOfLines={1}>{row.name}</Text>
                  <Text style={styles.memberActivity} numberOfLines={1}>{row.activity}</Text>
                </View>
                <View style={[styles.presenceBadge, { backgroundColor: row.status === 'online' ? '#ecfdf5' : '#f1f5f9' }]}>
                  <Text style={[styles.presenceBadgeText, { color: row.status === 'online' ? '#059669' : '#64748b' }]}>
                    {row.status === 'online' ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>

              <View style={styles.memberMetrics}>
                <Text style={styles.memberMetric}><Text style={styles.memberMetricStrong}>{formatNumber(row.replied)}</Text> replied</Text>
                <Text style={styles.memberMetricDot}>·</Text>
                <Text style={styles.memberMetric}><Text style={styles.memberMetricBlue}>{formatNumber(row.open)}</Text> open</Text>
                <Text style={styles.memberMetricDot}>·</Text>
                <Text style={styles.memberMetric}><Text style={styles.memberMetricStrong}>{formatNumber(row.assigned)}</Text> assigned</Text>
              </View>

              <View style={styles.memberBottom}>
                <View style={styles.memberProgressWrap}>
                  <View style={styles.memberProgressTrack}>
                    <View style={[styles.memberProgressFill, { width: `${Math.min(Math.max(row.progress, 0), 100)}%`, backgroundColor: row.status === 'online' ? '#10b981' : '#94a3b8' }]} />
                  </View>
                  <Text style={styles.memberProgressPct}>{row.progress}%</Text>
                </View>
                <View style={styles.responseChip}>
                  <Text style={styles.responseChipText} numberOfLines={1}>{row.responseLabel}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </Section>
    </View>
  );
}

function LiveChannelStatus({ data }: { data: DashboardResponse | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const statuses = useMemo(() => deriveChannelStatuses(data?.channelHealth ?? []).sort((a, b) => b.messagesInRange - a.messagesInRange), [data?.channelHealth]);
  const visible = expanded ? statuses : statuses.slice(0, INITIAL_VISIBLE_CHANNELS);
  const remaining = Math.max(statuses.length - INITIAL_VISIBLE_CHANNELS, 0);

  return (
    <Section
      title="Live Channel Status"
      subtitle="Connection health & volume"
      action={<Wifi color="#2563eb" size={18} />}
    >
      {statuses.length > 0 ? (
        <View style={styles.liveList}>
          {visible.map((status) => (
            <View style={styles.liveRow} key={status.channelId}>
              <ChannelLogo type={status.channelType} box={32} glyph={15} radius={10} />
              <View style={styles.liveCopy}>
                <Text style={styles.liveName} numberOfLines={1}>{status.name}</Text>
                <View style={styles.liveStatusLine}>
                  <View style={[styles.toneDot, { backgroundColor: TONE_COLORS[status.tone] }]} />
                  <Text style={styles.liveStatus} numberOfLines={1}>{status.detail}</Text>
                </View>
              </View>
              <View style={styles.liveCountChip}>
                <Text style={styles.liveCount}>{formatNumber(status.messagesInRange)}</Text>
              </View>
            </View>
          ))}
          {remaining > 0 ? (
            <Pressable style={styles.loadMore} onPress={() => setExpanded((value) => !value)}>
              <Text style={styles.loadMoreText}>{expanded ? 'Show less' : `Show ${remaining} more`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No active channel data in the current scope.</Text>
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
}: {
  label: string;
  value: string;
  note: string;
  color: string;
  colors: [string, string];
  Icon: typeof MessageSquareText;
  delta: { label: string | null; positive: boolean } | null;
  width: number;
}) {
  return (
    <UberCard
      width={width}
      colors={colors}
      onDark={false}
      valueColor={color}
      icon={<Icon color={color} size={20} strokeWidth={2.2} />}
      footerBadge={delta?.label ? (
        <Text style={[styles.uberDelta, delta.positive ? styles.deltaPositive : styles.deltaNegative]} numberOfLines={1}>
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
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(248, Math.max(210, windowWidth * 0.62));

  return (
    <CarouselSection title={title} subtitle={subtitle}>
      <HScroll>
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} width={cardWidth} />
        ))}
      </HScroll>
    </CarouselSection>
  );
}

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.max(windowWidth - 32, 280);
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const range = useMemo(() => resolveRange(preset), [preset]);
  const query = useMemo(() => ({ from: toUtcIso(range.from), to: toUtcIso(range.to), search: search.trim() || undefined }), [range, search]);
  const dashboard = useQuery({ queryKey: ['dashboard', query], queryFn: () => fetchDashboard(query), staleTime: 15000 });
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
      { label: 'Conversations', value: formatNumber(summary?.totalConversations), note: 'vs prior period', color: '#3f6212', colors: ['#ecfccb', '#a3e635'] as [string, string], Icon: MessageSquareText, delta: totalCmp },
      { label: 'Unique contacts', value: formatNumber(summary?.uniqueContactsCreated), note: 'in range', color: '#9a3412', colors: ['#ffedd5', '#fb923c'] as [string, string], Icon: Users, delta: null },
      { label: 'Unassigned', value: formatNumber(summary?.unassignedConversations), note: 'needs owner', color: '#075985', colors: ['#e0f2fe', '#38bdf8'] as [string, string], Icon: Inbox, delta: null },
      { label: 'Assigned', value: formatNumber(summary?.assignedConversations), note: 'with agents', color: '#166534', colors: ['#dcfce7', '#4ade80'] as [string, string], Icon: UserCheck, delta: null },
      { label: 'First response', value: formatDuration(summary?.avgFirstResponseMinutes ?? null), note: 'vs prior period', color: '#991b1b', colors: ['#fee2e2', '#f87171'] as [string, string], Icon: Clock3, delta: respCmp },
      { label: 'Resolution rate', value: `${(summary?.resolutionRate ?? 0).toFixed(1)}%`, note: 'vs prior period', color: '#065f46', colors: ['#d1fae5', '#34d399'] as [string, string], Icon: Percent, delta: rateCmp },
    ];
  }, [summary, snapshot]);

  const overview = [
    { label: 'Conversations', value: formatNumber(summary?.totalConversations), note: 'Total in selected range', colors: ['#1d4ed8', '#60a5fa'] as [string, string], Icon: MessageSquareText },
    { label: 'Channels', value: formatNumber(channelsCount), note: 'Connected in workspace', colors: ['#0f766e', '#2dd4bf'] as [string, string], Icon: Wifi },
    { label: 'Team', value: formatNumber(teamMembers), note: 'Agents in command center', colors: ['#7c3aed', '#c4b5fd'] as [string, string], Icon: Users },
  ];

  const applySearch = () => setSearch(searchInput.trim());
  const glanceWidth = Math.min(220, Math.max(188, windowWidth * 0.55));

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topbarCopy}>
          <Text style={styles.topTitle}>Dashboard</Text>
          <Text style={styles.topDate} numberOfLines={1}>{rangeLabel}</Text>
        </View>
        <NotificationBell onOpen={() => setNotificationsOpen(true)} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={dashboard.isRefetching} onRefresh={() => dashboard.refetch()} tintColor="#2563eb" />}
      >
        <View style={styles.controlsCard}>
          <View style={styles.search}>
            <Search color="#94a3b8" size={18} />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={applySearch}
              returnKeyType="search"
              placeholder="Search agents, channels…"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
            />
            {searchInput ? (
              <Pressable onPress={() => { setSearchInput(''); setSearch(''); }} hitSlop={8}>
                <Text style={styles.clearSearch}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <RangeSegment value={preset} onChange={setPreset} />
        </View>

        {dashboard.isLoading && !dashboard.data ? (
          <ActivityIndicator color="#2563eb" style={styles.loader} />
        ) : dashboard.isError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Dashboard offline</Text>
            <Text style={styles.errorText}>{dashboard.error instanceof Error ? dashboard.error.message : 'Unable to load live metrics.'}</Text>
            <Pressable style={styles.retryBtn} onPress={() => dashboard.refetch()}>
              <RefreshCw color="#fff" size={16} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CarouselSection title="At a glance">
              <HScroll>
                {overview.map((item) => {
                  const Icon = item.Icon;
                  return (
                    <UberCard
                      key={item.label}
                      width={glanceWidth}
                      colors={item.colors}
                      icon={<Icon color="#fff" size={20} strokeWidth={2.2} />}
                      value={item.value}
                      title={item.label}
                      subtitle={item.note}
                    />
                  );
                })}
              </HScroll>
            </CarouselSection>

            <MetricCarousel title="Key metrics" metrics={metrics} />

            <Section
              title="Conversation volume"
              action={<TrendingUp color="#64748b" size={18} />}
            >
              <View style={styles.legend}>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2563eb' }]} /><Text style={styles.legendText}>Incoming</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#10b981' }]} /><Text style={styles.legendText}>Resolved</Text></View>
              </View>
              <VolumeChart trends={trends} width={contentWidth - 32} />
            </Section>

            <Section title="Channel mix">
              <ChannelMix mix={mix} />
            </Section>
            <TeamCommandCenter data={dashboard.data} />
            <LiveChannelStatus data={dashboard.data} />

            <Text style={styles.footerNote}>Scoped to the current workspace. Search and date range update every section.</Text>
          </>
        )}
      </ScrollView>

      <NotificationCenter visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f4f7fb', flex: 1 },
  content: { paddingTop: 12 },
  topbar: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomColor: '#e8eef7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  topbarCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  topTitle: { color: '#0f172a', fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  topDate: { color: '#64748b', fontSize: 13, marginTop: 2 },

  controlsCard: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: 16,
    padding: 14,
  },
  search: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  searchInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 15,
    height: 44,
    marginLeft: 8,
  },
  clearSearch: {
    color: '#2563eb',
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
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  rangeChipActive: {
    backgroundColor: '#2563eb',
  },
  rangeChipText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
  },
  rangeChipTextActive: {
    color: '#fff',
  },

  section: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
  },
  sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, marginBottom: 14 },
  sectionHeaderCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  sectionSubtitle: { color: '#64748b', fontSize: 12, lineHeight: 16, marginTop: 3 },

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
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  carouselSubtitle: {
    color: '#64748b',
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

  legend: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  legendDot: { borderRadius: 4, height: 8, width: 8 },
  legendText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  chartWrap: { marginTop: 4 },

  mixLayout: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  donut: { alignItems: 'center', height: 120, justifyContent: 'center', position: 'relative', width: 120 },
  donutCenter: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  donutValue: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  donutLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600', marginTop: 1 },
  mixList: { flex: 1, gap: 8, minWidth: 0 },
  channelRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  channelName: { color: '#334155', flex: 1, fontSize: 13, fontWeight: '600' },
  channelPercent: { color: '#0f172a', fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'right' },

  livePill: { alignItems: 'center', backgroundColor: '#ecfdf5', borderRadius: 999, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  liveDot: { backgroundColor: '#22c55e', borderRadius: 4, height: 7, width: 7 },
  livePillText: { color: '#059669', fontSize: 11, fontWeight: '700' },
  statusTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  statusTabChip: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  statusText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  statusTextActive: { color: '#fff' },
  statusCount: { backgroundColor: '#e2e8f0', borderRadius: 999, minWidth: 20, paddingHorizontal: 6, paddingVertical: 1 },
  statusCountActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  statusCountText: { color: '#475569', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  statusCountTextActive: { color: '#fff' },

  memberList: { gap: 10 },
  memberCard: {
    backgroundColor: '#f8fafc',
    borderColor: '#e8eef7',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  memberOffline: { opacity: 0.72 },
  memberTop: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  memberAvatarWrap: { position: 'relative' },
  memberAvatar: { alignItems: 'center', backgroundColor: '#eef4ff', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  memberInitials: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  presenceDot: { borderColor: '#fff', borderRadius: 6, borderWidth: 2, bottom: -1, height: 12, position: 'absolute', right: -1, width: 12 },
  memberIdentity: { flex: 1, minWidth: 0 },
  memberName: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  memberActivity: { color: '#64748b', fontSize: 12, marginTop: 2 },
  presenceBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  presenceBadgeText: { fontSize: 11, fontWeight: '700' },
  memberMetrics: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 10 },
  memberMetric: { color: '#64748b', fontSize: 12 },
  memberMetricDot: { color: '#cbd5e1', fontSize: 12 },
  memberMetricStrong: { color: '#0f172a', fontWeight: '700' },
  memberMetricBlue: { color: '#2563eb', fontWeight: '700' },
  memberBottom: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 10 },
  memberProgressWrap: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, minWidth: 0 },
  memberProgressTrack: { backgroundColor: '#e2e8f0', borderRadius: 999, flex: 1, height: 5, overflow: 'hidden' },
  memberProgressFill: { borderRadius: 999, height: '100%' },
  memberProgressPct: { color: '#059669', fontSize: 12, fontWeight: '700', minWidth: 34, textAlign: 'right' },
  responseChip: { backgroundColor: '#eff6ff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  responseChipText: { color: '#2563eb', fontSize: 12, fontWeight: '700' },

  liveList: { marginTop: -4 },
  liveRow: {
    alignItems: 'center',
    borderBottomColor: '#f1f5f9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  liveCopy: { flex: 1, minWidth: 0 },
  liveName: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  liveStatusLine: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 3 },
  toneDot: { borderRadius: 4, height: 7, width: 7 },
  liveStatus: { color: '#64748b', flex: 1, fontSize: 12 },
  liveCountChip: { backgroundColor: '#eff6ff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  liveCount: { color: '#2563eb', fontSize: 14, fontWeight: '800' },
  loadMore: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  loadMoreText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },

  loader: { marginTop: 64 },
  errorBox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 24,
  },
  errorTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  errorText: { color: '#64748b', fontSize: 13, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  retryBtn: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
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
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 20,
  },
  emptyText: { color: '#64748b', fontSize: 13, textAlign: 'center' },
  footerNote: { color: '#94a3b8', fontSize: 11, lineHeight: 16, paddingHorizontal: 24, paddingTop: 16, textAlign: 'center' },
});
