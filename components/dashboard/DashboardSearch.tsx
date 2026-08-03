"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { GlobalSearchResponse } from "@/types/search";
import { splitSearchHighlight } from "@/lib/search";

const EMPTY_RESULTS: GlobalSearchResponse = { projects: [], tasks: [], shipments: [], employees: [], materialContracts: [], personal: [], lme: [] };

function HighlightedText({ value, query }: { value: string; query: string }) {
  return splitSearchHighlight(value, query).map((part, index) => part.match
    ? <mark key={`${part.text}-${index}`} className="rounded bg-amber-100 px-0.5 text-inherit">{part.text}</mark>
    : <span key={`${part.text}-${index}`}>{part.text}</span>);
}

export default function DashboardSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      const timer = window.setTimeout(() => setResults(EMPTY_RESULTS), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    async function search() {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("검색 요청 실패");
        setResults(await response.json() as GlobalSearchResponse);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResults(EMPTY_RESULTS);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void search();
    return () => controller.abort();
  }, [debouncedQuery]);

  useEffect(() => {
    function clearOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setQuery(""); }
    window.addEventListener("keydown", clearOnEscape);
    return () => window.removeEventListener("keydown", clearOnEscape);
  }, []);

  const groups = [
    { title: "프로젝트", items: results.projects.map((item) => ({ key: `project-${item.id}`, href: `/projects/${item.id}`, title: item.projectName, detail: item.projectCode ?? "코드 없음" })) },
    { title: "업무", items: results.tasks.map((item) => ({ key: `task-${item.id}`, href: `/projects/${item.projectId}?task=${item.id}`, title: item.taskName ?? "업무", detail: `${item.projectName} · ${item.assignee ?? "미배정"}` })) },
    { title: "원자재", items: results.materialContracts.map((item) => ({ key: `contract-${item.id}`, href: "/statistics/lme", title: item.contractName, detail: `${item.materialCode} · ${item.supplierName ?? "공급업체 없음"}` })) },
    { title: "개인", items: results.personal.map((item) => ({ key: `personal-${item.id}`, href: "/#my-workspace", title: item.title, detail: item.noteType.toUpperCase() })) },
    { title: "출고", items: results.shipments.map((item) => ({ key: `shipment-${item.id}`, href: "/shipments", title: item.title, detail: item.projectName ?? "수동 출고" })) },
    { title: "LME", items: results.lme.map((item) => ({ key: `lme-${item.code}`, href: "/statistics/lme", title: item.name, detail: item.code })) },
  ];
  const resultCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="relative mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <Search className="text-slate-400" size={20} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="프로젝트, 업무, 원자재, 개인, 출고, LME 검색" aria-label="Dashboard 통합검색" className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
        {hasQuery ? <button type="button" onClick={() => setQuery("")} aria-label="검색 초기화" title="검색 초기화" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button> : null}
      </div>
      {hasQuery ? <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[520px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
        {query.trim().length < 2 ? <p className="p-5 text-center text-sm text-slate-500">검색어를 2글자 이상 입력해주세요.</p> : loading ? <p className="p-5 text-center text-sm text-slate-500">검색 중...</p> : resultCount === 0 ? <div className="p-5 text-center"><p className="text-sm font-semibold text-slate-700">검색 결과가 없습니다.</p><p className="mt-1 text-xs text-slate-500">다른 검색어를 입력해보세요.</p></div> : groups.filter((group) => group.items.length > 0).map((group) => <section key={group.title} className="mb-3 border-b border-slate-100 pb-3 last:mb-0 last:border-0 last:pb-0"><h3 className="px-2 py-1 text-xs font-semibold text-slate-500">{group.title} ({group.items.length})</h3>{group.items.map((item) => <Link key={item.key} href={item.href} onClick={() => setQuery("")} className="block rounded-xl px-3 py-2 hover:bg-blue-50"><p className="text-sm font-semibold text-slate-800"><HighlightedText value={item.title} query={debouncedQuery} /></p><p className="mt-0.5 text-xs text-slate-500"><HighlightedText value={item.detail} query={debouncedQuery} /></p></Link>)}</section>)}
      </div> : null}
    </div>
  );
}
