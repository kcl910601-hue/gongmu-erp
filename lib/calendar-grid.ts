export function getSundayFirstMonthDays(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const firstDate = new Date(year, month - 1, 1);
  const totalDays = new Date(year, month, 0).getDate();
  const days: Array<string | null> = Array.from({ length: firstDate.getDay() }, () => null);

  for (let day = 1; day <= totalDays; day += 1) {
    days.push(`${monthValue}-${String(day).padStart(2, "0")}`);
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export const MONTH_WEEK_LAYOUT = {
  dateHeaderHeight: 52,
  companyLaneHeight: 34,
  personalCardHeight: 64,
  personalCardGap: 4,
  sectionGap: 12,
  bottomPadding: 12,
  minHeight: 140,
} as const;

export function getCompanyAreaHeight(laneCount: number) { return Math.max(0, laneCount) * MONTH_WEEK_LAYOUT.companyLaneHeight; }
export function getPersonalAreaHeight(cardCount: number) {
  const count = Math.max(0, cardCount);
  return count * MONTH_WEEK_LAYOUT.personalCardHeight + Math.max(0, count - 1) * MONTH_WEEK_LAYOUT.personalCardGap;
}

export function getMonthWeekLayout(input: { companyLaneCount: number; personalItemCount: number; showCompany: boolean; showPersonalCards: boolean }) {
  const companyAreaHeight = input.showCompany ? getCompanyAreaHeight(input.companyLaneCount) : 0;
  const personalAreaHeight = input.showPersonalCards ? getPersonalAreaHeight(input.personalItemCount) : 0;
  const personalAreaTop = MONTH_WEEK_LAYOUT.dateHeaderHeight + companyAreaHeight + (personalAreaHeight > 0 ? MONTH_WEEK_LAYOUT.sectionGap : 0);
  const requiredHeight = personalAreaTop + personalAreaHeight + MONTH_WEEK_LAYOUT.bottomPadding;
  return { companyAreaHeight, personalAreaHeight, personalAreaTop, requiredWeekHeight: Math.max(MONTH_WEEK_LAYOUT.minHeight, requiredHeight) };
}

export function getRequiredMonthWeekHeight(input: { companyLaneCount: number; personalItemCount: number; showCompany: boolean; showPersonalCards: boolean }) {
  return getMonthWeekLayout(input).requiredWeekHeight;
}
