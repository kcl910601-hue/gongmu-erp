export type ShipmentScheduleItem = {
  id: number;
  shipmentDate: string;
  projectName: string;
  taskName: string;
  quantity: number | null;
  quantityUnit: string | null;
  memo: string | null;
};

export type ShipmentScheduleOptions = {
  showCalendar: boolean;
  showDetails: boolean;
  includeCheckbox: boolean;
};

export type ShipmentScheduleRange = {
  start: string;
  end: string;
};

export type ShipmentCalendarCell = {
  key: string;
  day: number | null;
  dayLabel?: string;
  isSunday: boolean;
  isSaturday: boolean;
  items: ShipmentScheduleItem[];
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_CALENDAR_ITEMS = 3;

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseLocalDate(value: string) {
  if (!LOCAL_DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function getShipmentMonthRange(month: string): ShipmentScheduleRange | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return { start: `${month}-01`, end: localDateString(new Date(year, monthNumber, 0)) };
}

export function validateShipmentScheduleRange(range: ShipmentScheduleRange) {
  if (!range.start) return "시작일을 선택해 주세요.";
  if (!range.end) return "종료일을 선택해 주세요.";
  if (!parseLocalDate(range.start) || !parseLocalDate(range.end)) return "올바른 출력 기간을 선택해 주세요.";
  if (range.start > range.end) return "종료일은 시작일 이후로 선택해 주세요.";
  return null;
}

export function formatShipmentScheduleRange(range: ShipmentScheduleRange) {
  return `${range.start.replaceAll("-", ".")} ~ ${range.end.replaceAll("-", ".")}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatShipmentQuantity(item: ShipmentScheduleItem) {
  if (item.quantity === null) return "-";
  const quantity = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 }).format(item.quantity);
  return item.quantityUnit ? `${quantity}${item.quantityUnit}` : quantity;
}

export function buildShipmentCalendarWeeks(month: string, items: ShipmentScheduleItem[]) {
  const safeItems = Array.isArray(items) ? items : [];
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const lastDay = new Date(year, monthNumber, 0);
  const cells: ShipmentCalendarCell[] = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    cells.push({ key: `empty-start-${index}`, day: null, isSunday: false, isSaturday: false, items: [] });
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const weekday = new Date(year, monthNumber - 1, day).getDay();
    cells.push({
      key: date,
      day,
      isSunday: weekday === 0,
      isSaturday: weekday === 6,
      items: safeItems.filter((item) => item.shipmentDate === date),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `empty-end-${cells.length}`, day: null, isSunday: false, isSaturday: false, items: [] });
  }

  const weeks: ShipmentCalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

export function buildShipmentCalendarWeeksForRange(range: ShipmentScheduleRange, items: ShipmentScheduleItem[]) {
  if (validateShipmentScheduleRange(range)) return [];
  const safeItems = Array.isArray(items) ? items : [];
  const rangeStart = parseLocalDate(range.start)!;
  const rangeEnd = parseLocalDate(range.end)!;
  const gridStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() - rangeStart.getDay());
  const gridEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() + (6 - rangeEnd.getDay()));
  const cells: ShipmentCalendarCell[] = [];

  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
    const date = localDateString(cursor);
    const inRange = date >= range.start && date <= range.end;
    cells.push(inRange ? {
      key: date,
      day: cursor.getDate(),
      dayLabel: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      isSunday: cursor.getDay() === 0,
      isSaturday: cursor.getDay() === 6,
      items: safeItems.filter((item) => item.shipmentDate === date),
    } : { key: `outside-${date}`, day: null, isSunday: false, isSaturday: false, items: [] });
  }

  const weeks: ShipmentCalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

export function renderShipmentCalendar(month: string, items: ShipmentScheduleItem[]) {
  return renderShipmentCalendarWeeks(buildShipmentCalendarWeeks(month, items));
}

export function renderShipmentCalendarRange(range: ShipmentScheduleRange, items: ShipmentScheduleItem[]) {
  const weeks = buildShipmentCalendarWeeksForRange(range, items);
  return renderShipmentCalendarWeeks(weeks);
}

function renderShipmentCalendarWeeks(weeks: ShipmentCalendarCell[][]) {
  return `<section class="calendar"><div class="weekdays">${WEEKDAY_LABELS.map((label, index) => `<div class="weekday ${index === 0 ? "sun" : index === 6 ? "sat" : ""}">${label}</div>`).join("")}</div>${weeks.map((week) => `<div class="week">${week.map((cell) => {
    if (cell.day === null) return `<div class="day empty"></div>`;
    const visibleItems = cell.items.slice(0, MAX_CALENDAR_ITEMS);
    const remainingCount = cell.items.length - visibleItems.length;
    return `<div class="day"><div class="day-number ${cell.isSunday ? "sun" : cell.isSaturday ? "sat" : ""}">${cell.dayLabel ?? cell.day}</div>${visibleItems.map((item) => `<div class="calendar-item"><strong>${escapeHtml(item.projectName)}</strong><span>${escapeHtml(item.taskName)}</span></div>`).join("")}${remainingCount > 0 ? `<div class="more">외 ${remainingCount}건</div>` : ""}</div>`;
  }).join("")}</div>`).join("")}</section>`;
}

function renderDetails(items: ShipmentScheduleItem[], includeCheckbox: boolean, emptyPeriodLabel = "월") {
  const safeItems = Array.isArray(items) ? items : [];
  return `<section class="details"><h2>출고 상세목록</h2><table><thead><tr>${includeCheckbox ? "<th class=\"check\">체크</th>" : ""}<th>출고일</th><th>현장명</th><th>작업명</th><th>수량</th><th>비고</th></tr></thead><tbody>${safeItems.map((item) => `<tr>${includeCheckbox ? "<td class=\"check\">□</td>" : ""}<td>${escapeHtml(item.shipmentDate)}</td><td>${escapeHtml(item.projectName)}</td><td>${escapeHtml(item.taskName)}</td><td>${escapeHtml(formatShipmentQuantity(item))}</td><td>${escapeHtml(item.memo || "")}</td></tr>`).join("") || `<tr><td colspan="${includeCheckbox ? 6 : 5}" class="no-data">해당 ${emptyPeriodLabel}의 출고 일정이 없습니다.</td></tr>`}</tbody></table></section>`;
}

export function createShipmentScheduleFilename(month: string, vendorName: string) {
  const safeVendorName = vendorName.replace(/[\\/:*?"<>|]/g, "_").trim() || "조립업체";
  return `${month}_${safeVendorName}_출고일정.pdf`;
}

export function createShipmentScheduleRangeFilename(range: ShipmentScheduleRange, vendorName: string) {
  const safeVendorName = vendorName.replace(/[\\/:*?"<>|]/g, "_").trim() || "조립업체";
  return `${range.start}_${range.end}_${safeVendorName}_출고일정.pdf`;
}

export function printShipmentSchedulePdf(input: {
  month: string;
  range?: ShipmentScheduleRange;
  vendorName: string;
  printedAt: string;
  items: ShipmentScheduleItem[];
  options: ShipmentScheduleOptions;
}) {
  const popup = window.open("", "_blank", "width=1200,height=850");
  if (!popup) throw new Error("팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.");
  popup.opener = null;

  const filename = input.range ? createShipmentScheduleRangeFilename(input.range, input.vendorName) : createShipmentScheduleFilename(input.month, input.vendorName);
  const rangeLabel = input.range ? formatShipmentScheduleRange(input.range) : input.month;
  const heading = input.range ? "조립업체 기간 출고 일정표" : "조립업체 월간 출고 일정표";
  const sortedItems = [...(Array.isArray(input.items) ? input.items : [])].sort((a, b) => a.shipmentDate.localeCompare(b.shipmentDate) || a.projectName.localeCompare(b.projectName, "ko"));
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(filename.replace(/\.pdf$/, ""))}</title><style>
    @page { size: A4 landscape; margin: 9mm; }
    * { box-sizing: border-box; } body { margin: 0; color: #0f172a; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; font-size: 10px; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; }
    h1 { margin: 0; font-size: 22px; } .meta { display: grid; grid-template-columns: auto auto; gap: 3px 14px; text-align: right; }
    .weekdays, .week { display: grid; grid-template-columns: repeat(7, 1fr); } .week { break-inside: avoid; page-break-inside: avoid; } .weekday { padding: 5px; border: 1px solid #cbd5e1; border-bottom: 0; background: #eff6ff; text-align: center; font-weight: 700; }
    .day { min-height: 72px; border: 1px solid #cbd5e1; padding: 4px; overflow: hidden; } .day.empty { background: #f8fafc; } .day-number { font-weight: 700; margin-bottom: 3px; }
    .sun { color: #dc2626; } .sat { color: #2563eb; } .calendar-item { margin-top: 2px; padding: 2px 3px; border-radius: 3px; background: #eff6ff; white-space: nowrap; overflow: hidden; }
    .calendar-item strong, .calendar-item span { display: block; overflow: hidden; text-overflow: ellipsis; } .calendar-item span { color: #475569; } .more { margin-top: 3px; color: #475569; font-weight: 700; }
    .details { margin-top: 12px; break-before: auto; } h2 { margin: 0 0 6px; font-size: 14px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #94a3b8; padding: 5px 6px; text-align: left; } th { background: #e2e8f0; } .check { width: 42px; text-align: center; } .no-data { padding: 18px; text-align: center; color: #64748b; }
    @media print { .details { page-break-inside: auto; } thead { display: table-header-group; } tr { page-break-inside: avoid; } }
  </style></head><body><header><div><h1>${heading}</h1></div><div class="meta"><b>업체명</b><span>${escapeHtml(input.vendorName)}</span><b>${input.range ? "출력기간" : "출력월"}</b><span>${escapeHtml(rangeLabel)}</span><b>출력일</b><span>${escapeHtml(input.printedAt)}</span></div></header>${input.options.showCalendar ? input.range ? renderShipmentCalendarRange(input.range, sortedItems) : renderShipmentCalendar(input.month, sortedItems) : ""}${input.options.showDetails ? renderDetails(sortedItems, input.options.includeCheckbox, input.range ? "기간" : "월") : ""}</body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

export { MAX_CALENDAR_ITEMS, WEEKDAY_LABELS };
