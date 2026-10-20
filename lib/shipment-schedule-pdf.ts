import { getTaskStatusLabel, normalizeTaskStatus } from "./status.ts";

export type ShipmentScheduleItem = {
  id: number;
  shipmentDate: string;
  projectName: string;
  clientName?: string | null;
  taskName: string;
  shipmentLabel?: string;
  quantity: number | null;
  quantityUnit: string | null;
  memo: string | null;
  status?: string | null;
  processName?: string;
  excluded?: boolean;
  notes?: { id: string; text: string }[];
};

export type ShipmentScheduleOptions = {
  showCalendar: boolean;
  showDetails: boolean;
  includeCheckbox: boolean;
  showQuantity?: boolean;
  showStatus?: boolean;
  paperSize?: "A4" | "A3";
  weekly?: boolean;
  separateDetails?: boolean;
};

export function shipmentStatusLabel(item: ShipmentScheduleItem, today: string) {
  if (normalizeTaskStatus(item.status ?? null) !== "completed" && item.shipmentDate < today) return "지연";
  return getTaskStatusLabel(item.status ?? null);
}

export function filterShipmentScheduleItems(items: ShipmentScheduleItem[], filters: { incompleteOnly: boolean; project: string; process: string }) {
  return items.filter((item) => !item.excluded
    && (!filters.incompleteOnly || normalizeTaskStatus(item.status ?? null) !== "completed")
    && (!filters.project || item.projectName === filters.project)
    && (!filters.process || item.processName === filters.process));
}

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
  return renderShipmentCalendarWeeks(buildShipmentCalendarWeeksForRange(range, items));
}

function renderShipmentCalendarWeeks(weeks: ShipmentCalendarCell[][], options?: ShipmentScheduleOptions, today = "", editable = false) {
  return '<section class="calendar"><div class="weekdays">' + WEEKDAY_LABELS.map((label, index) => '<div class="weekday ' + (index === 0 ? 'sun' : index === 6 ? 'sat' : '') + '">' + label + '</div>').join('') + '</div>' + weeks.map((week) => '<div class="week">' + week.map((cell) => {
    if (cell.day === null) return '<div class="day empty"></div>';
    return '<div class="day"><div class="day-number ' + (cell.isSunday ? 'sun' : cell.isSaturday ? 'sat' : '') + '">' + (cell.dayLabel ?? cell.day) + (editable ? '<button type="button" class="edit-action" data-add="' + cell.key + '" aria-label="' + cell.key + ' 일정 추가">+ 추가</button>' : '') + '</div>' + cell.items.map((item) => '<div class="calendar-item"><strong>' + escapeHtml(item.projectName) + '</strong>' + (item.clientName?.trim() ? '<span>발주처: ' + escapeHtml(item.clientName.trim()) + '</span>' : '') + '<span>' + escapeHtml(item.taskName) + '</span>' + (item.shipmentLabel ? '<span>' + escapeHtml(item.shipmentLabel) + '</span>' : '') + (options?.showQuantity && item.quantity !== null ? '<span>수량 ' + escapeHtml(formatShipmentQuantity(item)) + '</span>' : '') + (options?.showStatus ? '<span class="status">' + escapeHtml(shipmentStatusLabel(item, today)) + '</span>' : '') + (item.memo ? '<span class="memo">' + escapeHtml(item.memo) + '</span>' : '') + (editable ? '<button type="button" class="edit-action" data-edit="' + item.id + '">편집</button>' : '') + '</div>').join('') + '</div>';
  }).join('') + '</div>').join('') + '</section>';
}

function renderDetails(items: ShipmentScheduleItem[], options: ShipmentScheduleOptions, today: string, editable: boolean) {
  const hasQuantity = items.some((item) => item.quantity !== null);
  const columns = 5 + (hasQuantity ? 1 : 0) + (options.includeCheckbox ? 1 : 0) + (options.showStatus ? 1 : 0);
  return '<section class="details"><h2>출고 상세목록</h2><table><thead><tr>' + (options.includeCheckbox ? '<th class="check">체크</th>' : '') + '<th>출고일</th><th>현장명</th><th>발주처</th><th>작업명</th>' + (hasQuantity ? '<th>수량</th>' : '') + (options.showStatus ? '<th>상태</th>' : '') + '<th>전달사항 / 비고</th></tr></thead><tbody>' + (items.map((item) => '<tr>' + (options.includeCheckbox ? '<td class="check">□</td>' : '') + '<td>' + escapeHtml(item.shipmentDate) + '</td><td>' + escapeHtml(item.projectName) + '</td><td>' + escapeHtml(item.clientName?.trim() || '') + '</td><td>' + escapeHtml(item.taskName) + (item.shipmentLabel ? '<br>' + escapeHtml(item.shipmentLabel) : '') + (editable ? '<br><button type="button" class="edit-action" data-edit="' + item.id + '">편집</button>' : '') + '</td>' + (hasQuantity ? '<td>' + (item.quantity === null ? '' : escapeHtml(formatShipmentQuantity(item))) + '</td>' : '') + (options.showStatus ? '<td>' + escapeHtml(shipmentStatusLabel(item, today)) + '</td>' : '') + '<td class="memo">' + escapeHtml(item.memo || '') + '</td></tr>').join('') || '<tr><td colspan="' + columns + '" class="no-data">해당 기간의 출고 일정이 없습니다.</td></tr>') + '</tbody></table></section>';
}

export function createShipmentScheduleFilename(month: string, vendorName: string) {
  const safeVendorName = vendorName.replace(/[\\/:*?"<>|]/g, '_').trim() || '조립업체';
  return month + '_' + safeVendorName + '_출고일정.pdf';
}

export function createShipmentScheduleRangeFilename(range: ShipmentScheduleRange, vendorName: string) {
  return createShipmentScheduleFilename(range.start + '_' + range.end, vendorName);
}

export type ShipmentScheduleDocument = {
  month: string;
  range?: ShipmentScheduleRange;
  vendorName: string;
  printedAt: string;
  items: ShipmentScheduleItem[];
  options: ShipmentScheduleOptions;
};

// Preview and print deliberately share the same markup and scoped styles.
export function shipmentScheduleStyles(options: ShipmentScheduleOptions) {
  return '\n@page { size: ' + (options.paperSize === 'A3' ? 'A3' : 'A4') + ' landscape; margin: 9mm; }\n' + String.raw`
    .shipment-document { box-sizing: border-box; color: #0f172a; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; font-size: 11px; line-height: 1.4; background: white; }
    .shipment-document * { box-sizing: border-box; }
    .shipment-document .sheet + .sheet { break-before: page; margin-top: 24px; }
    .shipment-document header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; gap: 16px; }
    .shipment-document h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .shipment-document .meta { display: grid; grid-template-columns: auto auto; gap: 3px 14px; text-align: right; }
    .shipment-document .weekdays, .shipment-document .week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
    .shipment-document .week { break-inside: avoid; }
    .shipment-document .weekday { padding: 5px; border: 1px solid #cbd5e1; border-bottom: 0; background: #eff6ff; text-align: center; font-weight: 700; }
    .shipment-document .day { min-height: 80px; border: 1px solid #cbd5e1; padding: 4px; min-width: 0; }
    .shipment-document .weekly .day { min-height: 110mm; }
    .shipment-document .day.empty { background: #f8fafc; }
    .shipment-document .day-number { font-weight: 700; margin-bottom: 3px; }
    .shipment-document .sun { color: #dc2626; } .shipment-document .sat { color: #2563eb; }
    .shipment-document .calendar-item { margin-top: 3px; padding: 3px; border-radius: 3px; background: #eff6ff; overflow-wrap: anywhere; break-inside: avoid; }
    .shipment-document .calendar-item strong, .shipment-document .calendar-item span { display: block; }
    .shipment-document .calendar-item span { color: #475569; }
    .shipment-document .status { font-weight: 700; }
    .shipment-document .memo { white-space: pre-wrap; overflow-wrap: anywhere; }
    .shipment-document .details { margin-top: 12px; }
    .shipment-document h2 { margin: 0 0 6px; font-size: 14px; font-weight: 700; }
    .shipment-document table { width: 100%; border-collapse: collapse; }
    .shipment-document th, .shipment-document td { border: 1px solid #94a3b8; padding: 5px 6px; text-align: left; overflow-wrap: anywhere; }
    .shipment-document th { background: #e2e8f0; }
    .shipment-document .check { width: 42px; text-align: center; }
    .shipment-document .no-data { padding: 18px; text-align: center; color: #64748b; }
    .shipment-document .edit-action { color: #1d4ed8; font: inherit; cursor: pointer; padding: 2px 5px; background: white; border: 1px solid #bfdbfe; border-radius: 4px; margin-left: 4px; }
    @media print {
      body { margin: 0; }
      .shipment-document + .shipment-document { break-before: page; }
      .shipment-document .sheet + .sheet { margin-top: 0; }
      .shipment-document thead { display: table-header-group; }
      .shipment-document tr { break-inside: avoid; }
      .shipment-document .edit-action { display: none; }
    }
  `;
}

export function renderShipmentScheduleDocument(input: ShipmentScheduleDocument, editable = false) {
  const items = input.items.filter((item) => !item.excluded).sort((a, b) => a.shipmentDate.localeCompare(b.shipmentDate) || a.projectName.localeCompare(b.projectName, 'ko'));
  const { options } = input;
  const range = input.range ?? getShipmentMonthRange(input.month);
  if (!range || validateShipmentScheduleRange(range)) return '';
  const header = (label: string) => '<header><h1>조립업체 출고 일정표</h1><div class="meta"><b>업체명</b><span>' + escapeHtml(input.vendorName) + '</span><b>출력기간</b><span>' + escapeHtml(label) + '</span><b>출력일</b><span>' + escapeHtml(input.printedAt) + '</span></div></header>';
  const weeks = buildShipmentCalendarWeeksForRange(range, items);
  let pages = '';
  if (options.showCalendar) {
    if (options.weekly) {
      pages = weeks.map((week) => {
        const dates = week.filter((cell) => cell.day !== null).map((cell) => cell.key);
        return '<section class="sheet weekly">' + header(formatShipmentScheduleRange({ start: dates[0], end: dates[dates.length - 1] })) + renderShipmentCalendarWeeks([week], options, input.printedAt, editable) + '</section>';
      }).join('');
    } else {
      pages = '<section class="sheet">' + header(formatShipmentScheduleRange(range)) + renderShipmentCalendarWeeks(weeks, options, input.printedAt, editable) + '</section>';
    }
  }
  if (options.showDetails) {
    const details = renderDetails(items, options, input.printedAt, editable);
    if (!options.showCalendar || options.separateDetails || options.weekly) {
      pages += '<section class="sheet">' + header(formatShipmentScheduleRange(range)) + details + '</section>';
    } else {
      pages = pages.slice(0, -10) + details + '</section>';
    }
  }
  return '<div class="shipment-document">' + pages + '</div>';
}

export function printShipmentSchedulePdf(input: ShipmentScheduleDocument, additional: ShipmentScheduleDocument[] = []) {
  const popup = window.open('', '_blank', 'width=1200,height=850');
  if (!popup) throw new Error('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.');
  popup.opener = null;
  const name = additional.length ? '여러업체' : input.vendorName;
  const filename = input.range ? createShipmentScheduleRangeFilename(input.range, name) : createShipmentScheduleFilename(input.month, name);
  popup.document.open();
  popup.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + escapeHtml(filename.replace(/\.pdf$/, '')) + '</title><style>' + shipmentScheduleStyles(input.options) + '</style></head><body>' + [input, ...additional].map((doc) => renderShipmentScheduleDocument(doc)).join('') + '</body></html>');
  popup.document.close();
  popup.focus();
  void popup.document.fonts.ready.then(() => { if (!popup.closed) popup.print(); });
}

export { WEEKDAY_LABELS };
