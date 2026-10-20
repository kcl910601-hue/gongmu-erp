"use client";

import Link from "next/link";
import { CoatingExtraItems } from "./CoatingExtraItems";
import { CoatingExclusions } from "./CoatingExclusions";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { COATING_COSTS_CHANGED_EVENT, MATERIAL_USAGE_REQUESTS_CHANGED_EVENT } from "@/lib/collaboration-events";
import { coatingExcludedKg, calculateCoatingExpectedKrw, coatingPlanSummary, coatingSourceChanged, coatingUsedKg, type CoatingPlan, type CoatingPlanContext, type CoatingPlanSource, type CoatingSource } from "@/lib/coating-plans";

type Project = { id: number; project_code: string | null; project_name: string; allocatedKg?: number; excludedKg?: number; coatingKg?: number; remainingKg?: number };
const inputClass = "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const number = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
const money = (value: number) => `${number(value)}원`;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body;
}

export function CoatingPlanManager() {
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [scope, setScope] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const selectedId = new URLSearchParams(window.location.search).get("projectId");
    if (selectedId) void requestJson<{ projects: Project[] }>(`/api/statistics/coating-plans?selectedProjectId=${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then((body) => { if (!controller.signal.aborted) setSelected(body.projects[0] ?? null); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "프로젝트 조회 실패"); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    let controller: AbortController | undefined;
    async function load() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ query, scope });
        const body = await requestJson<{ projects: Project[]; hasMore: boolean }>(`/api/statistics/coating-plans?${params}`, { signal: current.signal });
        if (!current.signal.aborted) { setProjects(body.projects); setHasMore(body.hasMore); setError(""); }
      } catch (reason) {
        if (!current.signal.aborted) { setProjects([]); setError(reason instanceof Error ? reason.message : "프로젝트 조회 실패"); }
      } finally { if (!current.signal.aborted) setLoading(false); }
    }
    const timer = setTimeout(() => void load(), 250);
    const changed = () => { clearTimeout(timer); void load(); };
    window.addEventListener(COATING_COSTS_CHANGED_EVENT, changed);
    window.addEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, changed);
    window.addEventListener("focus", changed);
    return () => {
      clearTimeout(timer); controller?.abort();
      window.removeEventListener(COATING_COSTS_CHANGED_EVENT, changed);
      window.removeEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, changed);
      window.removeEventListener("focus", changed);
    };
  }, [query, scope]);
  return <section id="coating-plans" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
    <div><h2 className="text-lg font-bold">도장 배정</h2><p className="mt-1 text-sm text-slate-500">압출 발주·배정 중량을 가져와 업체별 도장 물량과 예상금액을 관리합니다.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-60 flex-1 text-sm">현장 검색<input value={query} onChange={(event) => { setLoading(true); setQuery(event.target.value); }} placeholder="현장명 또는 프로젝트 코드" className={inputClass} /></label>
      <div className="flex gap-2"><Button variant={scope === "pending" ? "primary" : "outline"} onClick={() => { setLoading(true); setScope("pending"); }} disabled={scope === "pending"}>도장 미배정 현장</Button><Button variant={scope === "history" ? "primary" : "outline"} onClick={() => { setLoading(true); setScope("history"); }} disabled={scope === "history"}>배정·제외 내역</Button></div>
    </div>
    <p className="text-xs text-slate-500">{scope === "all" ? "압출 발주가 없는 현장도 선택해 부자재·공장 재고 도장 항목을 등록할 수 있습니다. 표의 중량은 압출 연계분만 표시합니다." : scope === "pending" ? "압출 예정·확정 배정 중 도장 미배정 잔량이 있는 현장입니다. 부분 배정 현장도 포함하며, 취소된 배정은 제외합니다." : "압출 연계 도장 배정 또는 제외 이력이 있는 현장입니다. 압출 외 항목은 전체 현장에서 확인하세요."}</p>
    <div className="max-h-80 overflow-auto rounded-xl border border-slate-200" aria-busy={loading}>
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead className="sticky top-0 bg-slate-50"><tr>{["현장명", "압출 배정 kg", "도장 배정 kg", "제외 kg", "미배정 kg", "선택"].map((label) => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead>
        <tbody>{loading ? <tr><td colSpan={6} className="p-6 text-center text-slate-500">현장을 불러오는 중입니다.</td></tr> : projects.map((project) => <tr key={project.id} className={`border-t ${selected?.id === project.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
          <td className="p-3"><p className="break-words font-medium">{project.project_name}</p><p className="text-xs text-slate-500">{project.project_code}</p></td>
          <td className="p-3 tabular-nums">{number(project.allocatedKg ?? 0)}</td><td className="p-3 tabular-nums">{number(project.coatingKg ?? 0)}</td><td className="p-3 tabular-nums">{number(project.excludedKg ?? 0)}</td><td className="p-3 font-semibold tabular-nums text-blue-700">{number(project.remainingKg ?? 0)}</td>
          <td className="p-3"><Button size="sm" variant={selected?.id === project.id ? "primary" : "outline"} onClick={() => setSelected(project)}>{selected?.id === project.id ? "선택됨" : "보기"}</Button></td>
        </tr>)}{!loading && !error && projects.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">{scope === "pending" ? "도장 미배정 현장이 없습니다." : "기존 배정 내역이 없습니다."}</td></tr>}</tbody>
      </table>
    </div>
    {!loading && hasMore && <p className="text-xs text-slate-500">검색 결과 중 50개 현장을 표시합니다. 현장명으로 검색 범위를 좁혀주세요.</p>}
    <Button variant={scope === "all" ? "primary" : "outline"} onClick={() => { setLoading(true); setScope("all"); }} disabled={scope === "all"}>전체 현장 · 압출 외 항목 등록</Button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {selected && <div className="space-y-3 border-t pt-4"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{selected.project_name}</h3><Button size="sm" variant="ghost" onClick={() => setSelected(null)}>현장 닫기</Button></div><CoatingPlanPanel key={selected.id} projectId={selected.id} /></div>}
  </section>;
}

export function CoatingPlanPanel({ projectId, summaryOnly = false }: { projectId: number; summaryOnly?: boolean }) {
  const [data, setData] = useState<CoatingPlanContext | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<{ id: string; plan?: CoatingPlan } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const requestNumber = useRef(0);
  const invalidatePending = useCallback(() => { requestNumber.current += 1; }, []);
  const load = useCallback(async () => {
    const sequence = ++requestNumber.current;
    setLoading(true);
    try {
      const body = await requestJson<CoatingPlanContext>(`/api/statistics/coating-plans?projectId=${projectId}`);
      if (sequence === requestNumber.current) { setData(body); setError(""); }
    } catch (reason) {
      if (sequence === requestNumber.current) setError(reason instanceof Error ? reason.message : "도장 배정을 조회하지 못했습니다.");
    } finally { if (sequence === requestNumber.current) setLoading(false); }
  }, [projectId]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    const changed = () => void load();
    window.addEventListener(COATING_COSTS_CHANGED_EVENT, changed);
    window.addEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, changed);
    window.addEventListener("focus", changed);
    return () => {
      clearTimeout(timer); invalidatePending();
      window.removeEventListener(COATING_COSTS_CHANGED_EVENT, changed);
      window.removeEventListener(MATERIAL_USAGE_REQUESTS_CHANGED_EVENT, changed);
      window.removeEventListener("focus", changed);
    };
  }, [load, invalidatePending]);

  async function cancel(plan: CoatingPlan) {
    if (!window.confirm("도장 배정을 취소하시겠습니까? 원본 압출 배정과 도장 실제원가는 유지됩니다.")) return;
    setCancelling(true);
    try {
      await requestJson("/api/statistics/coating-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plan.id, version: plan.version, projectId, action: "cancel" }) });
      window.dispatchEvent(new CustomEvent(COATING_COSTS_CHANGED_EVENT));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "취소하지 못했습니다."); }
    finally { setCancelling(false); }
  }

  const summary = data ? coatingPlanSummary(data) : null;
  return <section className={summaryOnly ? "mt-4 rounded-xl border p-4" : "space-y-3"}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">압출 중량 · 도장 예상원가</h3><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}>새로고침</Button>{summaryOnly ? <Link href={`/statistics/coating-costs?projectId=${projectId}#coating-plans`} className="rounded-lg border px-3 py-1 text-sm text-blue-700">도장 배정 보기</Link> : data?.canManage && <Button size="sm" variant="primary" disabled={Boolean(error) || loading} onClick={() => setEditor({ id: crypto.randomUUID() })}>도장 배정 등록</Button>}</div></div>
    {error && <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
    {loading && !data && <p className="py-4 text-sm text-slate-500">중량 정보를 불러오는 중입니다.</p>}
    {summary && data && <>
      <CoatingExtraItems key={projectId} projectId={projectId} data={data} linkedExpected={summary.expectedKrw} summaryOnly={summaryOnly} />
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{[
        ["압출 발주 중량", `${number(summary.orderedKg)} kg`], ["압출 배정 중량", `${number(summary.allocatedKg)} kg`],
        ["도장 배정 중량", `${number(summary.coatingKg)} kg`], ["도장 제외 중량", `${number(summary.excludedKg)} kg`], ["도장 미배정 중량", `${number(summary.remainingKg)} kg`], ["도장 예상금액", money(summary.expectedKrw)], ["도장 실제원가", money(data.actualCostKrw)],
      ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}</div>
      <p className="mt-2 text-xs text-slate-500">압출 배정 − 발주: {number(Math.round((summary.allocatedKg - summary.orderedKg) * 10) / 10)} kg · 예정·확정 배정 합계 / 취소 제외. 도장 실제원가는 프로젝트 전체 공급가액이며, 예상금액은 기존 원가에 합산하지 않습니다.</p>
      {data.plans.some((plan) => plan.status === "active" && coatingSourceChanged(plan, data.sources)) && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">원본 중량 또는 발주 정보가 변경된 도장 배정이 있습니다. 저장된 금액은 유지됩니다.</p>}
      {!summaryOnly && <>
        <CoatingExclusions projectId={projectId} data={data} onReload={load} />
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50"><tr>{["차수 / 발주번호", "발주 kg", "예정 배정 kg", "확정 배정 kg", "배정 합계 kg", "도장 배정 kg"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{data.sources.map((source) => <tr key={source.requestId} className="border-t"><td className="p-2">{source.groupName} · {source.purchaseOrderNo || "발주번호 없음"}<p className="text-xs text-slate-500">{source.usageDate}</p></td><td>{number(source.orderedKg)}</td><td>{number(source.plannedKg)}</td><td>{number(source.confirmedKg)}</td><td>{number(source.allocatedKg)}</td><td>{number(coatingUsedKg(data.plans, source.requestId))}</td></tr>)}{!data.sources.length && <tr><td colSpan={6} className="p-5 text-center text-slate-500">이 현장의 활성 AL 발주가 없습니다.</td></tr>}</tbody></table></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50"><tr>{["도장업체", "차수 / 발주", "도장 kg", "계산 수량", "단가", "예상금액", "상태", "관리"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{data.plans.map((plan) => <tr key={plan.id} className={`border-t ${plan.status === "cancelled" ? "text-slate-400" : ""}`}><td className="p-2">{plan.vendor_name}</td><td>{plan.sources.map((source) => <p key={source.requestId} className="text-xs">{source.snapshot.groupName} · {source.snapshot.purchaseOrderNo || "발주번호 없음"} · {number(source.weightKg)}kg</p>)}{plan.memo && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{plan.memo}</p>}</td><td>{number(plan.target_weight_kg)}</td><td>{number(plan.pricing_quantity)} {plan.pricing_unit}</td><td>{money(plan.unit_price_krw)}/{plan.pricing_unit}</td><td>{money(plan.expected_amount_krw)}</td><td>{plan.status === "cancelled" ? "취소" : "유효"}{plan.status === "active" && coatingSourceChanged(plan, data.sources) && <p className="text-xs text-amber-700">원본 변경됨</p>}</td><td>{data.canManage && plan.status === "active" && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={cancelling || loading} onClick={() => setEditor({ id: plan.id, plan })}>수정</Button><Button size="sm" variant="ghost" disabled={cancelling || loading} onClick={() => void cancel(plan)}>취소</Button></div>}</td></tr>)}{!data.plans.length && <tr><td colSpan={8} className="p-5 text-center text-slate-500">등록된 도장 배정이 없습니다.</td></tr>}</tbody></table></div>
      </>}
    </>}
    {editor && data && <CoatingPlanForm key={editor.id} id={editor.id} projectId={projectId} plan={editor.plan} data={data} onReload={load} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); window.dispatchEvent(new CustomEvent(COATING_COSTS_CHANGED_EVENT)); }} />}
  </section>;
}

function CoatingPlanForm({ id, projectId, plan, data, onReload, onClose, onSaved }: {
  id: string; projectId: number; plan?: CoatingPlan; data: CoatingPlanContext;
  onReload: () => Promise<void>; onClose: () => void; onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [vendorId, setVendorId] = useState(plan ? String(plan.vendor_organization_id) : "");
  const [basis, setBasis] = useState<"ordered" | "allocated">(plan?.weight_basis ?? "allocated");
  const [unit, setUnit] = useState<"kg" | "m">(plan?.pricing_unit ?? "kg");
  const [length, setLength] = useState(plan?.pricing_unit === "m" ? String(plan.pricing_quantity) : "");
  const [price, setPrice] = useState(plan ? String(plan.unit_price_krw) : "");
  const [memo, setMemo] = useState(plan?.memo ?? "");
  const [sources, setSources] = useState<CoatingPlanSource[]>(plan?.sources ?? []);
  const [group, setGroup] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const sourceMap = new Map(data.sources.map((source) => [source.requestId, source]));
  const selectable = [...data.sources, ...sources.filter((source) => !sourceMap.has(source.requestId)).map((source) => source.snapshot)];
  const groups = [...new Set(selectable.map((source) => source.groupName))];
  const totalKg = Math.round(sources.reduce((sum, source) => sum + source.weightKg, 0) * 10) / 10;
  const quantity = unit === "kg" ? totalKg : Number(length);
  const expected = calculateCoatingExpectedKrw(quantity, Number(price));
  const stale = sources.some((source) => source.snapshot.fingerprint !== sourceMap.get(source.requestId)?.fingerprint);
  const conflict = Boolean(plan && data.plans.find((item) => item.id === plan.id)?.version !== plan.version);
  const ordered = sources.reduce((sum, source) => sum + source.snapshot.orderedKg, 0);
  const allocated = sources.reduce((sum, source) => sum + source.snapshot.allocatedKg, 0);
  const available = (source: CoatingSource, selectedBasis = basis) => Math.max(0, Math.round(((selectedBasis === "ordered" ? source.orderedKg : source.allocatedKg) - coatingUsedKg(data.plans, source.requestId, id) - coatingExcludedKg(data, source.requestId)) * 10) / 10);
  function importWeight(nextBasis: "ordered" | "allocated") {
    setBasis(nextBasis);
    setSources((current) => current.map((source) => {
      const latest = sourceMap.get(source.requestId);
      return latest ? { requestId: source.requestId, weightKg: available(latest, nextBasis), snapshot: latest } : source;
    }));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (conflict) { setError("다른 사용자가 변경했습니다. 편집창을 닫고 다시 열어주세요."); return; }
    if (!vendorId || !sources.length) { setError("도장업체와 압출 발주를 선택해주세요."); return; }
    if (stale) { setError("원본 정보가 변경되었습니다. 최신 중량을 다시 가져와 확인해주세요."); return; }
    if (sources.some((source) => !Number.isFinite(source.weightKg) || source.weightKg <= 0 || source.weightKg > available(source.snapshot))) { setError("각 발주의 잔량 이내로 도장 대상 중량을 입력해주세요."); return; }
    if (expected === null) { setError("계산 수량과 단가를 확인해주세요."); return; }
    setSaving(true);
    try {
      await requestJson("/api/statistics/coating-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, version: plan?.version ?? 0, projectId, vendorId: Number(vendorId), weightBasis: basis, unit, lengthM: unit === "m" ? Number(length) : null, unitPrice: Number(price), sources, memo }) });
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); await onReload(); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} aria-label="도장 배정 편집" onCancel={(event) => { if (saving) event.preventDefault(); else onClose(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl backdrop:bg-slate-950/40">
    <form onSubmit={save}><fieldset disabled={saving} className="space-y-4">
      <div className="flex items-center justify-between"><h3 className="text-lg font-bold">도장 배정 {plan ? "수정" : "등록"}</h3><Button variant="ghost" onClick={onClose}>닫기</Button></div>
      <p className="text-sm text-slate-500">발주·배정 중량은 가져온 시점의 값으로 보관합니다. m 단가는 길이를 직접 입력하며, 압출 물량 추적을 위한 중량도 함께 저장합니다.</p>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">도장업체<select required value={vendorId} onChange={(event) => setVendorId(event.target.value)} className={inputClass}><option value="">선택</option>{data.vendors.filter((vendor) => vendor.is_active || vendor.id === plan?.vendor_organization_id).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}{vendor.is_active ? "" : " (비활성)"}</option>)}</select></label><label className="text-sm">차수 필터<select value={group} onChange={(event) => setGroup(event.target.value)} className={inputClass}><option value="">전체 차수</option>{groups.map((name) => <option key={name}>{name}</option>)}</select></label><div className="self-end"><Button variant="outline" onClick={() => void onReload()}>최신 원본 조회</Button></div></div>
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-semibold">중량 기준: {basis === "ordered" ? "발주" : "배정"}</span><Button variant={basis === "ordered" ? "primary" : "outline"} onClick={() => importWeight("ordered")}>발주 잔량 가져오기</Button><Button variant={basis === "allocated" ? "primary" : "outline"} onClick={() => importWeight("allocated")}>배정 잔량 가져오기</Button></div>
      {stale && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">원본 변경됨 · 위 가져오기 버튼으로 최신 중량을 반영하거나, 취소된 발주를 선택 해제해주세요. 적용 중량도 선택 기준의 잔량으로 바뀝니다.</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50"><tr>{["선택 / 차수·발주", "발주 kg", "배정 kg", "잔량 kg", "도장 대상 kg"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{selectable.filter((source) => !group || source.groupName === group).map((source) => {
        const selected = sources.find((item) => item.requestId === source.requestId);
        const missing = !sourceMap.has(source.requestId);
        return <tr key={source.requestId} className="border-t"><td className="p-2"><label className="flex gap-2"><input type="checkbox" checked={Boolean(selected)} onChange={(event) => setSources((current) => event.target.checked ? [...current, { requestId: source.requestId, weightKg: available(source), snapshot: source }] : current.filter((item) => item.requestId !== source.requestId))} /><span>{source.groupName} · {source.purchaseOrderNo || "발주번호 없음"}<span className="block text-xs text-slate-500">{source.usageDate}{missing ? " · 취소 또는 원본 없음" : ""}</span></span></label></td><td>{number(source.orderedKg)}</td><td>{number(source.allocatedKg)}<p className="text-xs text-slate-500">예정 {number(source.plannedKg)} / 확정 {number(source.confirmedKg)}</p></td><td>{missing ? "-" : number(available(source))}</td><td>{selected && <input aria-label={`${source.purchaseOrderNo || source.groupName} 도장 중량`} required type="number" min="0.1" step="0.1" max={available(source)} value={selected.weightKg || ""} onChange={(event) => setSources((current) => current.map((item) => item.requestId === source.requestId ? { ...item, weightKg: Number(event.target.value) } : item))} className="w-32 rounded-lg border p-2" />}</td></tr>;
      })}</tbody></table></div>
      <p className="rounded-xl bg-blue-50 p-3 text-sm">선택 {sources.length}건 · 가져온 발주 {number(ordered)}kg / 배정 {number(allocated)}kg / 차이 {number(allocated - ordered)}kg · 도장 적용 <b>{number(totalKg)}kg</b></p>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">계산 기준<select value={unit} onChange={(event) => setUnit(event.target.value === "m" ? "m" : "kg")} className={inputClass}><option value="kg">kg당 단가</option><option value="m">m당 단가</option></select></label>{unit === "m" ? <label className="text-sm">총길이(m)<input required type="number" min="0.001" step="0.001" value={length} onChange={(event) => setLength(event.target.value)} className={inputClass} /></label> : <div className="text-sm">계산 수량<p className="mt-3 font-semibold">{number(totalKg)} kg</p></div>}<label className="text-sm">단가(원/{unit})<input required type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className={inputClass} /></label></div>
      <label className="block text-sm">메모<textarea maxLength={2000} value={memo} onChange={(event) => setMemo(event.target.value)} className={inputClass} /></label>
      <p className="text-right font-semibold">예상 공급가액: {expected !== null ? money(expected) : "입력값 확인"}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {conflict && <p role="alert" className="text-sm text-red-700">다른 사용자가 변경했습니다. 편집창을 닫고 다시 열어주세요.</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>취소</Button><Button variant="primary" type="submit" disabled={stale || conflict}>{saving ? "저장 중…" : "배정 저장"}</Button></div>
    </fieldset></form>
  </dialog>;
}
