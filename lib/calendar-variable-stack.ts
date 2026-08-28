export const CALENDAR_DATE_DIVIDER_CLASS = "pointer-events-none z-20 border-r border-slate-300/70";

export function getCalendarCompanyGridPosition(segment: { startColumn: number; endColumn: number; slot: number }) {
  return { gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`, gridRow: segment.slot + 2 };
}

export function getCalendarWeekGridLayout(slotCount: number) {
  const normalizedSlotCount = Math.max(0, Math.floor(slotCount));
  const rowCount = normalizedSlotCount + 2;
  return {
    slotCount: normalizedSlotCount,
    rowCount,
    personalRow: rowCount,
    cellRowSpan: rowCount,
    gridTemplateRows: normalizedSlotCount > 0 ? `auto repeat(${normalizedSlotCount}, auto) auto` : "auto auto",
  };
}

export function isSingleDayCalendarRange(start: string, end: string) {
  return start === end;
}

export function getCalendarTaskScheduleRange(input: { startDate: string | null; dueDate: string | null; completedDate?: string | null }) {
  const start = input.startDate || input.dueDate;
  const end = input.dueDate || input.startDate;
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

export type CalendarCompanyWeekSegment<T> = {
  item: T;
  slot: number;
  startColumn: number;
  endColumn: number;
  isRangeStart: boolean;
  isRangeEnd: boolean;
};

export function allocateCalendarCompanySlots<T extends { id: string }>(items: T[], weekDays: Array<string | null>, getRange: (item: T) => { start: string; end: string }) {
  const visibleDays = weekDays.filter((date): date is string => date !== null);
  const weekStart = visibleDays[0];
  const weekEnd = visibleDays[visibleDays.length - 1];
  if (!weekStart || !weekEnd) return { slotCount: 0, segments: [] as Array<CalendarCompanyWeekSegment<T>> };

  const candidates = items.flatMap((item) => {
    const range = getRange(item);
    if (range.end < weekStart || range.start > weekEnd) return [];
    const start = range.start < weekStart ? weekStart : range.start;
    const end = range.end > weekEnd ? weekEnd : range.end;
    const startColumn = weekDays.indexOf(start);
    const endColumn = weekDays.indexOf(end);
    if (startColumn < 0 || endColumn < startColumn) return [];
    return [{ item, range, startColumn, endColumn, span: endColumn - startColumn + 1 }];
  }).sort((left, right) => {
    const leftProject = left.item.id.startsWith("project-") ? 0 : 1;
    const rightProject = right.item.id.startsWith("project-") ? 0 : 1;
    return leftProject - rightProject || left.startColumn - right.startColumn || right.span - left.span || left.item.id.localeCompare(right.item.id);
  });

  const occupiedBySlot: Array<Set<number>> = [];
  const segments: Array<CalendarCompanyWeekSegment<T>> = [];
  for (const candidate of candidates) {
    let slot = occupiedBySlot.findIndex((occupied) => {
      for (let column = candidate.startColumn; column <= candidate.endColumn; column += 1) if (occupied.has(column)) return false;
      return true;
    });
    if (slot < 0) {
      slot = occupiedBySlot.length;
      occupiedBySlot.push(new Set<number>());
    }
    for (let column = candidate.startColumn; column <= candidate.endColumn; column += 1) occupiedBySlot[slot].add(column);
    segments.push({ item: candidate.item, slot, startColumn: candidate.startColumn, endColumn: candidate.endColumn, isRangeStart: candidate.startColumn === weekDays.indexOf(candidate.range.start), isRangeEnd: candidate.endColumn === weekDays.indexOf(candidate.range.end) });
  }
  return { slotCount: occupiedBySlot.length, segments };
}
