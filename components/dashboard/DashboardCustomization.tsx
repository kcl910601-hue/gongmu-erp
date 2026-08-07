"use client";

import { ChevronDown, ChevronRight, GripVertical, RotateCcw, Settings2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { DASHBOARD_CARD_IDS, getDefaultDashboardPreferences, moveDashboardCard, normalizeDashboardPreferences, type DashboardCardId, type DashboardCardPreference, type DashboardCardSize } from "@/lib/dashboard-preferences";

const labels: Record<DashboardCardId, string> = {
  today_tasks: "오늘 할 일",
  workspace: "My Workspace",
  kpi: "KPI",
  shipments: "업무·출고",
  progress: "진행 현황",
  recent_projects: "최근 프로젝트",
  recent_activity: "최근 활동",
};
const sizeLabels: Record<DashboardCardSize, string> = { small: "Small", medium: "Medium", large: "Large" };
const spanClasses: Record<DashboardCardSize, string> = { small: "xl:col-span-4", medium: "xl:col-span-6", large: "xl:col-span-12" };

type ContextValue = {
  cards: DashboardCardPreference[];
  editing: boolean;
  draggingId: DashboardCardId | null;
  dragOverId: DashboardCardId | null;
  updateCard: (cardId: DashboardCardId, change: Partial<DashboardCardPreference>) => void;
  moveCard: (sourceId: DashboardCardId, targetId: DashboardCardId) => void;
  setDraggingId: (cardId: DashboardCardId | null) => void;
  setDragOverId: (cardId: DashboardCardId | null) => void;
};
const DashboardCustomizationContext = createContext<ContextValue | null>(null);

export function DashboardCustomization({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState(getDefaultDashboardPreferences);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<DashboardCardId | null>(null);
  const [dragOverId, setDragOverId] = useState<DashboardCardId | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/dashboard-preferences", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Dashboard 설정을 불러오지 못했습니다.");
      const result = await response.json() as { cards?: unknown };
      if (active) setCards(normalizeDashboardPreferences(result.cards));
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Dashboard 설정을 불러오지 못했습니다."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const save = useCallback(async (next: DashboardCardPreference[]) => {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dashboard-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cards: next }) });
      const result = await response.json() as { cards?: unknown; error?: string };
      if (!response.ok) throw new Error(result.error || "Dashboard 설정을 저장하지 못했습니다.");
      setCards(normalizeDashboardPreferences(result.cards));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Dashboard 설정을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }, []);

  const updateCard = useCallback((cardId: DashboardCardId, change: Partial<DashboardCardPreference>) => {
    const next = cards.map((card) => card.cardId === cardId ? { ...card, ...change, cardId } : card);
    setCards(next); void save(next);
  }, [cards, save]);
  const moveCard = useCallback((sourceId: DashboardCardId, targetId: DashboardCardId) => {
    const next = moveDashboardCard(cards, sourceId, targetId);
    setCards(next); void save(next);
  }, [cards, save]);
  const reset = async () => {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/dashboard-preferences", { method: "DELETE" });
      if (!response.ok) throw new Error("Dashboard 기본값을 복원하지 못했습니다.");
      setCards(getDefaultDashboardPreferences()); setConfirmReset(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Dashboard 기본값을 복원하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const hiddenCards = cards.filter((card) => card.hidden);
  const context = useMemo(() => ({ cards, editing, draggingId, dragOverId, updateCard, moveCard, setDraggingId, setDragOverId }), [cards, editing, draggingId, dragOverId, updateCard, moveCard]);

  return <DashboardCustomizationContext.Provider value={context}>
    <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
      {error && <p role="alert" className="mr-auto text-xs font-medium text-red-600">{error}</p>}
      {editing && <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setConfirmReset(true)}><RotateCcw size={14}/> 기본값으로 초기화</Button>}
      <Button type="button" size="sm" variant={editing ? "primary" : "secondary"} disabled={loading} onClick={() => setEditing((current) => !current)}><Settings2 size={15}/> {editing ? "편집 완료" : "대시보드 편집"}</Button>
    </div>
    {editing && hiddenCards.length > 0 && <section className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4"><h2 className="text-sm font-bold text-slate-800">숨겨진 카드</h2><div className="mt-3 flex flex-wrap gap-2">{hiddenCards.map((card) => <button key={card.cardId} type="button" onClick={() => updateCard(card.cardId, { hidden: false })} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:bg-blue-50">+ {labels[card.cardId]}</button>)}</div></section>}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">{children}</div>
    {confirmReset && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onClick={() => setConfirmReset(false)}><div role="dialog" aria-modal="true" aria-labelledby="dashboard-reset-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><h2 id="dashboard-reset-title" className="font-bold text-slate-950">Dashboard를 초기화할까요?</h2><p className="mt-2 text-sm text-slate-500">카드 순서, 크기, 숨김, 접힘 상태가 기본값으로 복원됩니다.</p></div><button type="button" aria-label="초기화 확인 닫기" onClick={() => setConfirmReset(false)}><X size={18}/></button></div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setConfirmReset(false)}>취소</Button><Button type="button" variant="danger" disabled={saving} onClick={() => void reset()}>초기화</Button></div></div></div>}
  </DashboardCustomizationContext.Provider>;
}

export function DashboardCard({ cardId, summary, children }: { cardId: DashboardCardId; summary?: ReactNode; children: ReactNode }) {
  const context = useContext(DashboardCustomizationContext);
  if (!context) throw new Error("DashboardCard는 DashboardCustomization 안에서 사용해야 합니다.");
  const preference = context.cards.find((card) => card.cardId === cardId) ?? getDefaultDashboardPreferences().find((card) => card.cardId === cardId)!;
  if (preference.hidden) return null;
  const ordered = [...context.cards].sort((left, right) => left.order - right.order);
  const index = ordered.findIndex((card) => card.cardId === cardId);
  const moveByKeyboard = (offset: number) => { const target = ordered[index + offset]; if (target) context.moveCard(cardId, target.cardId); };
  return <section
    data-dashboard-card={cardId}
    data-dashboard-size={preference.size}
    draggable={context.editing}
    onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/dashboard-card", cardId); context.setDraggingId(cardId); }}
    onDragEnd={() => { context.setDraggingId(null); context.setDragOverId(null); }}
    onDragOver={(event) => { if (!context.editing || context.draggingId === cardId) return; event.preventDefault(); context.setDragOverId(cardId); }}
    onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData("text/dashboard-card") as DashboardCardId; if (DASHBOARD_CARD_IDS.includes(source) && source !== cardId) context.moveCard(source, cardId); context.setDraggingId(null); context.setDragOverId(null); }}
    style={{ order: preference.order }}
    className={`${spanClasses[preference.size]} min-w-0 ${preference.hidden ? "opacity-60" : ""} ${context.draggingId === cardId ? "opacity-40" : ""} ${context.dragOverId === cardId ? "rounded-2xl ring-2 ring-blue-400 ring-offset-2" : ""}`}
  >
    <div className="mb-2 flex min-h-10 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      {context.editing && <GripVertical size={16} aria-hidden="true" className="cursor-grab text-slate-400"/>}
      <button type="button" aria-expanded={!preference.collapsed} onClick={() => context.updateCard(cardId, { collapsed: !preference.collapsed })} className="inline-flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-bold text-slate-800">{preference.collapsed ? <ChevronRight size={15}/> : <ChevronDown size={15}/>}<span className="truncate">{labels[cardId]}</span>{preference.collapsed && summary && <span className="ml-1 font-medium text-slate-500">{summary}</span>}</button>
      {context.editing && <><div className="flex rounded-lg bg-slate-100 p-0.5">{(["small", "medium", "large"] as const).map((size) => <button key={size} type="button" aria-label={`${labels[cardId]} ${sizeLabels[size]} 크기`} onClick={() => context.updateCard(cardId, { size })} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${preference.size === size ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{sizeLabels[size]}</button>)}</div><button type="button" aria-label={`${labels[cardId]} 위로 이동`} disabled={index <= 0} onClick={() => moveByKeyboard(-1)} className="rounded-lg px-2 py-1 text-xs text-slate-500 disabled:opacity-30">↑</button><button type="button" aria-label={`${labels[cardId]} 아래로 이동`} disabled={index >= ordered.length - 1} onClick={() => moveByKeyboard(1)} className="rounded-lg px-2 py-1 text-xs text-slate-500 disabled:opacity-30">↓</button><button type="button" onClick={() => context.updateCard(cardId, { hidden: true })} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600">숨기기</button></>}
    </div>
    {!preference.collapsed && !preference.hidden && <div className="dashboard-card-body min-w-0">{children}</div>}
  </section>;
}

export function useDashboardCardSize(cardId: DashboardCardId): DashboardCardSize {
  const context = useContext(DashboardCustomizationContext);
  if (!context) throw new Error("Dashboard 카드 크기는 DashboardCustomization 안에서 조회해야 합니다.");
  return context.cards.find((card) => card.cardId === cardId)?.size
    ?? getDefaultDashboardPreferences().find((card) => card.cardId === cardId)?.size
    ?? "large";
}
