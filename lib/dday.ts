import { differenceInCalendarDays, startOfDay } from "date-fns";

export type DdayColor = "blue" | "green" | "orange" | "red" | "darkRed";
export type DdayResult = { diff: number; label: string; color: DdayColor; isExpired: boolean; isToday: boolean };

function parseCalendarDate(value: string | Date) {
  if (value instanceof Date) return startOfDay(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return startOfDay(new Date(Number(year), Number(month) - 1, Number(day)));
  }
  return startOfDay(new Date(value));
}

export function getDday(targetDate: string | Date, today: string | Date = new Date()): DdayResult | null {
  const target = parseCalendarDate(targetDate);
  const normalizedToday = parseCalendarDate(today);
  if (Number.isNaN(target.getTime()) || Number.isNaN(normalizedToday.getTime())) return null;

  const diff = differenceInCalendarDays(target, normalizedToday);
  const isExpired = diff < 0;
  const isToday = diff === 0;
  const label = isToday ? "D-DAY" : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
  const color: DdayColor = isExpired ? "darkRed" : isToday ? "red" : diff <= 2 ? "orange" : diff <= 6 ? "green" : "blue";
  return { diff, label, color, isExpired, isToday };
}
