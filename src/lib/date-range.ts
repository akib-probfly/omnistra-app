export type IsoDateRangeValue = {
  from: string | null;
  to: string | null;
};

export function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfLocalMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addLocalMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function toIsoDateRange(from: Date, toInclusive: Date): IsoDateRangeValue {
  return {
    from: startOfLocalDay(from).toISOString(),
    to: startOfLocalDay(addLocalDays(toInclusive, 1)).toISOString(),
  };
}

export function getQuickDateRanges(now = new Date()) {
  const today = startOfLocalDay(now);

  return [
    { id: 'today', label: 'Today', range: toIsoDateRange(today, today) },
    { id: 'last-7-days', label: 'Last 7 days', range: toIsoDateRange(addLocalDays(today, -6), today) },
    { id: 'last-30-days', label: 'Last 30 days', range: toIsoDateRange(addLocalDays(today, -29), today) },
    {
      id: 'this-month',
      label: 'This month',
      range: {
        from: startOfLocalMonth(today).toISOString(),
        to: startOfLocalMonth(addLocalMonths(today, 1)).toISOString(),
      },
    },
  ] as const;
}

export function parseDateRangeValue(value: IsoDateRangeValue) {
  const from = value.from ? new Date(value.from) : undefined;
  const to = value.to ? new Date(value.to) : undefined;

  return {
    from: from && Number.isFinite(from.getTime()) ? from : undefined,
    to: to && Number.isFinite(to.getTime()) ? startOfLocalDay(addLocalDays(to, -1)) : undefined,
  };
}

export function formatDateRangeValue(value: IsoDateRangeValue, emptyLabel = 'Created date') {
  const parsed = parseDateRangeValue(value);
  if (!parsed.from && !parsed.to) return emptyLabel;

  const format = (date: Date) =>
    date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  if (parsed.from && parsed.to) {
    return `${format(parsed.from)} – ${format(parsed.to)}`;
  }

  return parsed.from ? `From ${format(parsed.from)}` : `Until ${format(parsed.to!)}`;
}
