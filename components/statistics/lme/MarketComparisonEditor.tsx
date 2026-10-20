import { getMarketComparisonRows, getMarketComparisonChangeRows, isMarketComparisonValid, type MarketComparisonDraft, type ComparisonChartSnapshot } from "@/lib/lme-market-comparison";
import { MarketComparisonHistory } from "./MarketComparisonHistory";

export function MarketComparisonEditor({ draft, onChange, chartSnapshot }: {
  draft: MarketComparisonDraft;
  onChange: (draft: MarketComparisonDraft) => void;
  chartSnapshot: ComparisonChartSnapshot;
}) {
  const rows = getMarketComparisonRows(draft);
  const inputClass = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm";
  const priceInput = (label: string, value: string, change: (value: string) => void) => (
    <input aria-label={label} type="number" min="0" step="1" value={value} onChange={(event) => change(event.target.value)} className={`${inputClass} text-right font-medium tabular-nums`} />
  );
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div><h2 className="text-base font-bold">계약 단가 비교표</h2><p className="mt-1 text-xs text-slate-500">단위: 원/kg · 후처리 포함 = 압출비 + 도장단가. 이력 저장 후 다시 불러올 수 있습니다. 저장하지 않은 입력값은 새로고침 시 초기화됩니다.</p></div>
    <MarketComparisonHistory draft={{ ...draft, chartSnapshot }} onLoad={onChange}/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-1 text-xs text-slate-600">작성일<input type="date" value={draft.writtenDate} onChange={(event) => onChange({ ...draft, writtenDate: event.target.value })} className={inputClass}/></label>
      <label className="space-y-1 text-xs text-slate-600">업체<input value={draft.supplier} maxLength={40} onChange={(event) => onChange({ ...draft, supplier: event.target.value })} className={inputClass}/></label>
      <label className="space-y-1 text-xs text-slate-600">변경 전 계약<input value={draft.beforeLabel} maxLength={80} onChange={(event) => onChange({ ...draft, beforeLabel: event.target.value })} className={inputClass}/></label>
      <label className="space-y-1 text-xs text-slate-600">변경 후 계약<input value={draft.afterLabel} maxLength={80} onChange={(event) => onChange({ ...draft, afterLabel: event.target.value })} className={inputClass}/></label>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] table-fixed text-sm tabular-nums [&_th]:h-11 [&_th]:font-bold [&_td]:h-12 [&_td]:align-middle [&_tbody_td:nth-child(-n+2)]:text-center [&_tbody_td:nth-child(-n+2)]:font-bold [&_tbody_td:nth-child(-n+2)]:text-slate-900 [&_tbody_td:nth-child(3)]:bg-slate-50 [&_tbody_td:nth-child(4)]:bg-slate-50 [&_tbody_td:nth-child(5)]:border-l-2 [&_tbody_td:nth-child(5)]:border-l-blue-200 [&_tbody_td:nth-child(5)]:bg-blue-50 [&_tbody_td:nth-child(6)]:bg-blue-50 [&_tbody_td:nth-child(n+5)]:text-slate-950 [&_tbody_td:nth-child(n+5)]:font-bold [&_tbody_td:nth-child(n+5)_input]:font-bold [&_tbody_td:nth-child(n+5)_input]:text-slate-950">
      <colgroup><col className="w-[10%]"/><col className="w-[22%]"/>{[0, 1, 2, 3].map((index) => <col key={index} className="w-[17%]"/>)}</colgroup>
      <thead className="bg-slate-50 text-slate-800">
        <tr><th colSpan={2} className="border p-2">작성일: {draft.writtenDate}</th><th colSpan={2} className="border bg-slate-200 p-2 text-slate-800">{draft.beforeLabel}</th><th colSpan={2} className="border border-l-2 border-l-blue-200 bg-blue-100 p-2 text-slate-900">{draft.afterLabel}</th></tr>
        <tr>{["업체", "항목", "단가", "후처리 포함", "단가", "후처리 포함"].map((label, index) => <th key={index} className={`border p-2 ${index >= 4 ? "bg-blue-100 text-slate-900" : index >= 2 ? "bg-slate-200 text-slate-800" : ""} ${index === 4 ? "border-l-2 border-l-blue-200" : ""}`}>{label}</th>)}</tr>
      </thead>
      <tbody>
        <tr><td className="border p-2">{draft.supplier}</td><td className="border p-2">압출비</td><td className="border p-2">{priceInput("변경 전 압출비", draft.beforePrice, (value) => onChange({ ...draft, beforePrice: value }))}</td><td className="border p-2 text-right">-</td><td className="border p-2">{priceInput("변경 후 압출비", draft.afterPrice, (value) => onChange({ ...draft, afterPrice: value }))}</td><td className="border p-2 text-right">-</td></tr>
        {draft.coatings.map((row, index) => {
          const change = (key: "before" | "after", value: string) => onChange({ ...draft, coatings: draft.coatings.map((entry, rowIndex) => rowIndex === index ? { ...entry, [key]: value } : entry) });
          return <tr key={row.name}><td className="border p-2">도장</td><td className="border p-2">{row.name}</td><td className="border p-2">{priceInput(`변경 전 ${row.name} 단가`, row.before, (value) => change("before", value))}</td><td className="border p-2 text-right font-semibold">{rows[index + 1][3]}</td><td className="border p-2">{priceInput(`변경 후 ${row.name} 단가`, row.after, (value) => change("after", value))}</td><td className="border p-2 text-right font-semibold">{rows[index + 1][5]}</td></tr>;
        })}
      </tbody>
    </table></div>
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={draft.showSavings !== false} onChange={(event) => onChange({ ...draft, showSavings: event.target.checked })}/>절감률·절감액 표 표시 (PNG·클립보드에 동일 적용)</label>
    {draft.showSavings !== false && <><div className="max-w-[1000px] overflow-x-auto"><table className="w-full min-w-[640px] text-xs tabular-nums [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_input]:h-7 [&_input]:text-xs">
      <thead className="bg-slate-100"><tr>{["항목", "증감액 (원/kg)", "증감률", "1톤당 비용 차이"].map((label) => <th key={label} className="border p-2">{label}</th>)}</tr></thead>
      <tbody>{getMarketComparisonChangeRows(draft).map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column} className={`border p-2 ${column === 0 ? "font-bold" : "text-right"}`}>{value}</td>)}</tr>)}</tbody>
    </table></div>
    <p className="text-xs text-slate-500">증감은 후처리 포함 단가의 변경 후 − 변경 전입니다. 1톤당 비용 차이는 (변경 전 − 변경 후) × 1,000으로 계산하며, 절감 또는 증가로 표시합니다. 변경 전 0원은 증감률을 표시하지 않습니다.</p></>}
    <label className="block space-y-1 text-sm font-semibold">변경 사유·특이사항<textarea maxLength={2000} rows={3} value={draft.memo ?? ""} onChange={(event) => onChange({ ...draft, memo: event.target.value })} className={inputClass} placeholder="계약량 증가에 따른 단가 인하, 운송비 별도 등"/></label>
    {!isMarketComparisonValid(draft) && <p role="alert" className="text-xs text-red-600">작성일·업체·계약명과 0 이상의 정수 단가를 확인해주세요.</p>}
  </section>;
}
