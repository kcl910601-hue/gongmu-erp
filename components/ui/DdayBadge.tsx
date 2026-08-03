import { getDday } from "@/lib/dday";

const colorClass = {
  blue: "border-blue-200 bg-blue-100 text-blue-700",
  green: "border-emerald-200 bg-emerald-100 text-emerald-700",
  orange: "border-orange-200 bg-orange-100 text-orange-700",
  red: "border-red-200 bg-red-100 text-red-700",
  darkRed: "border-red-800 bg-red-700 text-white",
} as const;

export function DdayBadge({ targetDate, today, className = "" }: { targetDate: string | Date | null | undefined; today?: string | Date; className?: string }) {
  if (!targetDate) return null;
  const dday = getDday(targetDate, today);
  if (!dday) return null;
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colorClass[dday.color]} ${className}`}>{dday.label}</span>;
}
