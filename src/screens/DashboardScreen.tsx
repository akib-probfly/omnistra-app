// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, TrendingUp, UserRound, Wifi } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { fetchDashboard, type DashboardChannelHealthItem, type DashboardResponse, type DashboardTeamCommandCenterMember, type DashboardTrendPoint } from '../api/dashboard';
import { channelBrandColor, ChannelLogo } from '../components/ChannelLogo';
import { NotificationBell, NotificationCenter } from '../components/NotificationCenter';

type RangePreset = 'today' | '7d' | '30d';
type PresenceFilter = 'all' | 'online' | 'offline';

const RANGE_LABELS: Record<RangePreset, string> = { today: 'Today', '7d': '7 Days', '30d': '30 Days' };
const INITIAL_VISIBLE_CHANNELS = 6;

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
  return `${left} - ${right}, ${to.getFullYear()}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined).format(value ?? 0);
}

function formatDuration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return '-';
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
  return { label: `${deltaPercent >= 0 ? '+' : '-'}${Math.abs(deltaPercent).toFixed(1)}%`, positive: higherIsBetter ? current >= previous : current <= previous };
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
        ? 'Channel is disconnected and not processing messages.'
        : isWarning
          ? channel.lastWebhookError ?? 'Webhook or sync errors were detected.'
          : isDegraded
            ? `${channel.connectedAccounts}/${Math.max(channel.activeAccounts, 1)} accounts are connected.`
            : `${channel.connectedAccounts}/${Math.max(channel.activeAccounts, 1)} accounts connected and healthy.`;
      return { channelId: channel.channelId, name: channel.channelName, channelType: channel.channelType, tone, detail, messagesInRange: channel.messagesInRange };
    });
}

const TONE_COLORS = { healthy: '#22c55e', degraded: '#f59e0b', warning: '#ef4444', offline: '#94a3b8' };

function VolumeChart({ trends }: { trends: DashboardTrendPoint[] }) {
  const chart = useMemo(() => {
    const width = 350;
    const height = 150;
    const pad = { top: 14, right: 8, bottom: 8, left: 8 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const points = trends ?? [];
    const max = Math.max(1, ...points.flatMap((p) => [p.incoming, p.resolved]));
    const axisMax = getNiceAxisMax(max);
    const scaleY = (v: number) => pad.top + chartH - (v / axisMax) * chartH;
    const scaleX = (i: number) => pad.left + (i * chartW) / Math.max(points.length - 1, 1);
    const series = points.map((p, i) => ({ x: scaleX(i), incoming: scaleY(p.incoming), resolved: scaleY(p.resolved) }));
    const baseline = pad.top + chartH;
    const incomingPath = buildSmoothPath(series.map((s) => ({ x: s.x, y: s.incoming })));
    const resolvedPath = buildSmoothPath(series.map((s) => ({ x: s.x, y: s.resolved })));
    const incomingArea = buildAreaPath(series.map((s) => ({ x: s.x, y: s.incoming })), baseline);
    const tickLines = [0, axisMax / 2, axisMax].map((t) => ({ y: pad.top + chartH - (t / axisMax) * chartH, value: t }));
    return { series, incomingPath, resolvedPath, incomingArea, baseline, tickLines, pad, width, height };
  }, [trends]);

  if (!chart.series.length) {
    return <View style={styles.chartEmpty}><Text style={styles.emptyText}>No conversation volume in this range.</Text></View>;
  }

  return (
    <View style={styles.chartWrap}>
      <Svg height={150} viewBox={`0 0 ${chart.width} ${chart.height}`} width="100%">
        {chart.tickLines.map((line) => (
          <Path key={line.value} d={`M ${chart.pad.left} ${line.y} L ${chart.width - chart.pad.right} ${line.y}`} stroke="#d9e7ff" strokeDasharray="3 5" />
        ))}
        <Path d={chart.incomingArea} fill="#d9e5ff" opacity={0.8} />
        <Path d={chart.incomingPath} fill="none" stroke="#2865fa" strokeWidth={2} strokeLinecap="round" />
        <Path d={chart.resolvedPath} fill="none" stroke="#31b982" strokeWidth={2} strokeLinecap="round" />
      </Svg>
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
  const R = 50;
  const SW = 20;
  const C = 2 * Math.PI * R;
  let acc = 0;

  return (
    <View>
      <View style={styles.donut}>
        <Svg width={140} height={140} viewBox="0 0 140 140" style={{ transform: [{ rotate: '-90deg' }] }}>
          {segments.length === 0 ? <Circle cx="70" cy="70" r={R} fill="none" stroke="#eef2f7" strokeWidth={SW} /> : null}
          {segments.map((seg) => {
            const dash = (seg.value / 100) * C;
            const offset = -acc;
            acc += dash;
            return <Circle key={seg.channelType} cx="70" cy="70" r={R} fill="none" stroke={channelBrandColor(seg.channelType)} strokeWidth={SW} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={offset} />;
          })}
        </Svg>
        <View style={styles.donutCenter} pointerEvents="none">
          <Text style={styles.donutValue}>{formatNumber(total)}</Text>
          <Text style={styles.donutLabel}>TOTAL</Text>
        </View>
      </View>
      <View style={styles.mixList}>
        {segments.length === 0 ? <Text style={styles.emptyText}>No channel mix data in this range.</Text> : segments.map((seg) => (
          <View style={styles.channelRow} key={seg.channelType}>
            <ChannelLogo type={seg.channelType} box={20} glyph={11} radius={6} />
            <Text style={styles.channelName} numberOfLines={1}>{channelLabel(seg.channelType)}</Text>
            <Text style={styles.channelPercent}>{seg.value.toFixed(1)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TeamCommandCenter({ data }: { data: DashboardResponse | undefined }) {
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
  }, [data]);

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

  return (
    <View style={styles.panel}>
      <View style={styles.commandHeader}>
        <View style={styles.commandIcon}><UserRound color="#fff" size={20} /></View>
        <View style={styles.commandCopy}>
          <Text style={styles.panelTitle}>Team Command Center <Text style={styles.live}>● Live</Text></Text>
          <Text style={styles.panelSubtitle}>Presence, workload & performance - one view · {availableNow}/{totalMembers} team availability</Text>
        </View>
      </View>
      <View style={styles.statusTabs}>
        {filters.map((item) => (
          <Pressable key={item.key} style={[styles.statusTab, filter === item.key && styles.statusActive]} onPress={() => setFilter(item.key)}>
            <Text style={[styles.statusText, filter === item.key && styles.statusTextActive]}>{item.label} {item.count}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.teamStats}>
        <Stat label="AVAILABLE NOW" value={`${availableNow}/${totalMembers}`} green />
        <Stat label="TOTAL ASSIGNED" value={formatNumber(totalAssigned)} />
        <Stat label="TOTAL OPEN" value={formatNumber(totalOpen)} />
        <Stat label="AVG RESPONSE" value={avgResponseLabel} />
      </View>
      <View style={styles.progress}>
        <Text style={styles.progressLabel}>TEAM PROGRESS <Text style={styles.progressValue}>{totalReplied}/{totalAssigned} · {teamProgress}%</Text></Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${teamProgress}%` }]} /></View>
      </View>
      <View style={styles.memberList}>
        {list.length === 0 ? <Text style={styles.emptyText}>No agents in this state.</Text> : list.map((row) => (
          <View style={[styles.memberRow, row.status === 'offline' && styles.memberOffline]} key={row.key}>
            <View style={styles.memberAvatarWrap}>
              <View style={styles.memberAvatar}><Text style={styles.memberInitials}>{row.initials}</Text></View>
              <View style={[styles.presenceDot, { backgroundColor: row.status === 'online' ? '#22c55e' : '#94a3b8' }]} />
            </View>
            <View style={styles.memberCopy}>
              <View style={styles.memberNameLine}>
                <Text style={styles.memberName} numberOfLines={1}>{row.name}</Text>
                <View style={[styles.presenceBadge, { backgroundColor: row.status === 'online' ? '#dff8ee' : '#eef2f7' }]}>
                  <View style={[styles.presenceMiniDot, { backgroundColor: row.status === 'online' ? '#22c55e' : '#94a3b8' }]} />
                  <Text style={[styles.presenceBadgeText, { color: row.status === 'online' ? '#059669' : '#64748b' }]}>{row.status === 'online' ? 'Online' : 'Offline'}</Text>
                </View>
              </View>
              <Text style={styles.memberActivity} numberOfLines={1}>{row.activity}</Text>
              <View style={styles.memberMeta}>
                <Text style={styles.memberMetaText}><Text style={styles.memberMetaStrong}>{formatNumber(row.replied)}</Text> replied · <Text style={styles.memberMetaBlue}>{formatNumber(row.open)}</Text> open · <Text style={styles.memberMetaStrong}>{formatNumber(row.assigned)}</Text> assigned</Text>
                <Text style={styles.memberProgressPct}>{row.progress}%</Text>
              </View>
              <View style={styles.memberProgressTrack}><View style={[styles.memberProgressFill, { width: `${row.progress}%`, backgroundColor: row.status === 'online' ? '#22c55e' : '#94a3b8' }]} /></View>
            </View>
            <Text style={styles.memberResponse}>{row.responseLabel}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LiveChannelStatus({ data }: { data: DashboardResponse | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const statuses = useMemo(() => deriveChannelStatuses(data?.channelHealth ?? []).sort((a, b) => b.messagesInRange - a.messagesInRange), [data?.channelHealth]);
  const visible = expanded ? statuses : statuses.slice(0, INITIAL_VISIBLE_CHANNELS);
  const remaining = Math.max(statuses.length - INITIAL_VISIBLE_CHANNELS, 0);
  const totalMessages = data?.summary.messagesInRange ?? 0;

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeading}>
        <View style={styles.panelHeadingCopy}>
          <Text style={styles.panelTitle}>Live Channel Status</Text>
          <Text style={styles.panelSubtitle}>Realtime connection health and message volume</Text>
        </View>
        <Wifi color="#2563eb" size={20} />
      </View>
      {statuses.length > 0 ? (
        <>
          {visible.map((status) => (
            <View style={styles.liveRow} key={status.channelId}>
              <ChannelLogo type={status.channelType} box={30} glyph={15} radius={9} />
              <View style={styles.liveCopy}>
                <Text style={styles.channelName} numberOfLines={1}>{status.name}</Text>
                <View style={styles.liveStatusLine}>
                  <View style={[styles.toneDot, { backgroundColor: TONE_COLORS[status.tone] }]} />
                  <Text style={styles.liveStatus} numberOfLines={1}>{status.detail}</Text>
                </View>
              </View>
              <Text style={styles.liveCount}>{formatNumber(status.messagesInRange)}</Text>
            </View>
          ))}
          {remaining > 0 ? (
            <Pressable style={styles.loadMore} onPress={() => setExpanded((value) => !value)}>
              <Text style={styles.loadMoreText}>{expanded ? 'Show less' : `Load more (${remaining})`}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <View style={styles.emptyBox}><Text style={styles.emptyText}>No active channel data in the current scope.</Text></View>
      )}
    </View>
  );
}

function Stat({ label, value, green = false }: { label: string; value: string; green?: boolean }) {
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={[styles.statValue, green && styles.green]}>{value}</Text></View>;
}

function MetricCard({ label, value, note, color, delta }: { label: string; value: string; note: string; color: string; delta: { label: string | null; positive: boolean } | null }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricHeading}>
        <View style={[styles.metricIcon, { backgroundColor: color }]} />
        <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <View style={styles.divider} />
      {delta?.label ? <Text style={[styles.metricDelta, delta.positive ? styles.deltaPositive : styles.deltaNegative]}>{delta.label} · {note}</Text> : <Text style={styles.metricNote}>{note}</Text>}
    </View>
  );
}

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
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
      { label: 'TOTAL CONVERSATIONS', value: formatNumber(summary?.totalConversations), note: 'vs previous period', color: '#78c043', delta: totalCmp },
      { label: 'UNIQUE CONTACTS', value: formatNumber(summary?.uniqueContactsCreated), note: 'current unique contact count', color: '#ef613d', delta: null },
      { label: 'UNASSIGNED CONVERSATION', value: formatNumber(summary?.unassignedConversations), note: 'current unassigned load', color: '#15a8e8', delta: null },
      { label: 'ASSIGNED CONVERSATIONS', value: formatNumber(summary?.assignedConversations), note: 'current assignment load', color: '#42b95a', delta: null },
      { label: 'AVG FIRST RESPONSE', value: formatDuration(summary?.avgFirstResponseMinutes ?? null), note: 'vs previous period', color: '#f05b52', delta: respCmp },
      { label: 'RESOLUTION RATE', value: `${(summary?.resolutionRate ?? 0).toFixed(1)}%`, note: 'vs previous period', color: '#42a854', delta: rateCmp },
    ];
  }, [summary, snapshot]);

  const applySearch = () => setSearch(searchInput.trim());

  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topbarCopy}>
          <Text style={styles.topTitle}>Dashboard</Text>
          <Text style={styles.topDate}>{rangeLabel}</Text>
        </View>
                <NotificationBell onOpen={() => setNotificationsOpen(true)} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={dashboard.isRefetching} onRefresh={() => dashboard.refetch()} tintColor="#2563eb" />}>
        <View style={styles.hero}>
          <View style={styles.rings}>
            {[['CONVERSATIONS', formatNumber(summary?.totalConversations)], ['CHANNELS', formatNumber(channelsCount)], ['TEAM MEMBERS', formatNumber(teamMembers)]].map(([label, value]) => (
              <View style={styles.ringItem} key={label}><View style={styles.ring}><Text style={styles.ringValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</Text></View><Text style={styles.ringLabel}>{label}</Text></View>
            ))}
          </View>
          <View style={styles.controls}>
            <View style={styles.search}><Search color="#8ba2c3" size={18} /><TextInput value={searchInput} onChangeText={setSearchInput} onSubmitEditing={applySearch} returnKeyType="search" placeholder="Search..." placeholderTextColor="#8ba2c3" style={styles.searchInput} /></View>
            <View style={styles.segment}>
              {(['today', '7d', '30d'] as RangePreset[]).map((item) => (
                <Pressable key={item} style={[styles.segmentTab, preset === item && styles.segmentActive]} onPress={() => setPreset(item)}>
                  <Text style={[styles.segmentText, preset === item && styles.segmentTextActive]}>{RANGE_LABELS[item]}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

      {dashboard.isLoading && !dashboard.data ? (
        <ActivityIndicator color="#2563eb" style={styles.loader} />
      ) : dashboard.isError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Dashboard offline</Text>
          <Text style={styles.errorText}>{dashboard.error instanceof Error ? dashboard.error.message : 'Unable to load live metrics.'}</Text>
          <Pressable style={styles.retryBtn} onPress={() => dashboard.refetch()}><RefreshCw color="#fff" size={16} /><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      ) : (
        <>
          <View style={styles.metricGrid}>{metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</View>

          <View style={styles.panel}>
            <View style={styles.panelHeading}>
              <View style={styles.panelHeadingCopy}>
                <View style={styles.titleLine}><Text style={styles.panelTitle}>Conversation Volume</Text><TrendingUp color="#64748b" size={16} /></View>
                <Text style={styles.panelSubtitle}>{rangeLabel}</Text>
              </View>
              <View style={styles.segment}>
                {(['today', '7d', '30d'] as RangePreset[]).map((item) => (
                  <Pressable key={item} style={[styles.segmentTab, preset === item && styles.segmentActive]} onPress={() => setPreset(item)}>
                    <Text style={[styles.segmentText, preset === item && styles.segmentTextActive]}>{RANGE_LABELS[item]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#2865fa' }]} /><Text style={styles.legendText}>Incoming</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#31b982' }]} /><Text style={styles.legendText}>Resolved</Text></View>
            </View>
            <VolumeChart trends={trends} />
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Channel Mix</Text>
            <Text style={styles.panelSubtitle}>{rangeLabel}</Text>
            <ChannelMix mix={mix} />
          </View>

          <TeamCommandCenter data={dashboard.data} />

          <LiveChannelStatus data={dashboard.data} />

          <Text style={styles.footerNote}>Scoped for the current workspace. Search and date range update the full dashboard.</Text>
        </>
      )}
      </ScrollView>

      <NotificationCenter visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#eef4fc', flex: 1 },
  content: { paddingBottom: 28 },
  topbar: { alignItems: 'center', backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 14, paddingHorizontal: 18 },
  topbarCopy: { flex: 1, minWidth: 0 },
  topTitle: { color: '#050914', fontSize: 24, fontWeight: '800' },
  topDate: { color: '#5c6f8d', fontSize: 13, marginTop: 4 },
  hero: { backgroundColor: '#fff', borderColor: '#cfe0fa', borderRadius: 28, borderWidth: 1, margin: 12, padding: 20 },
  rings: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 18 },
  ringItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  ring: { alignItems: 'center', borderColor: '#3269ff', borderRadius: 26, borderWidth: 4, height: 52, justifyContent: 'center', width: 52 },
  ringValue: { color: '#071128', fontSize: 13, fontWeight: '800' },
  ringLabel: { color: '#526787', fontSize: 8, fontWeight: '700', width: 48 },
  controls: { flexDirection: 'row', gap: 8, marginTop: 20 },
  search: { alignItems: 'center', borderColor: '#c9ddfb', borderRadius: 28, borderWidth: 1, flex: 1, flexDirection: 'row', paddingHorizontal: 14 },
  searchInput: { color: '#1e293b', flex: 1, height: 44, marginLeft: 7 },
  segment: { alignItems: 'center', backgroundColor: '#eef4fb', borderColor: '#c9ddfb', borderRadius: 28, borderWidth: 1, flexDirection: 'row', padding: 3 },
  segmentTab: { alignItems: 'center', borderRadius: 24, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  segmentActive: { backgroundColor: '#2563eb' },
  segmentText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: '#fff' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12 },
  metric: { backgroundColor: '#fff', borderColor: '#d4e3f8', borderRadius: 18, borderWidth: 1, minHeight: 116, padding: 14, width: '47%' },
  metricHeading: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  metricIcon: { borderRadius: 3, height: 15, width: 15 },
  metricLabel: { color: '#637796', flex: 1, fontSize: 11, fontWeight: '700' },
  metricValue: { color: '#0f172a', fontSize: 26, fontWeight: '800', marginTop: 10 },
  divider: { backgroundColor: '#e6edf7', height: StyleSheet.hairlineWidth, marginVertical: 10 },
  metricNote: { color: '#64748b', fontSize: 11, marginTop: 2 },
  metricDelta: { fontSize: 11, marginTop: 2, fontWeight: '600' },
  deltaPositive: { color: '#059669' },
  deltaNegative: { color: '#dc2626' },
  panel: { backgroundColor: '#fff', borderColor: '#d4e3f8', borderRadius: 22, borderWidth: 1, marginHorizontal: 12, marginTop: 12, padding: 16 },
  panelHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  panelHeadingCopy: { flex: 1, minWidth: 0 },
  titleLine: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  panelTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  panelSubtitle: { color: '#64748b', fontSize: 12, marginTop: 3 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 14 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  legendDot: { borderRadius: 4, height: 8, width: 8 },
  legendText: { color: '#64748b', fontSize: 12 },
  chartWrap: { marginTop: 8 },
  chartEmpty: { alignItems: 'center', paddingVertical: 32 },
  donut: { alignItems: 'center', alignSelf: 'center', height: 140, justifyContent: 'center', marginTop: 10, position: 'relative', width: 140 },
  donutCenter: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  donutValue: { color: '#071128', fontSize: 26, fontWeight: '800' },
  donutLabel: { color: '#8ba2c3', fontSize: 10, fontWeight: '700', marginTop: 2 },
  mixList: { gap: 8, marginTop: 14 },
  channelRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 4, paddingVertical: 6 },
  channelName: { color: '#1e293b', flex: 1, fontSize: 13, fontWeight: '600' },
  channelPercent: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  commandHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  commandIcon: { alignItems: 'center', backgroundColor: '#10b981', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  commandCopy: { flex: 1, minWidth: 0 },
  live: { color: '#22c55e', fontSize: 12, fontWeight: '700' },
  statusTabs: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statusTab: { backgroundColor: '#eef2f7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  statusActive: { backgroundColor: '#2563eb' },
  statusText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  statusTextActive: { color: '#fff' },
  teamStats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: { backgroundColor: '#f6f9ff', borderColor: '#d8e6fb', borderRadius: 12, flex: 1, padding: 10 },
  statLabel: { color: '#64748b', fontSize: 9, fontWeight: '700' },
  statValue: { color: '#0f172a', fontSize: 16, fontWeight: '800', marginTop: 4 },
  green: { color: '#059669' },
  progress: { marginTop: 16 },
  progressLabel: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  progressValue: { color: '#059669' },
  progressTrack: { backgroundColor: '#e2e8f0', borderRadius: 6, height: 6, marginTop: 8, overflow: 'hidden' },
  progressFill: { backgroundColor: '#10b981', borderRadius: 6, height: '100%' },
  memberList: { borderColor: '#e6edf7', borderRadius: 14, borderWidth: 1, marginTop: 14, overflow: 'hidden' },
  memberRow: { alignItems: 'center', borderBottomColor: '#e6edf7', borderBottomWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  memberOffline: { opacity: 0.7 },
  memberAvatarWrap: { position: 'relative' },
  memberAvatar: { alignItems: 'center', backgroundColor: '#eef4ff', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  memberInitials: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  presenceDot: { borderColor: '#fff', borderRadius: 6, borderWidth: 2, bottom: -1, height: 12, position: 'absolute', right: -1, width: 12 },
  memberCopy: { flex: 1, minWidth: 0 },
  memberNameLine: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  memberName: { color: '#0f172a', flexShrink: 1, fontSize: 14, fontWeight: '700' },
  presenceBadge: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 3, paddingHorizontal: 6, paddingVertical: 2 },
  presenceMiniDot: { borderRadius: 3, height: 6, width: 6 },
  presenceBadgeText: { fontSize: 9, fontWeight: '700' },
  memberActivity: { color: '#64748b', fontSize: 11, marginTop: 3 },
  memberMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  memberMetaText: { color: '#64748b', fontSize: 11 },
  memberMetaStrong: { color: '#0f172a', fontWeight: '700' },
  memberMetaBlue: { color: '#2563eb', fontWeight: '700' },
  memberProgressPct: { color: '#059669', fontSize: 11, fontWeight: '700' },
  memberProgressTrack: { backgroundColor: '#eef2f7', borderRadius: 4, height: 4, marginTop: 6, overflow: 'hidden' },
  memberProgressFill: { borderRadius: 4, height: '100%' },
  memberResponse: { backgroundColor: '#eef4ff', borderRadius: 8, color: '#2563eb', fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4 },
  liveRow: { alignItems: 'center', borderBottomColor: '#eef2f7', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 12 },
  liveCopy: { flex: 1, minWidth: 0 },
  liveStatusLine: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 3 },
  toneDot: { borderRadius: 4, height: 7, width: 7 },
  liveStatus: { color: '#64748b', flex: 1, fontSize: 11 },
  liveCount: { backgroundColor: '#eef4ff', borderRadius: 10, color: '#2563eb', fontSize: 15, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6 },
  loadMore: { alignItems: 'center', marginTop: 12, paddingVertical: 8 },
  loadMoreText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  loader: { marginTop: 60 },
  errorBox: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#d4e3f8', borderRadius: 22, borderWidth: 1, margin: 12, marginTop: 20, padding: 24 },
  errorTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  errorText: { color: '#64748b', fontSize: 13, marginTop: 6, textAlign: 'center' },
  retryBtn: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, flexDirection: 'row', gap: 6, marginTop: 14, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyBox: { borderRadius: 16, borderColor: '#d4e3f8', borderStyle: 'dashed', borderWidth: 1, padding: 20 },
  emptyText: { color: '#64748b', fontSize: 13, textAlign: 'center' },
  footerNote: { color: '#8ba2c3', fontSize: 11, paddingHorizontal: 16, paddingTop: 16, textAlign: 'center' },
});
