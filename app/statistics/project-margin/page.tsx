"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProjectMarginCharts } from "@/components/statistics/project-margin/ProjectMarginCharts";
import { ProjectGlassCostSection, type ProjectGlassCostRow } from "@/components/statistics/project-margin/ProjectGlassCostSection";
import { ProjectCoatingCostSection, type ProjectCoatingCostRow } from "@/components/statistics/project-margin/ProjectCoatingCostSection";
import { ACCESSORIES_CHANGED_EVENT, COATING_COSTS_CHANGED_EVENT, GLASS_COSTS_CHANGED_EVENT } from "@/lib/collaboration-events";
import {
  MARGIN_ANALYSIS_LABEL,
  MARGIN_CALCULATION_LABEL,
  type ProjectMarginAnalysis,
} from "@/lib/project-margin-analysis";
type Row = {
  id: number;
  project_code: string | null;
  project_name: string;
  client_name: string | null;
  site_address: string | null;
  salesperson: string | null;
  task_manager: string | null;
  status: string | null;
  process_type: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_summary: {
    original_supply_amount_krw: number | null;
    increase_supply_amount_krw: number;
    decrease_supply_amount_krw: number;
    final_supply_amount_krw: number | null;
    confirmed_entry_count: number;
  };
  material_cost_summary: {
    expected_material_cost_krw: number | null;
    material_usage_count: number;
    expected_quantity_kg: number;
    contract_basis_cost_krw: number;
    market_basis_cost_krw: number;
  };
  additional_cost_summary: {
    total_supply_amount_krw: number;
    confirmed_cost_count: number;
    void_cost_count: number;
    latest_confirmed_cost_date: string | null;
    category_breakdown: Record<
      string,
      { code: string; name: string; count: number; supply_amount_krw: number }
    >;
  };
  cost_composition: Record<
    string,
    {
      code: string;
      name: string;
      count: number;
      supply_amount_krw: number;
      share_of_total_cost: number | null;
    }
  >;
  analysis: ProjectMarginAnalysis;
};
type Kpi = {
  calculable_project_count: number;
  missing_contract_count: number;
  missing_material_cost_count: number;
  additional_cost_project_count: number;
  final_supply_total_krw: number | null;
  expected_material_cost_total_krw: number | null;
  expected_additional_cost_total_krw: number | null;
  expected_total_cost_total_krw: number | null;
  expected_project_margin_total_krw: number | null;
  weighted_total_cost_rate: number | null;
  weighted_margin_rate: number | null;
  loss_project_count: number;
};
type Detail = {
  canManage: boolean;
  project: Row;
  contract_summary: Row["contract_summary"];
  contract_entry_count: number;
  material_cost_summary: Row["material_cost_summary"];
  material_breakdown: {
    id: string;
    material_code: string;
    material_name: string | null;
    expected_quantity_kg: number;
    pricing_basis: string;
    applied_unit_price_krw_per_kg: number;
    expected_cost_krw: number;
    share_of_total_cost: number | null;
    cost_reference_date: string;
  }[];
  glass_cost_summary: {actual_glass_cost_krw:number;allocation_count:number};
  glass_breakdown: ProjectGlassCostRow[];
  coating_cost_summary: {actual_coating_cost_krw:number;allocation_count:number};
  coating_breakdown: ProjectCoatingCostRow[];
  accessory_cost_summary: {actual_accessory_cost_krw:number;usage_count:number};
  additional_cost_summary: Row["additional_cost_summary"];
  additional_category_breakdown: {
    code: string;
    name: string;
    count: number;
    supply_amount_krw: number;
    share_of_total_cost: number | null;
    latest_cost_date: string | null;
  }[];
  cost_entry_summary: { confirmed_count: number; void_count: number };
  cost_composition: Row["cost_composition"];
  analysis: ProjectMarginAnalysis;
  calculation_basis: {
    revenue: string;
    material: string;
    additional: string;
    excluded: string[];
  };
};
const zero: Kpi = {
  calculable_project_count: 0,
  missing_contract_count: 0,
  missing_material_cost_count: 0,
  additional_cost_project_count: 0,
  final_supply_total_krw: null,
  expected_material_cost_total_krw: null,
  expected_additional_cost_total_krw: null,
  expected_total_cost_total_krw: null,
  expected_project_margin_total_krw: null,
  weighted_total_cost_rate: null,
  weighted_margin_rate: null,
  loss_project_count: 0,
};
const money = (v: number | null) =>
    v === null ? "계산 불가" : `${v.toLocaleString("ko-KR")}원`,
  rate = (v: number | null) => (v === null ? "계산 불가" : `${v.toFixed(2)}%`);
export default function ProjectMarginPage() {
  const [rows, setRows] = useState<Row[]>([]),
    [kpi, setKpi] = useState<Kpi>(zero),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState<string | null>(null),
    [filters, setFilters] = useState({
      query: "",
      project_status: "",
      salesperson: "",
      task_manager: "",
      process_type: "",
      start_date_from: "",
      start_date_to: "",
      calculation_status: "",
      analysis_status: "",
      has_contract: "",
      has_material_cost: "",
      has_additional_cost: "",
      cost_category_code: "",
      sort: "latest",
    });
  async function load() {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) p.set(k, v);
    });
    const r = await fetch(`/api/statistics/project-margin?${p}`),
      b = await r.json();
    if (!r.ok) throw new Error(b.error);
    setRows(b.projects ?? []);
    setKpi(b.kpi ?? zero);
  }
  async function open(id: number) {
    const r = await fetch(`/api/statistics/project-margin/${id}`),
      b = await r.json();
    if (!r.ok) throw new Error(b.error);
    setDetail(b);
  }
  useEffect(() => {
    let stop = false;
    void fetch("/api/statistics/project-margin")
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        if (!stop) {
          setRows(b.projects ?? []);
          setKpi(b.kpi ?? zero);
        }
      })
      .catch((e: unknown) => {
        if (!stop) setError(e instanceof Error ? e.message : "조회 실패");
      });
    return () => {
      stop = true;
    };
  }, []);
  useEffect(()=>{const refresh=()=>window.location.reload();window.addEventListener(GLASS_COSTS_CHANGED_EVENT,refresh);window.addEventListener(COATING_COSTS_CHANGED_EVENT,refresh);window.addEventListener(ACCESSORIES_CHANGED_EVENT,refresh);return()=>{window.removeEventListener(GLASS_COSTS_CHANGED_EVENT,refresh);window.removeEventListener(COATING_COSTS_CHANGED_EVENT,refresh);window.removeEventListener(ACCESSORIES_CHANGED_EVENT,refresh);};},[]);
  const cards: [string, string][] = [
    ["분석 가능", `${kpi.calculable_project_count}개`],
    ["계약 미등록", `${kpi.missing_contract_count}개`],
    ["원자재 원가 미등록", `${kpi.missing_material_cost_count}개`],
    ["부대비용 등록", `${kpi.additional_cost_project_count}개`],
    ["최종 공급가액 합계", money(kpi.final_supply_total_krw)],
    ["예상 원자재 원가 합계", money(kpi.expected_material_cost_total_krw)],
    ["예상 부대비용 합계", money(kpi.expected_additional_cost_total_krw)],
    ["예상 총원가 합계", money(kpi.expected_total_cost_total_krw)],
    ["예상 프로젝트 마진 합계", money(kpi.expected_project_margin_total_krw)],
    ["가중 총원가율", rate(kpi.weighted_total_cost_rate)],
    ["가중 마진율", rate(kpi.weighted_margin_rate)],
    ["예상 손실", `${kpi.loss_project_count}개`],
  ];
  return (
    <main className="min-h-screen space-y-4 bg-slate-50 p-5">
      <header>
        <h1 className="text-xl font-bold">프로젝트 마진 분석</h1>
        <p className="mt-1 text-sm text-slate-500">
          AL 예상원가와 도장·유리·부자재 실제원가, 부대비용을 합산한 현재 집계 총원가 기준 분석입니다.
        </p>
      </header>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        AL은 예상 사용량, 도장·유리는 실제 계산서 배분, 부자재는 실제 소진 Snapshot 기준입니다. VAT는 원가에서 제외됩니다.
      </div>
      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-red-700">{error}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([l, v]) => (
          <article key={l} className="rounded-2xl border bg-white p-4">
            <p className="text-xs text-slate-500">{l}</p>
            <p className="mt-2 text-lg font-bold">{v}</p>
          </article>
        ))}
      </div>
      <section className="rounded-2xl border bg-white p-4">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <label className="flex h-9 items-center gap-2 rounded-lg border px-3">
            <Search size={14} />
            <input
              value={filters.query}
              onChange={(e) =>
                setFilters({ ...filters, query: e.target.value })
              }
              placeholder="프로젝트명·코드"
              className="min-w-0 flex-1 text-sm outline-none"
            />
          </label>
          {(
            [
              ["project_status", "프로젝트 상태"],
              ["salesperson", "영업담당자"],
              ["task_manager", "업무담당자"],
              ["process_type", "공정"],
              ["cost_category_code", "비용 분류 code"],
            ] as const
          ).map(([key, label]) => (
            <input
              key={key}
              value={filters[key]}
              onChange={(e) =>
                setFilters({ ...filters, [key]: e.target.value })
              }
              placeholder={label}
              className="h-9 rounded-lg border px-2 text-xs"
            />
          ))}
          <select
            value={filters.calculation_status}
            onChange={(e) =>
              setFilters({ ...filters, calculation_status: e.target.value })
            }
            className="h-9 rounded-lg border px-2 text-xs"
          >
            <option value="">전체 계산 상태</option>
            {Object.entries(MARGIN_CALCULATION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={filters.analysis_status}
            onChange={(e) =>
              setFilters({ ...filters, analysis_status: e.target.value })
            }
            className="h-9 rounded-lg border px-2 text-xs"
          >
            <option value="">전체 분석 상태</option>
            {Object.entries(MARGIN_ANALYSIS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {(
            [
              ["has_contract", "계약"],
              ["has_material_cost", "원자재 원가"],
              ["has_additional_cost", "부대비용"],
            ] as const
          ).map(([key, label]) => (
            <select
              key={key}
              value={filters[key]}
              onChange={(e) =>
                setFilters({ ...filters, [key]: e.target.value })
              }
              className="h-9 rounded-lg border px-2 text-xs"
            >
              <option value="">{label} 전체</option>
              <option value="true">있음</option>
              <option value="false">없음</option>
            </select>
          ))}
          <div className="flex gap-1">
            <input
              type="date"
              value={filters.start_date_from}
              onChange={(e) =>
                setFilters({ ...filters, start_date_from: e.target.value })
              }
              className="h-9 min-w-0 rounded-lg border px-1 text-xs"
            />
            <input
              type="date"
              value={filters.start_date_to}
              onChange={(e) =>
                setFilters({ ...filters, start_date_to: e.target.value })
              }
              className="h-9 min-w-0 rounded-lg border px-1 text-xs"
            />
          </div>
          <select
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
            className="h-9 rounded-lg border px-2 text-xs"
          >
            <option value="latest">프로젝트 최신순</option>
            <option value="final_supply_desc">공급가액 큰 순</option>
            <option value="material_cost_desc">원자재 원가 큰 순</option>
            <option value="additional_cost_desc">부대비용 큰 순</option>
            <option value="total_cost_desc">총원가 큰 순</option>
            <option value="margin_desc">마진 큰 순</option>
            <option value="margin_asc">마진 낮은 순</option>
            <option value="cost_rate_desc">총원가율 높은 순</option>
            <option value="cost_rate_asc">총원가율 낮은 순</option>
          </select>
          <Button variant="primary" onClick={() => void load()}>
            조회
          </Button>
        </div>
      </section>
      <ProjectMarginCharts projects={rows} />
      <section className="overflow-x-auto rounded-2xl border bg-white">
        <table className="min-w-[1550px] w-full text-left text-xs">
          <thead className="bg-slate-100">
            <tr>
              {[
                "프로젝트 코드",
                "프로젝트명",
                "발주처",
                "영업담당자",
                "업무담당자",
                "상태",
                "최종 공급가액",
                "AL 예상원가",
                "도장 실제원가",
                "유리 실제원가",
                "부자재 실제원가",
                "부대비용",
                "현재 집계 총원가",
                "예상 프로젝트 마진",
                "총원가율",
                "예상 마진율",
                "분석 상태",
                "계산 상태",
                "상세",
              ].map((x) => (
                <th key={x} className="px-3 py-2">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.project_code ?? "-"}</td>
                <td className="px-3 py-2 font-semibold">{r.project_name}</td>
                <td className="px-3 py-2">{r.client_name ?? "-"}</td>
                <td className="px-3 py-2">{r.salesperson ?? "-"}</td>
                <td className="px-3 py-2">{r.task_manager ?? "-"}</td>
                <td className="px-3 py-2">{r.status ?? "-"}</td>
                <td className="px-3 py-2">
                  {money(r.analysis.final_supply_amount_krw)}
                </td>
                <td className="px-3 py-2">
                  {money(r.analysis.expected_material_cost_krw)}
                </td>
                <td className="px-3 py-2">
                  {money(r.analysis.actual_coating_cost_krw)}
                </td>
                <td className="px-3 py-2">
                  {money(r.analysis.actual_glass_cost_krw)}
                </td>
                <td className="px-3 py-2">
                  {money(r.analysis.actual_accessory_cost_krw)}
                </td>
                <td className="px-3 py-2">
                  {money(r.analysis.expected_additional_cost_krw)}
                </td>
                <td className="px-3 py-2">
                  {money(r.analysis.expected_total_cost_krw)}
                </td>
                <td
                  className={`px-3 py-2 font-semibold ${Number(r.analysis.expected_project_margin_krw) < 0 ? "text-red-600" : ""}`}
                >
                  {money(r.analysis.expected_project_margin_krw)}
                </td>
                <td className="px-3 py-2">
                  {rate(r.analysis.total_cost_rate)}
                </td>
                <td className="px-3 py-2">
                  {rate(r.analysis.expected_project_margin_rate)}
                </td>
                <td className="px-3 py-2">
                  {r.analysis.analysis_status
                    ? MARGIN_ANALYSIS_LABEL[r.analysis.analysis_status]
                    : "계산 불가"}
                </td>
                <td className="px-3 py-2">
                  {MARGIN_CALCULATION_LABEL[r.analysis.calculation_status]}
                </td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void open(r.id)}
                  >
                    상세보기
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {detail && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4"
          onClick={() => setDetail(null)}
        >
          <section
            className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  {detail.project.project_name}
                </h2>
                <p className="text-sm text-slate-500">
                  {detail.project.project_code} · {detail.project.client_name} ·{" "}
                  {detail.project.site_address}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setDetail(null)}>
                닫기
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              {[
                [
                  "최종 공급가액",
                  money(detail.analysis.final_supply_amount_krw),
                ],
                ["현재 집계 총원가", money(detail.analysis.expected_total_cost_krw)],
                [
                  "예상 프로젝트 마진",
                  money(detail.analysis.expected_project_margin_krw),
                ],
                ["총원가율", rate(detail.analysis.total_cost_rate)],
                [
                  "예상 마진율",
                  rate(detail.analysis.expected_project_margin_rate),
                ],
              ].map(([l, v]) => (
                <article key={l} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{l}</p>
                  <p className="mt-1 font-bold">{v}</p>
                </article>
              ))}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <section className="rounded-xl border p-4 text-sm">
                <h3 className="font-semibold">매출 기준</h3>
                <p className="mt-2">
                  최초{" "}
                  {money(detail.contract_summary.original_supply_amount_krw)}
                </p>
                <p>
                  증액{" "}
                  {money(detail.contract_summary.increase_supply_amount_krw)} ·
                  감액{" "}
                  {money(detail.contract_summary.decrease_supply_amount_krw)}
                </p>
                <p>유효 이력 {detail.contract_entry_count}건</p>
              </section>
              <section className="rounded-xl border p-4 text-sm">
                <h3 className="font-semibold">자재원가</h3>
                <p className="mt-2">
                  AL 예상원가 {money(detail.material_cost_summary.expected_material_cost_krw)} · {detail.material_cost_summary.material_usage_count}건
                </p>
                <p>도장 실제원가 {money(detail.coating_cost_summary.actual_coating_cost_krw)}</p>
                <p>유리 실제원가 {money(detail.glass_cost_summary.actual_glass_cost_krw)}</p>
                <p>부자재 실제원가 {money(detail.accessory_cost_summary.actual_accessory_cost_krw)}</p>
                <p className="mt-1 font-semibold">현재 집계 자재원가 {money((detail.material_cost_summary.expected_material_cost_krw??0)+detail.coating_cost_summary.actual_coating_cost_krw+detail.glass_cost_summary.actual_glass_cost_krw+detail.accessory_cost_summary.actual_accessory_cost_krw)}</p>
                <p>
                  {detail.material_cost_summary.expected_quantity_kg.toLocaleString(
                    "ko-KR",
                  )}
                  kg · 계약{" "}
                  {money(detail.material_cost_summary.contract_basis_cost_krw)}{" "}
                  · 시장{" "}
                  {money(detail.material_cost_summary.market_basis_cost_krw)}
                </p>
              </section>
              <section className="rounded-xl border p-4 text-sm">
                <h3 className="font-semibold">부대비용</h3>
                <p className="mt-2">
                  {money(
                    detail.additional_cost_summary.total_supply_amount_krw,
                  )}{" "}
                  · 유효 {detail.cost_entry_summary.confirmed_count}건 · 무효{" "}
                  {detail.cost_entry_summary.void_count}건
                </p>
                <p>
                  분류 {detail.additional_category_breakdown.length}개 · 최신{" "}
                  {detail.additional_cost_summary.latest_confirmed_cost_date ??
                    "-"}
                </p>
              </section>
            </div>
            <ProjectCoatingCostSection project={detail.project} rows={detail.coating_breakdown} total={detail.coating_cost_summary.actual_coating_cost_krw} canManage={detail.canManage} editable={false} onChanged={async()=>{await Promise.all([open(detail.project.id),load()]);}} />
            <ProjectGlassCostSection project={detail.project} rows={detail.glass_breakdown} total={detail.glass_cost_summary.actual_glass_cost_krw} canManage={detail.canManage} editable={false} onChanged={async()=>{await Promise.all([open(detail.project.id),load()]);}} />

            <section className="mt-4">
              <h3 className="text-sm font-semibold">원가 구성 Breakdown</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {Object.values(detail.cost_composition).map((v) => (
                  <div key={v.code} className="rounded-xl border p-3 text-xs">
                    <b>{v.name}</b>
                    <p className="mt-1">
                      {money(v.supply_amount_krw)} ·{" "}
                      {v.share_of_total_cost?.toFixed(2) ?? "-"}%
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <section className="overflow-x-auto rounded-xl border">
                <table className="min-w-[650px] w-full text-left text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      {[
                        "Material",
                        "사용량",
                        "기준",
                        "적용단가",
                        "예상 원가",
                        "총원가 비중",
                        "기준일",
                      ].map((x) => (
                        <th key={x} className="px-2 py-2">
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.material_breakdown.map((v) => (
                      <tr key={v.id} className="border-t">
                        <td className="px-2 py-2">
                          {v.material_code} · {v.material_name}
                        </td>
                        <td className="px-2 py-2">
                          {Number(v.expected_quantity_kg).toLocaleString(
                            "ko-KR",
                          )}
                          kg
                        </td>
                        <td className="px-2 py-2">
                          {v.pricing_basis === "contract" ? "계약" : "시장"}
                        </td>
                        <td className="px-2 py-2">
                          {money(Number(v.applied_unit_price_krw_per_kg))}
                        </td>
                        <td className="px-2 py-2">
                          {money(Number(v.expected_cost_krw))}
                        </td>
                        <td className="px-2 py-2">
                          {rate(v.share_of_total_cost)}
                        </td>
                        <td className="px-2 py-2">{v.cost_reference_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="overflow-x-auto rounded-xl border">
                <table className="min-w-[500px] w-full text-left text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-2 py-2">분류</th>
                      <th>건수</th>
                      <th>공급가액</th>
                      <th>총원가 비중</th>
                      <th>최신 비용일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.additional_category_breakdown.map((v) => (
                      <tr key={v.code} className="border-t">
                        <td className="px-2 py-2">{v.name}</td>
                        <td>{v.count}</td>
                        <td>{money(v.supply_amount_krw)}</td>
                        <td>{rate(v.share_of_total_cost)}</td>
                        <td>{v.latest_cost_date ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
            <section className="mt-4 rounded-xl bg-slate-50 p-4 text-xs">
              <h3 className="font-semibold">계산 근거</h3>
              <p className="mt-2">{detail.calculation_basis.revenue}</p>
              <p>{detail.calculation_basis.material}</p>
              <p>{detail.calculation_basis.additional}</p>
              <p>
                미포함: {detail.calculation_basis.excluded.join(" · ")}. 실제
                회계상 확정 손익이 아닙니다.
              </p>
              {detail.analysis.calculation_reason && (
                <p className="mt-2 text-amber-700">
                  {detail.analysis.calculation_reason}
                </p>
              )}
            </section>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                [`/projects/${detail.project.id}`, "프로젝트 상세"],
                [
                  `/statistics/project-contracts?projectId=${detail.project.id}`,
                  "프로젝트 계약관리",
                ],
                [
                  `/statistics/cost-analysis?projectId=${detail.project.id}`,
                  "원가 분석",
                ],
                [
                  `/statistics/project-costs?projectId=${detail.project.id}`,
                  "프로젝트 비용관리",
                ],
                [
                  `/statistics/project-profit?projectId=${detail.project.id}`,
                  "프로젝트 손익 분석",
                ],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-lg border px-3 py-2 text-xs"
                >
                  {label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
