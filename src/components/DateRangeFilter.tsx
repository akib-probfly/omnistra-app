import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatDateRangeValue,
  getQuickDateRanges,
  parseDateRangeValue,
  startOfLocalDay,
  toIsoDateRange,
  type IsoDateRangeValue,
} from '../lib/date-range';
import { useTheme } from '../theme/ThemeContext';
import { AppChip } from '../ui';

type PickerField = 'from' | 'to';

type Props = {
  value: IsoDateRangeValue;
  onChange: (value: IsoDateRangeValue) => void;
  placeholder?: string;
};

export function DateRangeFilter({ value, onChange, placeholder = 'Created date' }: Props) {
  const { colors } = useTheme();
  const quickRanges = useMemo(() => getQuickDateRanges(), []);
  const parsed = parseDateRangeValue(value);
  const hasValue = Boolean(value.from || value.to);
  const [pickerField, setPickerField] = useState<PickerField | null>(null);
  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);

  const displayFrom = draftFrom ?? parsed.from ?? null;
  const displayTo = draftTo ?? parsed.to ?? null;
  const maxDate = startOfLocalDay(new Date());

  function commitRange(range: IsoDateRangeValue) {
    setDraftFrom(null);
    setDraftTo(null);
    setPickerField(null);
    onChange(range);
  }

  function applyDates(fromDate: Date | null, toDate: Date | null) {
    if (!fromDate || !toDate) return;
    const start = startOfLocalDay(fromDate);
    const end = startOfLocalDay(toDate);
    if (end.getTime() < start.getTime()) {
      commitRange(toIsoDateRange(end, start));
      return;
    }
    commitRange(toIsoDateRange(start, end));
  }

  function handlePickerChange(field: PickerField, date?: Date) {
    if (Platform.OS === 'android') setPickerField(null);
    if (!date) return;

    const nextFrom = field === 'from' ? date : displayFrom;
    const nextTo = field === 'to' ? date : displayTo;
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    applyDates(nextFrom, nextTo);
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[
          styles.summary,
          { backgroundColor: colors.surfaceSecondary, borderColor: hasValue ? colors.primary : colors.cardBorder },
        ]}
        onPress={() => setPickerField(pickerField ? null : 'from')}
      >
        <CalendarDays color={hasValue ? colors.primary : colors.textMuted} size={16} />
        <Text style={[styles.summaryText, { color: hasValue ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
          {formatDateRangeValue(value, placeholder)}
        </Text>
        {hasValue ? (
          <Pressable
            hitSlop={8}
            onPress={() => commitRange({ from: null, to: null })}
            accessibilityLabel="Clear created date filter"
          >
            <X color={colors.textMuted} size={14} />
          </Pressable>
        ) : null}
      </Pressable>

      <View style={styles.chipRow}>
        {quickRanges.map((item) => {
          const selected = value.from === item.range.from && value.to === item.range.to;
          return (
            <AppChip
              key={item.id}
              label={item.label}
              selected={selected}
              onPress={() => commitRange(item.range)}
            />
          );
        })}
      </View>

      <View style={styles.dateRow}>
        <Pressable
          style={[styles.dateButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}
          onPress={() => setPickerField('from')}
        >
          <Text style={[styles.dateButtonLabel, { color: colors.textMuted }]}>Start</Text>
          <Text style={[styles.dateButtonValue, { color: colors.text }]}>
            {displayFrom
              ? displayFrom.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Select'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.dateButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}
          onPress={() => setPickerField('to')}
        >
          <Text style={[styles.dateButtonLabel, { color: colors.textMuted }]}>End</Text>
          <Text style={[styles.dateButtonValue, { color: colors.text }]}>
            {displayTo
              ? displayTo.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Select'}
          </Text>
        </Pressable>
      </View>

      {pickerField ? (
        <DateTimePicker
          value={pickerField === 'from' ? (displayFrom ?? maxDate) : (displayTo ?? displayFrom ?? maxDate)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={maxDate}
          onChange={(event, date) => {
            if (Platform.OS === 'android' && event.type !== 'set') {
              setPickerField(null);
              return;
            }
            handlePickerChange(pickerField, date);
          }}
        />
      ) : null}

      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Select a start and end date. The end date is included.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  summary: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryText: { flex: 1, fontSize: 13, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateButton: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateButtonLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  dateButtonValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  hint: { fontSize: 11, lineHeight: 16 },
});
