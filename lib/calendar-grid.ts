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
