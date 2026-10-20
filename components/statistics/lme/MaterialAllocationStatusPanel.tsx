"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { MATERIAL_USAGE_REQUESTS_CHANGED_EVENT } from "@/lib/collaboration-events";
import { formatNumber } from "@/lib/lme";
import { normalizeMaterialTons, type MaterialUsageRequest } from "@/lib/material-usage-requests";
import { toast } from "@/lib/toast";

function targetKey(row: MaterialUsageRequest) {
  return row.allocation_type === "project" ? `project:${row.project_id}` : `factory:${row.destination_name ?? ""}`;
}

function targetName(row: MaterialUsageRequest) {
  return row.allocation_type === "project"
    ? row.project_name ?? `현장 #${row.project_id}`
    : `공장재고 · ${row.destination_name ?? "미지정"}`;
}

function excess(row: MaterialUsageRequest) {
  return normalizeMaterialTons(Math.max(Number(row.allocated_tons) - Number(row.quantity_tons), 0));
}

const kg = (tons: number) => `${formatNumber(tons * 1_000, 1)} kg`;
const rate = (requested: number, excessTons: number) => requested > 0 ? `${formatNumber(excessTons / requested * 100, 1)}%` : "-";

function detailRows(rows: MaterialUsageRequest[], onlyExcess: boolean) {
  return rows.filter(row => !onlyExcess || excess(row) > 0).sort((a, b) => a.usage_date.localeCompare(b.usage_date) || (a.purchase_order_no ?? "").localeCompare(b.purchase_order_no ?? ""));
}

type MonthlyGroup = {
  key: string;
  month: string;
  projectCode: string;
  name: string;
  requested: number;
  allocated: number;
  unallocated: number;
  excess: number;
  rows: MaterialUsageRequest[];
};

const sortColumns = [
  { key: "month", label: "기준월" },
  { key: "projectCode", label: "현장코드" },
  { key: "name", label: "현장" },
  { key: "requested", label: "발주량" },
  { key: "allocated", label: "배정량 (예정+확정)" },
  { key: "unallocated", label: "미배정량" },
  { key: "excess", label: "초과량" },
  { key: "excessRate", label: "초과율" },
] as const;
type SortKey = (typeof sortColumns)[number]["key"];

function sortValue(group: MonthlyGroup, key: SortKey): string | number | null {
  if (key === "excessRate") return group.requested > 0 ? group.excess / group.requested : null;
  return group[key];
}

export function MaterialAllocationStatusPanel() {
  const [rows, setRows] = useState<MaterialUsageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [month, setMonth] = useState("");
  const [periodMode, setPeriodMode] = useState<"month" | "range">("month");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const invalidRange = periodMode === "range" && Boolean(startMonth && endMonth && startMonth > endMonth);
  const [target, setTarget] = useState("");
  const [onlyExcess, setOnlyExcess] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "month", direction: "desc" });
  const [excludeFactory, setExcludeFactory] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/statistics/lme/usage-requests", { cache: "no-store", signal: controller.signal });
        const result = await response.json() as { requests?: MaterialUsageRequest[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "배정 현황을 불러오지 못했습니다.");
        if (!controller.signal.aborted) setRows((result.requests ?? []).filter(row => row.status === "active" && row.material_code === "AL" && (row.allocation_type === "project" || row.allocation_type === "factory")));
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "배정 현황을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const reload = () => setRevision(value => value + 1);
    window.addEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, reload);
  }, []);

  const filteredRows = useMemo(() => rows.filter(row => !excludeFactory || row.allocation_type !== "factory"), [rows, excludeFactory]);
  const targets = useMemo(() => [...new Map(filteredRows.map(row => [targetKey(row), targetName(row)])).entries()].sort((a, b) => a[1].localeCompare(b[1], "ko")), [filteredRows]);
  const groups = useMemo(() => {
    if (invalidRange) return [];
    const grouped = new Map<string, MonthlyGroup>();
    for (const row of filteredRows) {
      const usageMonth = row.usage_date.slice(0, 7);
      const outsidePeriod = periodMode === "month"
        ? Boolean(month && usageMonth !== month)
        : Boolean((startMonth && usageMonth < startMonth) || (endMonth && usageMonth > endMonth));
      if (outsidePeriod || (target && targetKey(row) !== target)) continue;
      const key = JSON.stringify([usageMonth, targetKey(row)]);
      const group = grouped.get(key) ?? { key, month: usageMonth, projectCode: row.allocation_type === "project" ? row.project_code ?? "-" : "-", name: targetName(row), requested: 0, allocated: 0, unallocated: 0, excess: 0, rows: [] };
      const requested = Number(row.quantity_tons);
      const allocated = Number(row.allocated_tons);
      group.requested = normalizeMaterialTons(group.requested + requested);
      group.allocated = normalizeMaterialTons(group.allocated + allocated);
      group.unallocated = normalizeMaterialTons(group.unallocated + Math.max(requested - allocated, 0));
      group.excess = normalizeMaterialTons(group.excess + excess(row));
      group.rows.push(row);
      grouped.set(key, group);
    }
    return [...grouped.values()].filter(group => !onlyExcess || group.excess > 0).sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      // Unavailable percentages stay last in both directions.
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      const difference = typeof left === "number" && typeof right === "number"
        ? left - right : String(left ?? "").localeCompare(String(right ?? ""), "ko", { numeric: true });
      return difference * (sort.direction === "asc" ? 1 : -1)
        || b.month.localeCompare(a.month) || a.name.localeCompare(b.name, "ko") || a.key.localeCompare(b.key);
    });
  }, [filteredRows, month, periodMode, startMonth, endMonth, invalidRange, target, onlyExcess, sort]);

  function changeSort(key: SortKey) {
    setSort(previous => ({ key, direction: previous.key === key
      ? previous.direction === "asc" ? "desc" : "asc"
      : key === "name" || key === "projectCode" ? "asc" : "desc" }));
  }

  async function downloadExcel() {
    if (loading || error || invalidRange || exporting || groups.length === 0) return;
    setExporting(true);
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const workbook = XLSX.utils.book_new();
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const period = periodMode === "month" ? month || "전체" : `${startMonth || "제한 없음"} ~ ${endMonth || "제한 없음"}`;
      const filters = `사용월: ${period} / 현장: ${targets.find(([key]) => key === target)?.[1] ?? "전체"} / ${onlyExcess ? "초과 건만" : "전체 발주"} / ${excludeFactory ? "공장 재고 제외" : "공장 재고 포함"} / 정렬: ${sortColumns.find(column => column.key === sort.key)?.label} ${sort.direction === "asc" ? "오름차순" : "내림차순"}`;
      const numericKg = (tons: number) => Math.round(tons * 10_000) / 10;
      const ratio = (requested: number, excessTons: number) => requested > 0 ? excessTons / requested : "-";
      const sheets = [
        {
          name: "현장별 월별 요약",
          headers: ["기준월", "현장코드", "현장", "발주량 (kg)", "배정량 (예정+확정 kg)", "미배정량 (kg)", "초과량 (kg)", "초과율"],
          widths: [14, 18, 40, 18, 26, 18, 18, 14],
          excessColumn: 6,
          values: groups.map(group => [group.month, group.projectCode, group.name, numericKg(group.requested), numericKg(group.allocated), numericKg(group.unallocated), numericKg(group.excess), ratio(group.requested, group.excess)]),
        },
        {
          name: "발주 상세",
          headers: ["기준월", "현장코드", "현장", "발주번호", "사용구분 / 차수", "사용일", "발주량 (kg)", "배정량 (예정+확정 kg)", "초과량 (kg)", "초과율"],
          widths: [14, 18, 40, 24, 24, 14, 18, 26, 18, 14],
          excessColumn: 8,
          values: groups.flatMap(group => detailRows(group.rows, onlyExcess).map(row => [group.month, group.projectCode, group.name, row.purchase_order_no ?? "발주번호 없음", row.group_name ?? "구분 없음", row.usage_date, numericKg(Number(row.quantity_tons)), numericKg(Number(row.allocated_tons)), numericKg(excess(row)), ratio(Number(row.quantity_tons), excess(row))])),
        },
      ];
      for (const entry of sheets) {
        const data = [
          [entry.name],
          [`출력일: ${date} / ${filters}`],
          ["AL · 현재 배정 상태 · 취소 제외 · 초과율 = 발주별 초과량 합계 ÷ 발주량 × 100"],
          [onlyExcess ? "요약은 초과가 있는 현장·월의 전체 발주 합계, 상세는 초과 발주만 표시합니다." : "요약과 상세 모두 조회 조건에 맞는 전체 발주를 표시합니다."],
          entry.headers,
          ...entry.values,
        ];
        const sheet = XLSX.utils.aoa_to_sheet(data);
        sheet["!cols"] = entry.widths.map(wch => ({ wch }));
        sheet["!merges"] = [0, 1, 2, 3].map(r => ({ s: { r, c: 0 }, e: { r, c: entry.headers.length - 1 } }));
        sheet["!autofilter"] = { ref: `A5:${XLSX.utils.encode_col(entry.headers.length - 1)}${data.length}` };
        sheet["!rows"] = [{ hpt: 28 }, { hpt: 38 }, { hpt: 28 }, { hpt: 28 }, { hpt: 32 }];
        for (let r = 0; r < data.length; r += 1) {
          for (let c = 0; c < entry.headers.length; c += 1) {
            const cell = sheet[XLSX.utils.encode_cell({ r, c })];
            if (!cell) continue;
            cell.s = { font: { name: "맑은 고딕", sz: 10, color: { rgb: "334155" } }, alignment: { vertical: "center", wrapText: true } };
            if (r === 0 || r === 4) cell.s = { ...cell.s, font: { name: "맑은 고딕", sz: r === 0 ? 16 : 10, bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E3A5F" } } };
            if (r >= 5 && cell.t === "n") cell.z = c === entry.headers.length - 1 ? "0.0%" : "#,##0.0";
            if (r >= 5 && (c === entry.excessColumn || c === entry.headers.length - 1) && typeof cell.v === "number" && cell.v > 0) cell.s.font = { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "DC2626" } };
          }
        }
        XLSX.utils.book_append_sheet(workbook, sheet, entry.name);
      }
      XLSX.writeFile(workbook, `현장별_배정현황_${date}.xlsx`, { compression: true });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "엑셀을 다운로드하지 못했습니다.");
    } finally {
      setExporting(false);
    }
  }

  function toggle(key: string) {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold">현장별 배정 현황</h2><p className="mt-1 text-xs text-slate-500">AL · 사용일 기준 월별 집계 · 배정량은 예정 + 확정이며 취소 건은 제외합니다.</p></div>
      <div className="flex gap-2"><Button variant="outline" disabled={loading || Boolean(error) || invalidRange || exporting || groups.length === 0} onClick={() => void downloadExcel()}>{exporting ? "엑셀 생성 중…" : "엑셀 다운로드"}</Button><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>새로고침</Button></div>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-xs font-semibold text-slate-600"><span className="block">조회 방식</span><select value={periodMode} onChange={event => setPeriodMode(event.target.value === "range" ? "range" : "month")} className="h-9 rounded-lg border px-3"><option value="month">사용월</option><option value="range">월 구간</option></select></label>
      {periodMode === "month" ? <label className="space-y-1 text-xs font-semibold text-slate-600"><span className="block">사용월 (빈칸: 전체)</span><input type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-9 rounded-lg border px-3" /></label> : <>
        <label className="space-y-1 text-xs font-semibold text-slate-600"><span className="block">시작월 (빈칸: 제한 없음)</span><input type="month" value={startMonth} max={endMonth || undefined} aria-invalid={invalidRange} aria-describedby={invalidRange ? "allocation-period-error" : undefined} onChange={event => setStartMonth(event.target.value)} className="h-9 rounded-lg border px-3" /></label>
        <label className="space-y-1 text-xs font-semibold text-slate-600"><span className="block">종료월 (빈칸: 제한 없음)</span><input type="month" value={endMonth} min={startMonth || undefined} aria-invalid={invalidRange} aria-describedby={invalidRange ? "allocation-period-error" : undefined} onChange={event => setEndMonth(event.target.value)} className="h-9 rounded-lg border px-3" /></label>
      </>}
      <label className="space-y-1 text-xs font-semibold text-slate-600"><span className="block">현장 / 공장재고</span><select value={target} onChange={event => setTarget(event.target.value)} className="h-9 max-w-full rounded-lg border px-3"><option value="">전체</option>{targets.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={onlyExcess} onChange={event => setOnlyExcess(event.target.checked)} />초과 건만 보기</label>
      <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={excludeFactory} onChange={event => {
        setExcludeFactory(event.target.checked);
        if (event.target.checked && target.startsWith("factory:")) setTarget("");
      }} />공장 재고 제외</label>
    </div>
    <p className="text-xs text-slate-500">초과율 = 초과량 ÷ 발주량 × 100입니다. 초과량은 발주별 초과분을 합산합니다. 다른 발주의 미배정량과 상계하지 않습니다. 월별 수치는 해당 사용월 발주의 현재 배정 상태입니다.</p>
    {invalidRange ? <p id="allocation-period-error" role="alert" className="text-sm text-red-600">종료월은 시작월과 같거나 이후여야 합니다.</p> : loading ? <Skeleton className="h-48 rounded-xl" /> : error ? <ErrorState message={error} onRetry={() => setRevision(value => value + 1)} /> : <>
      <p className="text-sm text-slate-600">조회 {groups.length}건 · 초과 합계 <strong className="text-red-600">{kg(normalizeMaterialTons(groups.reduce((sum, group) => sum + group.excess, 0)))}</strong></p>
      <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[960px] text-left text-xs">
        <thead className="bg-slate-100 text-slate-600"><tr>{sortColumns.map(column => <th key={column.key} scope="col" aria-sort={sort.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"} className="px-3 py-3"><button type="button" onClick={() => changeSort(column.key)} className={`inline-flex items-center gap-1 rounded whitespace-nowrap font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 ${sort.key === column.key ? "text-blue-700" : "hover:text-slate-900"}`}><span>{column.label}</span><span aria-hidden="true">{sort.key === column.key ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</span></button></th>)}<th scope="col" className="px-3 py-3">상세</th></tr></thead>
        <tbody>{groups.map(group => <Fragment key={group.key}>
          <tr className="border-t"><td className="px-3 py-3">{group.month}</td><td className="px-3 py-3">{group.projectCode}</td><td className="px-3 py-3 font-semibold">{group.name}</td><td className="px-3 py-3">{kg(group.requested)}</td><td className="px-3 py-3">{kg(group.allocated)}</td><td className="px-3 py-3">{kg(group.unallocated)}</td><td className={`px-3 py-3 font-semibold ${group.excess > 0 ? "text-red-600" : "text-slate-500"}`}>{kg(group.excess)}</td><td className="px-3 py-3">{rate(group.requested, group.excess)}</td><td className="px-3 py-3"><button type="button" aria-expanded={expanded.has(group.key)} onClick={() => toggle(group.key)} className="whitespace-nowrap font-semibold text-blue-600">{expanded.has(group.key) ? "접기" : `발주 ${group.rows.length}건 보기`}</button></td></tr>
          {expanded.has(group.key) && <tr><td colSpan={9} className="border-t bg-slate-50 p-3"><table className="w-full text-xs"><caption className="pb-2 text-left text-slate-500">{group.name} · {group.month} {onlyExcess ? "초과 발주 내역" : "전체 발주 내역"}</caption><thead><tr>{["발주번호", "사용구분 / 차수", "사용일", "발주량", "배정량 (예정+확정)", "초과량", "초과율"].map(label => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{detailRows(group.rows, onlyExcess).map(row => <tr key={row.id} className="border-t"><td className="px-3 py-2">{row.purchase_order_no ?? "발주번호 없음"}</td><td className="px-3 py-2">{row.group_name ?? "구분 없음"}</td><td className="px-3 py-2">{row.usage_date}</td><td className="px-3 py-2">{kg(Number(row.quantity_tons))}</td><td className="px-3 py-2">{kg(Number(row.allocated_tons))}</td><td className={`px-3 py-2 font-semibold ${excess(row) > 0 ? "text-red-600" : "text-slate-500"}`}>{kg(excess(row))}</td><td className="px-3 py-2">{rate(Number(row.quantity_tons), excess(row))}</td></tr>)}</tbody></table></td></tr>}
        </Fragment>)}{groups.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">{onlyExcess ? "현재 조건에 초과 배정된 발주가 없습니다." : "현재 조건에 해당하는 발주가 없습니다."}</td></tr>}</tbody>
      </table></div>
    </>}
  </section>;
}
