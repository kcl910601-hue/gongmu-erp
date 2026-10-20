"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAppShellUser } from "@/contexts/AppShellUserContext";
import { createNextMarketComparison, isMarketComparisonValid, type MarketComparisonDraft, type MarketComparisonHistoryRecord } from "@/lib/lme-market-comparison";
import { toast } from "@/lib/toast";

export function MarketComparisonHistory({ draft, onLoad }: {
  draft: MarketComparisonDraft;
  onLoad: (draft: MarketComparisonDraft) => void;
}) {
  const { employee } = useAppShellUser();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [records, setRecords] = useState<MarketComparisonHistoryRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/statistics/lme/comparison-history?page=${page}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json() as { records?: MarketComparisonHistoryRecord[]; hasMore?: boolean; error?: string };
        if (!response.ok) throw new Error(result.error ?? "이력을 조회하지 못했습니다.");
        if (!controller.signal.aborted) { setRecords(result.records ?? []); setHasMore(result.hasMore ?? false); }
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "이력을 조회하지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [open, page, revision]);

  async function save() {
    if (savingRef.current || !isMarketComparisonValid(draft)) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/statistics/lme/comparison-history", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "이력을 저장하지 못했습니다.");
      toast.success("비교표를 새 이력으로 저장했습니다.");
      setPage(0); setRevision((value) => value + 1); setOpen(true);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "이력을 저장하지 못했습니다.");
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      {employee?.role === "admin" && <Button variant="outline" disabled={saving || !isMarketComparisonValid(draft)} onClick={() => void save()}>{saving ? "저장 중..." : "비교표 이력 저장"}</Button>}
      <Button variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "저장 이력 닫기" : "저장 이력 보기"}</Button>
      <span className="text-xs text-slate-500">관리자 저장 · 비교표와 조회 당시 차트·출처를 함께 보관</span>
    </div>
    {open && <div className="rounded-xl border border-slate-200 p-3">
      {loading ? <p className="text-sm text-slate-500">이력을 불러오는 중...</p> : error ? <div role="alert" className="flex items-center gap-2 text-sm text-red-600">{error}<Button variant="outline" onClick={() => setRevision((value) => value + 1)}>다시 시도</Button></div> : <>
        {records.length === 0 ? <p className="text-sm text-slate-500">저장된 비교표가 없습니다.</p> : <ul className="divide-y divide-slate-100">{records.map((record) => <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div className="min-w-0 text-sm"><p className="font-semibold">{record.draft.writtenDate} · {record.draft.supplier}</p><p className="break-words text-xs text-slate-600">{record.draft.beforeLabel} → {record.draft.afterLabel}</p><p className="text-xs text-slate-500">저장: {new Date(record.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {record.created_by_name}</p></div>
          <Button variant="outline" size="sm" onClick={() => {
            if (window.confirm("현재 입력값을 저장된 비교표로 바꾸시겠습니까? 저장하지 않은 입력값은 사라집니다.")) {
              onLoad(structuredClone(record.draft));
              toast.success(record.draft.chartSnapshot ? "비교표와 저장 당시 차트를 불러왔습니다." : "이전 기록에는 차트가 없어 현재 조회 차트를 사용합니다.");
            }
          }}>불러오기</Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (window.confirm("이 기록의 변경 후 단가를 변경 전으로 가져와 새 비교표를 작성하시겠습니까? 현재 미저장 입력값은 바뀝니다.")) {
              onLoad(createNextMarketComparison(record.draft));
              toast.success("이전 단가를 가져왔습니다. 새 계약 정보와 물량을 입력해주세요.");
            }
          }}>이 기록으로 새 표 작성</Button>
        </li>)}</ul>}
        <div className="mt-2 flex items-center justify-end gap-2"><Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</Button><span className="text-xs">{page + 1} 페이지</span><Button variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage(page + 1)}>다음</Button></div>
      </>}
    </div>}
  </div>;
}
