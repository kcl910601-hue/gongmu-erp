import {
  buildShipmentCalendarWeeks,
  formatShipmentQuantity,
  MAX_CALENDAR_ITEMS,
  WEEKDAY_LABELS,
  type ShipmentScheduleItem,
  type ShipmentScheduleOptions,
} from "@/lib/shipment-schedule-pdf";

type Props = {
  month: string;
  vendorName: string;
  printedAt: string;
  items: ShipmentScheduleItem[];
  options: ShipmentScheduleOptions;
};

export function ShipmentSchedulePreview({ month, vendorName, printedAt, items = [], options }: Props) {
  const safeItems = Array.isArray(items) ? items : [];
  const sortedItems = [...safeItems].sort((a, b) => a.shipmentDate.localeCompare(b.shipmentDate) || a.projectName.localeCompare(b.projectName, "ko"));
  const weeks = buildShipmentCalendarWeeks(month, sortedItems);

  return (
    <div className="mx-auto min-w-[900px] bg-white p-8 text-[11px] text-slate-900 shadow-sm">
      <header className="mb-3 flex items-end justify-between border-b-2 border-blue-900 pb-2">
        <h2 className="text-2xl font-bold">조립업체 월간 출고 일정표</h2>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-right">
          <dt className="font-bold">업체명</dt><dd>{vendorName}</dd>
          <dt className="font-bold">출력월</dt><dd>{month}</dd>
          <dt className="font-bold">출력일</dt><dd>{printedAt}</dd>
        </dl>
      </header>

      {options.showCalendar && (
        <section>
          <div className="grid grid-cols-7">
            {(Array.isArray(WEEKDAY_LABELS) ? WEEKDAY_LABELS : []).map((label, index) => <div key={label} className={`border border-b-0 border-slate-300 bg-blue-50 p-1 text-center font-bold ${index === 0 ? "text-red-600" : index === 6 ? "text-blue-600" : ""}`}>{label}</div>)}
          </div>
          {(Array.isArray(weeks) ? weeks : []).map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7">
              {(Array.isArray(week) ? week : []).map((cell) => (
                <div key={cell.key} className={`min-h-24 overflow-hidden border border-slate-300 p-1 ${cell.day === null ? "bg-slate-50" : ""}`}>
                  {cell.day !== null && <><div className={`mb-1 font-bold ${cell.isSunday ? "text-red-600" : cell.isSaturday ? "text-blue-600" : ""}`}>{cell.day}</div>{(Array.isArray(cell.items) ? cell.items : []).slice(0, MAX_CALENDAR_ITEMS).map((item) => <div key={item.id} className="mt-0.5 rounded bg-blue-50 px-1 py-0.5"><strong className="block truncate">{item.projectName}</strong><span className="block truncate text-slate-600">{item.taskName}</span></div>)}{(Array.isArray(cell.items) ? cell.items : []).length > MAX_CALENDAR_ITEMS && <div className="mt-1 font-bold text-slate-600">외 {(Array.isArray(cell.items) ? cell.items : []).length - MAX_CALENDAR_ITEMS}건</div>}</>}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {options.showDetails && (
        <section className="mt-4">
          <h3 className="mb-2 text-sm font-bold">출고 상세목록</h3>
          <table className="w-full border-collapse">
            <thead><tr className="bg-slate-200">{options.includeCheckbox && <th className="w-12 border border-slate-400 p-1 text-center">체크</th>}<th className="border border-slate-400 p-1 text-left">출고일</th><th className="border border-slate-400 p-1 text-left">현장명</th><th className="border border-slate-400 p-1 text-left">작업명</th><th className="border border-slate-400 p-1 text-left">수량</th><th className="border border-slate-400 p-1 text-left">비고</th></tr></thead>
            <tbody>{sortedItems.length > 0 ? sortedItems.map((item) => <tr key={item.id}>{options.includeCheckbox && <td className="border border-slate-400 p-1 text-center">□</td>}<td className="border border-slate-400 p-1">{item.shipmentDate}</td><td className="border border-slate-400 p-1">{item.projectName}</td><td className="border border-slate-400 p-1">{item.taskName}</td><td className="border border-slate-400 p-1">{formatShipmentQuantity(item)}</td><td className="border border-slate-400 p-1">{item.memo || ""}</td></tr>) : <tr><td colSpan={options.includeCheckbox ? 6 : 5} className="border border-slate-400 p-5 text-center text-slate-500">해당 월의 출고 일정이 없습니다.</td></tr>}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
