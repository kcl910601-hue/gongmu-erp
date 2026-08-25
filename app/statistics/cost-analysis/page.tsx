"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { MaterialUsageDialog } from "@/components/statistics/cost-analysis/MaterialUsageDialog";
import { ProjectAccessoryUsageSection } from "@/components/statistics/cost-analysis/ProjectAccessoryUsageSection";
import {
  ProjectGlassCostSection,
  type ProjectGlassCostRow,
} from "@/components/statistics/project-margin/ProjectGlassCostSection";
import {
  ProjectCoatingCostSection,
  type ProjectCoatingCostRow,
} from "@/components/statistics/project-margin/ProjectCoatingCostSection";
import { Button } from "@/components/ui/Button";
import { useAppShellUser } from "@/contexts/AppShellUserContext";
import {
  ACCESSORIES_CHANGED_EVENT,
  COATING_COSTS_CHANGED_EVENT,
  GLASS_COSTS_CHANGED_EVENT,
} from "@/lib/collaboration-events";
import type { AccessoryItem, ProjectAccessoryUsage } from "@/lib/accessories";
import {
  formatKrw,
  type ProjectCostProject,
  type ProjectMaterialUsage,
} from "@/lib/project-material-cost";

type Summary = {
  itemCount: number;
  expectedQuantityKg: number;
  expectedCostKrw: number;
  contractCount: number;
  marketCount: number;
};
export default function CostAnalysisPage() {
  const { employee } = useAppShellUser();
  const isAdmin = employee?.role === "admin";
  const [projects, setProjects] = useState<ProjectCostProject[]>([]);
  const [materials, setMaterials] = useState<{ code: string; name: string }[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [usages, setUsages] = useState<ProjectMaterialUsage[]>([]);
  const [glassRows, setGlassRows] = useState<ProjectGlassCostRow[]>([]);
  const [glassTotal, setGlassTotal] = useState(0);
  const [coatingRows, setCoatingRows] = useState<ProjectCoatingCostRow[]>([]);
  const [coatingTotal, setCoatingTotal] = useState(0);
  const [accessoryItems, setAccessoryItems] = useState<AccessoryItem[]>([]);
  const [accessoryRows, setAccessoryRows] = useState<ProjectAccessoryUsage[]>([]);
  const [accessoryTotal, setAccessoryTotal] = useState(0);
  const [summary, setSummary] = useState<Summary>({
    itemCount: 0,
    expectedQuantityKg: 0,
    expectedCostKrw: 0,
    contractCount: 0,
    marketCount: 0,
  });
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectMaterialUsage | null>(null);
  const [detail, setDetail] = useState<ProjectMaterialUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([
      fetch("/api/statistics/cost-analysis/projects").then((response) =>
        response.json(),
      ),
      fetch("/api/statistics/cost-analysis/materials").then((response) =>
        response.json(),
      ),
    ])
      .then(([projectPayload, materialPayload]) => {
        if (projectPayload.error) throw new Error(projectPayload.error);
        setProjects(projectPayload.projects ?? []);
        setMaterials(materialPayload.materials ?? []);
        const requestedId = Number(
          new URLSearchParams(window.location.search).get("projectId"),
        );
        const requested = projectPayload.projects?.find(
          (project: ProjectCostProject) => project.id === requestedId,
        );
        if (requested) setSelectedId(requested.id);
        else if (projectPayload.projects?.[0])
          setSelectedId(projectPayload.projects[0].id);
      })
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "데이터를 불러오지 못했습니다.",
        ),
      );
  }, []);
  const loadUsages = useCallback(async () => {
    if (!selectedId) {
      setUsages([]);
      return;
    }
    const response = await fetch(
      `/api/statistics/cost-analysis/projects/${selectedId}/materials`,
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error ?? "예상 원가를 불러오지 못했습니다.");
    setUsages(payload.usages ?? []);
    setSummary(payload.summary);
  }, [selectedId]);
  const loadGlassCosts = useCallback(async () => {
    if (!selectedId) {
      setGlassRows([]);
      setGlassTotal(0);
      setCoatingRows([]);
      setCoatingTotal(0);
      return;
    }
    const response = await fetch(
      `/api/statistics/project-margin/${selectedId}`,
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error ?? "유리 실제원가를 불러오지 못했습니다.");
    setGlassRows(payload.glass_breakdown ?? []);
    setGlassTotal(payload.glass_cost_summary?.actual_glass_cost_krw ?? 0);
    setCoatingRows(payload.coating_breakdown ?? []);
    setCoatingTotal(
      payload.coating_cost_summary?.actual_coating_cost_krw ?? 0,
    );
  }, [selectedId]);
  const loadAccessories = useCallback(async () => {
    if (!selectedId) { setAccessoryItems([]); setAccessoryRows([]); setAccessoryTotal(0); return; }
    const response = await fetch(`/api/statistics/cost-analysis/projects/${selectedId}/accessories`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "부자재 실제원가를 불러오지 못했습니다.");
    setAccessoryItems(payload.items ?? []); setAccessoryRows(payload.usages ?? []); setAccessoryTotal(payload.total ?? 0);
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void fetch(`/api/statistics/cost-analysis/projects/${selectedId}/materials`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error ?? "예상 원가를 불러오지 못했습니다.");
        if (!cancelled) {
          setUsages(payload.usages ?? []);
          setSummary(payload.summary);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "예상 원가를 불러오지 못했습니다.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void fetch(`/api/statistics/project-margin/${selectedId}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.error ?? "유리 실제원가를 불러오지 못했습니다.",
          );
        if (!cancelled) {
          setGlassRows(payload.glass_breakdown ?? []);
          setGlassTotal(
            payload.glass_cost_summary?.actual_glass_cost_krw ?? 0,
          );
          setCoatingRows(payload.coating_breakdown ?? []);
          setCoatingTotal(
            payload.coating_cost_summary?.actual_coating_cost_krw ?? 0,
          );
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "유리 실제원가를 불러오지 못했습니다.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
  useEffect(() => {
    const refresh = () => {
      void loadGlassCosts().catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "유리 실제원가를 불러오지 못했습니다.",
        ),
      );
    };
    window.addEventListener(GLASS_COSTS_CHANGED_EVENT, refresh);
    window.addEventListener(COATING_COSTS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(GLASS_COSTS_CHANGED_EVENT, refresh);
      window.removeEventListener(COATING_COSTS_CHANGED_EVENT, refresh);
    };
  }, [loadGlassCosts]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadAccessories().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "부자재 실제원가를 불러오지 못했습니다.")), 0);
    const refresh = () => void loadAccessories();
    window.addEventListener(ACCESSORIES_CHANGED_EVENT, refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener(ACCESSORIES_CHANGED_EVENT, refresh); };
  }, [loadAccessories]);
  const selected =
    projects.find((project) => project.id === selectedId) ?? null;
  const filtered = useMemo(
    () =>
      projects.filter((project) =>
        `${project.project_name} ${project.project_code ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [projects, search],
  );
  const cards = [
    ["등록된 원자재 항목", `${summary.itemCount.toLocaleString("ko-KR")}건`],
    [
      "총 예상 사용량",
      `${summary.expectedQuantityKg.toLocaleString("ko-KR", { maximumFractionDigits: 3 })} kg`,
    ],
    ["AL 예상원가", formatKrw(summary.expectedCostKrw)],
    ["도장 실제원가", formatKrw(coatingTotal)],
    ["유리 실제원가", formatKrw(glassTotal)],
    ["부자재 실제원가", formatKrw(accessoryTotal)],
    ["현재 집계 자재원가", formatKrw(summary.expectedCostKrw + coatingTotal + glassTotal + accessoryTotal)],
    ["계약 기준", `${summary.contractCount.toLocaleString("ko-KR")}건`],
    ["시장 기준", `${summary.marketCount.toLocaleString("ko-KR")}건`],
  ];
  return (
    <main className="min-h-screen space-y-4 bg-slate-50 p-5 text-slate-900">
      <header>
        <h1 className="text-xl font-bold">원가 분석</h1>
        <p className="mt-1 text-sm text-slate-500">
          프로젝트별 AL 예상원가와 도장·유리·부자재 실제원가를 한 곳에서 등록하고
          관리합니다.
        </p>
      </header>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <section className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">프로젝트 선택</h2>
          <label className="mt-3 flex h-9 items-center gap-2 rounded-lg border px-3">
            <Search size={15} className="text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="프로젝트명 또는 코드"
              className="min-w-0 flex-1 text-sm outline-none"
            />
          </label>
          <div className="mt-3 max-h-[620px] space-y-1 overflow-y-auto">
            {filtered.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedId(project.id)}
                className={`w-full rounded-xl px-3 py-2 text-left ${selectedId === project.id ? "bg-slate-950 text-white" : "hover:bg-slate-100"}`}
              >
                <span className="block text-sm font-semibold">
                  {project.project_name}
                </span>
                <span
                  className={`mt-1 block text-xs ${selectedId === project.id ? "text-slate-300" : "text-slate-500"}`}
                >
                  {project.project_code ?? "코드 없음"} ·{" "}
                  {project.client_name ?? "발주처 없음"}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">
                프로젝트가 없습니다.
              </p>
            )}
          </div>
        </aside>
        <div className="min-w-0 space-y-4">
          {selected ? (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">
                      {selected.project_name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {selected.project_code ?? "코드 없음"} ·{" "}
                      {selected.client_name ?? "발주처 없음"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      현장 {selected.site_address ?? "-"} · 공정{" "}
                      {selected.process_type ?? "-"} · 기간{" "}
                      {selected.start_date ?? "-"} ~ {selected.end_date ?? "-"}
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      프로젝트 업무 수량:{" "}
                      {selected.quantity?.toLocaleString("ko-KR") ?? "-"}{" "}
                      {selected.quantity_unit ?? ""} (원자재 사용량과 별개)
                    </p>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="primary"
                      onClick={() => {
                        setEditing(null);
                        setDialogOpen(true);
                      }}
                    >
                      <Plus size={15} className="mr-1" />
                      원자재 추가
                    </Button>
                  )}
                </div>
              </section>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map(([label, value]) => (
                  <article
                    key={label}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <p className="text-xs font-semibold text-slate-500">
                      {label}
                    </p>
                    <p className="mt-2 text-lg font-bold">{value}</p>
                  </article>
                ))}
              </div>
              <ProjectCoatingCostSection
                project={{
                  id: selected.id,
                  project_code: selected.project_code,
                  project_name: selected.project_name,
                }}
                rows={coatingRows}
                total={coatingTotal}
                canManage={isAdmin}
                onChanged={loadGlassCosts}
              />
              <ProjectGlassCostSection
                project={{
                  id: selected.id,
                  project_code: selected.project_code,
                  project_name: selected.project_name,
                }}
                rows={glassRows}
                total={glassTotal}
                canManage={isAdmin}
                onChanged={loadGlassCosts}
              />
              <ProjectAccessoryUsageSection
                project={{ id: selected.id, project_code: selected.project_code, project_name: selected.project_name }}
                items={accessoryItems}
                rows={accessoryRows}
                total={accessoryTotal}
                canManage={isAdmin}
                onChanged={loadAccessories}
              />
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b px-4 py-3">
                  <h2 className="text-sm font-semibold">예상 원자재 목록</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[1050px] w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        {[
                          "Material",
                          "가격 기준",
                          "계약 또는 시세 근거",
                          "원가 기준일",
                          "예상 사용량",
                          "적용단가",
                          "예상 원가",
                          "메모",
                          "관리",
                        ].map((label) => (
                          <th key={label} className="px-3 py-2 font-semibold">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {usages.map((usage) => (
                        <tr
                          key={usage.id}
                          onClick={() => setDetail(usage)}
                          className="cursor-pointer border-t hover:bg-slate-50"
                        >
                          <td className="px-3 py-2 font-semibold">
                            {usage.material_code} · {usage.material_name ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            {usage.pricing_basis === "contract"
                              ? "계약"
                              : "시장"}
                          </td>
                          <td className="px-3 py-2">
                            {usage.pricing_basis === "contract"
                              ? `${usage.supplier_name ?? "-"} · ${usage.contract_name ?? "-"}`
                              : `${usage.market_reference_date ?? "-"} · ${usage.market_round ?? "-"}차`}
                          </td>
                          <td className="px-3 py-2">
                            {usage.cost_reference_date}
                          </td>
                          <td className="px-3 py-2">
                            {Number(usage.expected_quantity_kg).toLocaleString(
                              "ko-KR",
                              { maximumFractionDigits: 3 },
                            )}{" "}
                            kg
                          </td>
                          <td className="px-3 py-2">
                            {Number(
                              usage.applied_unit_price_krw_per_kg,
                            ).toLocaleString("ko-KR")}
                            원/kg
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {formatKrw(Number(usage.expected_cost_krw))}
                          </td>
                          <td className="max-w-40 truncate px-3 py-2">
                            {usage.memo ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            {isAdmin ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditing(usage);
                                  setDialogOpen(true);
                                }}
                              >
                                수정
                              </Button>
                            ) : (
                              "조회"
                            )}
                          </td>
                        </tr>
                      ))}
                      {usages.length === 0 && (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-4 py-14 text-center text-sm text-slate-400"
                          >
                            등록된 예상 원자재가 없습니다.
                            {isAdmin && (
                              <>
                                <br />첫 번째 원자재 사용량과 가격 근거를
                                등록하세요.
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white py-24 text-center text-sm text-slate-400">
              원가를 확인할 프로젝트를 선택하세요.
            </section>
          )}
        </div>
      </section>
      {selected && dialogOpen && (
        <MaterialUsageDialog
          key={editing?.id ?? "new"}
          projectId={selected.id}
          projectStartDate={selected.start_date}
          materials={materials}
          usage={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={loadUsages}
        />
      )}{" "}
      {detail && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4"
          onClick={() => setDetail(null)}
        >
          <section
            className="w-full max-w-lg rounded-2xl bg-white p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">가격 근거 상세</h2>
              <Button variant="ghost" onClick={() => setDetail(null)}>
                닫기
              </Button>
            </div>
            <dl className="mt-4 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">가격 기준</dt>
              <dd>{detail.pricing_basis === "contract" ? "계약" : "시장"}</dd>
              <dt className="text-slate-500">Snapshot 근거</dt>
              <dd>
                {detail.pricing_basis === "contract"
                  ? `${detail.supplier_name ?? "-"} · ${detail.contract_name ?? "-"}`
                  : `${detail.market_reference_date ?? "-"} · ${detail.market_round ?? "-"}차`}
              </dd>
              <dt className="text-slate-500">국내환산 LME</dt>
              <dd>
                {detail.domestic_lme_snapshot === null
                  ? "-"
                  : `${Number(detail.domestic_lme_snapshot).toLocaleString("ko-KR")}원/kg`}
              </dd>
              <dt className="text-slate-500">가공비 Snapshot</dt>
              <dd>
                {detail.processing_cost_snapshot === null
                  ? "-"
                  : `${Number(detail.processing_cost_snapshot).toLocaleString("ko-KR")}원/kg`}
              </dd>
              <dt className="text-slate-500">계약단가 Snapshot</dt>
              <dd>
                {detail.contract_price_snapshot === null
                  ? "-"
                  : `${Number(detail.contract_price_snapshot).toLocaleString("ko-KR")}원/kg`}
              </dd>
              <dt className="text-slate-500">적용 당시 단가</dt>
              <dd>
                {Number(detail.applied_unit_price_krw_per_kg).toLocaleString(
                  "ko-KR",
                )}
                원/kg
              </dd>
              <dt className="text-slate-500">원가 기준일</dt>
              <dd>{detail.cost_reference_date}</dd>
              <dt className="text-slate-500">등록자</dt>
              <dd>{detail.created_by_name ?? detail.created_by}</dd>
              <dt className="text-slate-500">등록시각</dt>
              <dd>{new Date(detail.created_at).toLocaleString("ko-KR")}</dd>
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}
