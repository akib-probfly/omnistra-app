import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  addLocalMonths,
  formatDateRangeValue,
  getQuickDateRanges,
  parseDateRangeValue,
  startOfLocalDay,
  startOfLocalMonth,
  toIsoDateRange,
  type IsoDateRangeValue,
} from '../lib/date-range';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  value: IsoDateRangeValue;
  onChange: (value: IsoDateRangeValue) => void;
  placeholder?: string;
};

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function sameDay(left: Date | null, right: Date | null) {
  return Boolean(left && right
    && left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate());
}

function formatDay(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function DateRangeFilter({ value, onChange, placeholder = 'Created date' }: Props) {
  const { colors } = useTheme();
  const quickRanges = useMemo(() => getQuickDateRanges(), []);
  const parsed = parseDateRangeValue(value);
  const hasValue = Boolean(value.from || value.to);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfLocalMonth(parsed.from ?? new Date()));
  const maxDate = startOfLocalDay(new Date());
  const selectedFrom = draftFrom ?? parsed.from ?? null;
  const selectedTo = draftFrom ? draftTo : parsed.to ?? null;

  function commitRange(range: IsoDateRangeValue) {
    setDraftFrom(null);
    setDraftTo(null);
    setOpen(false);
    onChange(range);
  }

  function selectDate(date: Date) {
    const selected = startOfLocalDay(date);
    if (selected.getTime() > maxDate.getTime()) return;

    if (!draftFrom || draftTo) {
      setDraftFrom(selected);
      setDraftTo(null);
      return;
    }

    const start = selected.getTime() < draftFrom.getTime() ? selected : draftFrom;
    const end = selected.getTime() < draftFrom.getTime() ? draftFrom : selected;
    commitRange(toIsoDateRange(start, end));
  }

  const monthStart = startOfLocalMonth(visibleMonth);
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const calendarDays = Array.from({ length: cellCount }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;
    return dayNumber > 0 && dayNumber <= daysInMonth
      ? new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNumber)
      : null;
  });

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.summary, { backgroundColor: colors.surfaceSecondary, borderColor: hasValue ? colors.primary : colors.cardBorder }]}
        onPress={() => {
          if (!open) {
            setDraftFrom(null);
            setDraftTo(null);
            setVisibleMonth(startOfLocalMonth(parsed.from ?? new Date()));
          }
          setOpen(!open);
        }}
      >
        <CalendarDays color={hasValue ? colors.primary : colors.textMuted} size={16} />
        <Text style={[styles.summaryText, { color: hasValue ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
          {formatDateRangeValue(value, placeholder)}
        </Text>
        {hasValue ? (
          <Pressable hitSlop={8} onPress={() => commitRange({ from: null, to: null })} accessibilityLabel="Clear created date filter">
            <X color={colors.textMuted} size={14} />
          </Pressable>
        ) : null}
      </Pressable>

      {open ? (
        <View style={[styles.calendarPanel, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <View style={styles.calendarContent}>
            <View style={styles.quickColumn}>
              <Text style={[styles.columnTitle, { color: colors.textMuted }]}>QUICK RANGE</Text>
              {quickRanges.map((item) => (
                <Pressable key={item.id} style={styles.quickButton} onPress={() => commitRange(item.range)}>
                  <Text style={[styles.quickText, { color: colors.textSecondary }]}>{item.label}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.clearButton} onPress={() => commitRange({ from: null, to: null })}>
                <X color={colors.textMuted} size={13} />
                <Text style={[styles.quickText, { color: colors.textMuted }]}>Clear</Text>
              </Pressable>
            </View>

            <View style={styles.calendar}>
              <View style={styles.monthHeader}>
                <Pressable
                  accessibilityLabel="Previous month"
                  onPress={() => setVisibleMonth((current) => addLocalMonths(current, -1))}
                  style={styles.monthArrow}
                >
                  <ChevronLeft color={colors.textSecondary} size={18} />
                </Pressable>
                <Text style={[styles.monthTitle, { color: colors.text }]}>
                  {MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
                </Text>
                <Pressable
                  accessibilityLabel="Next month"
                  onPress={() => setVisibleMonth((current) => addLocalMonths(current, 1))}
                  style={styles.monthArrow}
                >
                  <ChevronRight color={colors.textSecondary} size={18} />
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map((day) => (
                  <Text key={day} style={[styles.weekday, { color: colors.textMuted }]}>{day}</Text>
                ))}
              </View>
              {Array.from({ length: cellCount / 7 }, (_, week) => (
                <View key={week} style={styles.weekRow}>
                  {calendarDays.slice(week * 7, week * 7 + 7).map((date, dayIndex) => {
                    if (!date) return <View key={`empty-${week}-${dayIndex}`} style={styles.dayCell} />;
                    const isFuture = date.getTime() > maxDate.getTime();
                    const isStart = sameDay(date, selectedFrom);
                    const isEnd = sameDay(date, selectedTo);
                    const isInRange = Boolean(selectedFrom && selectedTo
                      && date.getTime() >= selectedFrom.getTime()
                      && date.getTime() <= selectedTo.getTime());
                    const isRangeStart = isStart && Boolean(selectedTo) && !isEnd;
                    const isRangeEnd = isEnd && Boolean(selectedFrom) && !isStart;
                    return (
                      <Pressable
                        key={date.toISOString()}
                        disabled={isFuture}
                        onPress={() => selectDate(date)}
                        style={[
                          styles.dayCell,
                          isInRange && { backgroundColor: colors.primary + '24' },
                          isRangeStart && styles.rangeStart,
                          isRangeEnd && styles.rangeEnd,
                          isStart && !selectedTo && { backgroundColor: colors.primary, borderRadius: 999 },
                          (isRangeStart || isRangeEnd || (isStart && isEnd)) && { backgroundColor: colors.primary },
                        ]}
                      >
                        <Text style={[
                          styles.dayText,
                          { color: isFuture ? colors.textMuted + '66' : isStart || isEnd ? '#fff' : colors.textSecondary },
                          isStart || isEnd ? styles.dayTextSelected : null,
                        ]}>{date.getDate()}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
          {draftFrom ? (
            <Text style={[styles.selectionHint, { color: colors.textMuted }]}>
              Start: {formatDay(draftFrom)} · Select an end date
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text style={[styles.hint, { color: colors.textMuted }]}>Select a start and end date. The end date is included.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  summary: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  summaryText: { flex: 1, fontSize: 13, fontWeight: '600' },
  calendarPanel: { borderRadius: 16, borderWidth: 1, padding: 12 },
  calendarContent: { flexDirection: 'row', gap: 8 },
  quickColumn: { flex: 0.9, gap: 3, paddingTop: 4 },
  columnTitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 5 },
  quickButton: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 2 },
  quickText: { fontSize: 11, fontWeight: '500' },
  clearButton: { alignItems: 'center', flexDirection: 'row', gap: 3, marginTop: 5, minHeight: 28 },
  calendar: { flex: 1.7, minWidth: 0 },
  monthHeader: { alignItems: 'center', flexDirection: 'row', height: 32, justifyContent: 'space-between' },
  monthArrow: { alignItems: 'center', height: 30, justifyContent: 'center', width: 28 },
  monthTitle: { fontSize: 12, fontWeight: '700' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-around' },
  weekday: { alignItems: 'center', fontSize: 10, height: 24, lineHeight: 24, textAlign: 'center', width: '14.285%' },
  dayCell: { alignItems: 'center', aspectRatio: 1, justifyContent: 'center', width: '14.285%' },
  rangeStart: { borderBottomLeftRadius: 999, borderTopLeftRadius: 999 },
  rangeEnd: { borderBottomRightRadius: 999, borderTopRightRadius: 999 },
  dayText: { fontSize: 11, textAlign: 'center' },
  dayTextSelected: { fontWeight: '700' },
  selectionHint: { borderTopWidth: StyleSheet.hairlineWidth, fontSize: 10, marginTop: 8, paddingTop: 8 },
  hint: { fontSize: 11, lineHeight: 16 },
});
