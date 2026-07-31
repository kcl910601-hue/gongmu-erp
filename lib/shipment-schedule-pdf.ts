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

export type ShipmentCalendarCell = {
  key: string;
  day: number | null;
  isSunday: boolean;
  isSaturday: boolean;
  items: ShipmentScheduleItem[];
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_CALENDAR_ITEMS = 3;

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

export function renderShipmentCalendar(month: string, items: ShipmentScheduleItem[]) {
  const weeks = buildShipmentCalendarWeeks(month, items);
  return `<section class="calendar"><div class="weekdays">${WEEKDAY_LABELS.map((label, index) => `<div class="weekday ${index === 0 ? "sun" : index === 6 ? "sat" : ""}">${label}</div>`).join("")}</div>${weeks.map((week) => `<div class="week">${week.map((cell) => {
    if (cell.day === null) return `<div class="day empty"></div>`;
    const visibleItems = cell.items.slice(0, MAX_CALENDAR_ITEMS);
    const remainingCount = cell.items.length - visibleItems.length;
    return `<div class="day"><div class="day-number ${cell.isSunday ? "sun" : cell.isSaturday ? "sat" : ""}">${cell.day}</div>${visibleItems.map((item) => `<div class="calendar-item"><strong>${escapeHtml(item.projectName)}</strong><span>${escapeHtml(item.taskName)}</span></div>`).join("")}${remainingCount > 0 ? `<div class="more">외 ${remainingCount}건</div>` : ""}</div>`;
  }).join("")}</div>`).join("")}</section>`;
}

function renderDetails(items: ShipmentScheduleItem[], includeCheckbox: boolean) {
  const safeItems = Array.isArray(items) ? items : [];
  return `<section class="details"><h2>출고 상세목록</h2><table><thead><tr>${includeCheckbox ? "<th class=\"check\">체크</th>" : ""}<th>출고일</th><th>현장명</th><th>작업명</th><th>수량</th><th>비고</th></tr></thead><tbody>${safeItems.map((item) => `<tr>${includeCheckbox ? "<td class=\"check\">□</td>" : ""}<td>${escapeHtml(item.shipmentDate)}</td><td>${escapeHtml(item.projectName)}</td><td>${escapeHtml(item.taskName)}</td><td>${escapeHtml(formatShipmentQuantity(item))}</td><td>${escapeHtml(item.memo || "")}</td></tr>`).join("") || `<tr><td colspan="${includeCheckbox ? 6 : 5}" class="no-data">해당 월의 출고 일정이 없습니다.</td></tr>`}</tbody></table></section>`;
}

export function createShipmentScheduleFilename(month: string, vendorName: string) {
  const safeVendorName = vendorName.replace(/[\\/:*?"<>|]/g, "_").trim() || "조립업체";
  return `${month}_${safeVendorName}_출고일정.pdf`;
}

export function printShipmentSchedulePdf(input: {
  month: string;
  vendorName: string;
  printedAt: string;
  items: ShipmentScheduleItem[];
  options: ShipmentScheduleOptions;
}) {
  const popup = window.open("", "_blank", "width=1200,height=850");
  if (!popup) throw new Error("팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.");
  popup.opener = null;

  const filename = createShipmentScheduleFilename(input.month, input.vendorName);
  const sortedItems = [...(Array.isArray(input.items) ? input.items : [])].sort((a, b) => a.shipmentDate.localeCompare(b.shipmentDate) || a.projectName.localeCompare(b.projectName, "ko"));
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(filename.replace(/\.pdf$/, ""))}</title><style>
    @page { size: A4 landscape; margin: 9mm; }
    * { box-sizing: border-box; } body { margin: 0; color: #0f172a; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; font-size: 10px; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; }
    h1 { margin: 0; font-size: 22px; } .meta { display: grid; grid-template-columns: auto auto; gap: 3px 14px; text-align: right; }
    .weekdays, .week { display: grid; grid-template-columns: repeat(7, 1fr); } .weekday { padding: 5px; border: 1px solid #cbd5e1; border-bottom: 0; background: #eff6ff; text-align: center; font-weight: 700; }
    .day { min-height: 72px; border: 1px solid #cbd5e1; padding: 4px; overflow: hidden; } .day.empty { background: #f8fafc; } .day-number { font-weight: 700; margin-bottom: 3px; }
    .sun { color: #dc2626; } .sat { color: #2563eb; } .calendar-item { margin-top: 2px; padding: 2px 3px; border-radius: 3px; background: #eff6ff; white-space: nowrap; overflow: hidden; }
    .calendar-item strong, .calendar-item span { display: block; overflow: hidden; text-overflow: ellipsis; } .calendar-item span { color: #475569; } .more { margin-top: 3px; color: #475569; font-weight: 700; }
    .details { margin-top: 12px; break-before: auto; } h2 { margin: 0 0 6px; font-size: 14px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #94a3b8; padding: 5px 6px; text-align: left; } th { background: #e2e8f0; } .check { width: 42px; text-align: center; } .no-data { padding: 18px; text-align: center; color: #64748b; }
    @media print { .details { page-break-inside: auto; } thead { display: table-header-group; } tr { page-break-inside: avoid; } }
  </style></head><body><header><div><h1>조립업체 월간 출고 일정표</h1></div><div class="meta"><b>업체명</b><span>${escapeHtml(input.vendorName)}</span><b>출력월</b><span>${escapeHtml(input.month)}</span><b>출력일</b><span>${escapeHtml(input.printedAt)}</span></div></header>${input.options.showCalendar ? renderShipmentCalendar(input.month, sortedItems) : ""}${input.options.showDetails ? renderDetails(sortedItems, input.options.includeCheckbox) : ""}</body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

export { MAX_CALENDAR_ITEMS, WEEKDAY_LABELS };
