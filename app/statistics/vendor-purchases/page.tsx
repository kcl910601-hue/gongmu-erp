"use client";

import Link from "next/link";
import { PurchaseAllocationReconciliation } from "@/components/statistics/PurchaseAllocationReconciliation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PARTNER_TYPES, PARTNER_TYPE_LABELS, isPartnerType } from "@/lib/partners";
import { PURCHASE_CATEGORIES, parsePurchase, purchaseChange, purchaseTotal, type PurchaseRow, type PurchaseVendor } from "@/lib/vendor-purchases";
import { COATING_COSTS_CHANGED_EVENT, GLASS_COSTS_CHANGED_EVENT } from "@/lib/collaboration-events";
import { PURCHASE_TYPE_GROUPS, purchaseVendorType, sortPurchaseVendors, groupPurchases, purchaseShare } from "@/lib/vendor-purchases";

const yearNow = () => Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
const monthNow = () => Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", month: "numeric" }).format(new Date()));
const money = (v: number | null) => v === null ? "미입력" : v.toLocaleString("ko-KR");
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const newForm = () => ({ accounting_month: `${yearNow()}-${String(monthNow()).padStart(2, "0")}`, vendor_organization_id: "", category: "압출", supply_amount_krw: "", vat_amount_krw: "", invoice_number: "", memo: "" });
type Data = { rows: PurchaseRow[]; vendors: PurchaseVendor[]; canManage: boolean };
type Preview = { rows: Record<string, unknown>[]; errors: string[] };

export default function VendorPurchasesPage() {
  const [start, setStart] = useState(yearNow() - 1), [end, setEnd] = useState(yearNow()), [throughMonth, setThroughMonth] = useState(monthNow());
  const [vendor, setVendor] = useState(""), [category, setCategory] = useState("");
  const [partnerType, setPartnerType] = useState("");
  const [formPartnerType, setFormPartnerType] = useState("");
  const [data, setData] = useState<Data>({ rows: [], vendors: [], canManage: false });
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [form, setForm] = useState(newForm), [showForm, setShowForm] = useState(false), [preview, setPreview] = useState<Preview | null>(null);
  const [detailMonth, setDetailMonth] = useState(""), [detailPage, setDetailPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/statistics/vendor-purchases?start=${start}&end=${end}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json() as Data & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "조회 실패");
        if (!controller.signal.aborted) setData(result);
      } catch (e) { if (!controller.signal.aborted) { setData({ rows: [], vendors: [], canManage: false }); setError(e instanceof Error ? e.message : "조회 실패"); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [start, end, revision]);
  useEffect(() => {
    const refresh = () => setRevision(v => v + 1);
    window.addEventListener("focus", refresh);
    window.addEventListener(GLASS_COSTS_CHANGED_EVENT, refresh);
    window.addEventListener(COATING_COSTS_CHANGED_EVENT, refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener(GLASS_COSTS_CHANGED_EVENT, refresh); window.removeEventListener(COATING_COSTS_CHANGED_EVENT, refresh); };
  }, []);

  const years = end >= start && end - start <= 10 ? Array.from({ length: end - start + 1 }, (_, i) => start + i) : [];
  const typeVendors = useMemo(() => sortPurchaseVendors(data.vendors.filter(v => !partnerType || purchaseVendorType(v) === partnerType)), [data.vendors, partnerType]);
  const periodRows = useMemo(() => data.rows.filter(r => Number(r.accounting_month.slice(5, 7)) <= throughMonth), [data.rows, throughMonth]);
  const typeGroups = useMemo(() => groupPurchases(periodRows, data.vendors), [periodRows, data.vendors]);
  const rows = useMemo(() => {
    const ids = new Set(typeVendors.map(v => v.id));
    return data.rows.filter(r => (!partnerType || ids.has(r.vendor_organization_id)) && (!vendor || String(r.vendor_organization_id) === vendor) && (!category || r.category === category) && Number(r.accounting_month.slice(5, 7)) <= throughMonth);
  }, [data.rows, typeVendors, partnerType, vendor, category, throughMonth]);
  const vendors = typeVendors.filter(v => !vendor || String(v.id) === vendor);
  const formVendors = data.vendors.filter(v => !formPartnerType || v.partner_type === formPartnerType);
  const typeLabel = PURCHASE_TYPE_GROUPS.find(g => g.key === partnerType)?.label ?? "전체 매입";
  function selectType(type: string) {
    setPartnerType(type); setVendor(""); setCategory(""); setDetailMonth(""); setDetailPage(1);
  }
  const names = new Map(data.vendors.map(v => [v.id, v.name]));
  const details = rows.filter(r => !detailMonth || r.accounting_month.slice(0, 7) === detailMonth).sort((a, b) => (names.get(a.vendor_organization_id) ?? "").localeCompare(names.get(b.vendor_organization_id) ?? "", "ko") || b.accounting_month.localeCompare(a.accounting_month) || a.id.localeCompare(b.id));
  const page = Math.min(detailPage, Math.max(1, Math.ceil(details.length / 50)));
  const totals = years.map(year => ({ year, total: purchaseTotal(rows.filter(r => r.accounting_month.startsWith(String(year)))) }));
  async function save(inputs: Record<string, unknown>[]) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/statistics/vendor-purchases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: inputs }) });
      const result = await response.json() as { error?: string; count?: number };
      if (!response.ok) throw new Error(result.error ?? "저장 실패");
      setMessage(`${result.count}건을 저장했습니다. 입력 연도가 조회 기간 밖이면 조회 연도를 변경해주세요.`);
      setPreview(null); setShowForm(false); setForm(newForm()); setRevision(v => v + 1);
    } catch (e) { setMessage(e instanceof Error ? e.message : "저장 실패"); }
    finally { setBusy(false); }
  }
  async function upload(file: File) {
    setBusy(true); setMessage("");
    try {
      const { readPurchaseFile } = await import("@/lib/excel/vendor-purchase-export");
      const inputs = await readPurchaseFile(file), errors: string[] = [], keys = new Set<string>();
      inputs.forEach((row, i) => {
        try {
          const vendorName = String(row.vendor_name ?? "").trim().toLocaleLowerCase("ko-KR");
          if (!String(row.vendor_organization_id ?? "").trim()) {
            if (!vendorName) throw new Error("업체명을 입력해주세요.");
            const matches = data.vendors.filter(v => v.name.trim().toLocaleLowerCase("ko-KR") === vendorName && (!row.source_partner_type || purchaseVendorType(v) === row.source_partner_type));
            if (!matches.length) throw new Error("해당 유형에서 업체명을 찾을 수 없습니다. 등록된 업체명을 확인해주세요.");
            if (matches.length > 1) throw new Error("같은 유형에 동일한 업체명이 여러 개입니다. 업체 관리에서 이름을 구분한 뒤 업로드해주세요.");
            row.vendor_organization_id = matches[0].id;
          }
          if (vendorName && names.get(Number(row.vendor_organization_id))?.trim().toLocaleLowerCase("ko-KR") !== vendorName) throw new Error("업체코드와 업체명이 서로 다릅니다.");
          const parsed = parsePurchase(row);
          if (!names.has(parsed.vendor_organization_id)) throw new Error("업체코드를 확인해주세요.");
          if (row.source_partner_type && purchaseVendorType(data.vendors.find(v => v.id === parsed.vendor_organization_id)) !== row.source_partner_type) throw new Error("업체 유형이 시트와 다릅니다. 해당 유형의 시트에 입력해주세요.");
          const key = JSON.stringify([parsed.vendor_organization_id, parsed.accounting_month, parsed.category, parsed.invoice_number, parsed.supply_amount_krw, parsed.vat_amount_krw]);
          if (keys.has(key)) throw new Error("파일 안에 동일한 내역이 중복됩니다.");
          keys.add(key);
        } catch (e) { errors.push(`${String(row.source_location ?? `엑셀 ${i + 2}행`)}: ${e instanceof Error ? e.message : "입력 오류"}`); }
      });
      setPreview({ rows: inputs, errors });
    } catch (e) { setMessage(e instanceof Error ? e.message : "파일 읽기 실패"); }
    finally { setBusy(false); }
  }
  async function voidRow(id: string) {
    if (!confirm("이 내역을 무효 처리하시겠습니까? 원본과 이력은 보존되며 집계에서 제외됩니다.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/statistics/vendor-purchases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "무효 처리 실패");
      setMessage("무효 처리했습니다."); setRevision(v => v + 1);
    } catch (e) { setMessage(e instanceof Error ? e.message : "무효 처리 실패"); }
    finally { setBusy(false); }
  }
  async function download(template: boolean) {
    setBusy(true);
    try {
      const excel = await import("@/lib/excel/vendor-purchase-export");
      if (template) excel.downloadPurchaseTemplate(data.vendors);
      else excel.downloadPurchaseReport({ rows: partnerType ? rows : periodRows, vendors: partnerType ? vendors : data.vendors, start, end, throughMonth, partnerType, filterLabel: partnerType ? `${typeLabel} / ${vendor ? names.get(Number(vendor)) : "전체 업체"} / ${category || "전체 분류"}` : "전체 매입 · 모든 업체·분류" });
    } catch (e) { setMessage(e instanceof Error ? e.message : "다운로드 실패"); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen space-y-5 bg-slate-50 p-5 text-slate-800">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold">업체별 월별 매입현황</h1><p className="mt-1 text-sm text-slate-500">계산서 귀속연월 · 공급가액 기준 · 과거 연도와 같은 기간 비교</p></div><div className="flex flex-wrap gap-2"><Button disabled={loading || busy || !!error} onClick={() => void download(false)}>{typeLabel} Excel 다운로드</Button>{data.canManage && <><Button disabled={busy} onClick={() => void download(true)}>업로드 양식</Button><label className={`cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm ${busy ? "pointer-events-none opacity-50" : ""}`}>Excel 업로드<input type="file" accept=".xlsx" className="sr-only" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }}/></label><Button disabled={busy} variant="primary" onClick={() => { setFormPartnerType(partnerType); setForm(current => ({ ...current, vendor_organization_id: "" })); setShowForm(true); }}>매입 등록</Button></>}</div></header>
    <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm">유리·도장은 기존 계산서가 자동 합산됩니다. <Link className="font-semibold text-blue-700 underline" href="/statistics/glass-costs">유리 원가관리</Link> · <Link className="font-semibold text-blue-700 underline" href="/statistics/coating-costs">도장 원가관리</Link><br/>계산서별 또는 월 합계 중 한 방식으로 입력하세요. 미입력은 거래 없음과 다르며, 합계는 입력된 자료만 반영합니다.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm">{message}</p>}
    <nav aria-label="업체 유형별 매입" className="flex flex-wrap gap-2">
      {[{ key: "", label: "전체 매입" }, ...PURCHASE_TYPE_GROUPS].map(group => <button key={group.key} type="button" aria-pressed={partnerType === group.key} onClick={() => selectType(group.key)} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${partnerType === group.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}>{group.label}</button>)}
    </nav>
    <section className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-3 lg:grid-cols-6">
      <label className="text-sm">시작 연도<input className={inputClass} type="number" min="1900" max="2099" value={start} onChange={e => { setLoading(true); setStart(Number(e.target.value)); }}/></label>
      <label className="text-sm">종료 연도<input className={inputClass} type="number" min="1900" max="2099" value={end} onChange={e => { setLoading(true); setEnd(Number(e.target.value)); }}/></label>
      <label className="text-sm">동일 기간 비교<select className={inputClass} value={throughMonth} onChange={e => setThroughMonth(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>1~{i + 1}월</option>)}</select></label>
      <label className="text-sm">업체<select className={inputClass} value={vendor} onChange={e => setVendor(e.target.value)}><option value="">전체 업체</option>{typeVendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.is_active ? "" : " (비활성)"}</option>)}</select></label>
      <label className="text-sm">거래 분류<select className={inputClass} value={category} onChange={e => setCategory(e.target.value)}><option value="">전체 분류</option>{PURCHASE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><div className="self-end"><Button disabled={loading} onClick={() => setRevision(v => v + 1)}>새로 조회</Button></div>
    </section>
    {loading ? <p className="p-8 text-center text-slate-500">조회 중입니다.</p> : !error && <>
      <PurchaseAllocationReconciliation key={`${start}-${end}-${throughMonth}-${partnerType}-${vendor}-${category}`} rows={rows} vendors={data.vendors} />
      {!partnerType && <section className="overflow-x-auto rounded-2xl border bg-white"><h2 className="p-4 font-semibold">전체 매입 중 업체 유형별 금액·비중</h2><p className="px-4 pb-3 text-xs text-slate-500">선택 기간의 모든 업체·분류 기준입니다. 아래 상세 필터와 관계없이 전체 매입을 비교합니다. 업체 관리의 현재 유형을 사용합니다.</p><table className="w-full whitespace-nowrap text-right text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-left">업체 유형</th>{years.map(y => <th key={y} className="p-3">{y}년 금액 / 전체 비중</th>)}</tr></thead><tbody>{typeGroups.map(group => <tr key={group.key} className="border-t"><td className="p-3 text-left"><button className="text-blue-700" onClick={() => selectType(group.key)}>{group.label}</button></td>{years.map(y => { const amount = purchaseTotal(group.rows.filter(r => r.accounting_month.startsWith(String(y)))); const total = purchaseTotal(periodRows.filter(r => r.accounting_month.startsWith(String(y)))); return <td key={y} className="p-3">{money(amount)} <span className="ml-2 text-slate-500">({purchaseShare(amount, total)})</span></td>; })}</tr>)}</tbody><tfoot className="border-t bg-slate-50 font-semibold"><tr><td className="p-3 text-left">전체 매입 합계</td>{years.map(y => <td key={y} className="p-3">{money(purchaseTotal(periodRows.filter(r => r.accounting_month.startsWith(String(y)))))}</td>)}</tr></tfoot></table></section>}
      <section className="grid gap-3 sm:grid-cols-3">{totals.map((t, i) => <article key={t.year} className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{t.year}년 1~{throughMonth}월</p><p className="mt-2 text-xl font-bold">{money(t.total)}{t.total === null ? "" : "원"}</p><p className="mt-1 text-xs text-slate-500">전년 동기: {purchaseChange(t.total, totals[i - 1]?.total ?? null)}</p></article>)}</section>
      <section className="overflow-x-auto rounded-2xl border bg-white"><h2 className="p-4 font-semibold">{typeLabel} · 업체별 연도 비교 <span className="text-xs font-normal text-slate-500">단위: 원 · 금액 클릭 시 업체 필터 적용</span></h2><table className="w-full whitespace-nowrap text-right text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-left">업체</th>{years.map(y => <th key={y} className="p-3">{y}년 1~{throughMonth}월</th>)}<th className="p-3">최근 연도 증감률</th></tr></thead><tbody>{vendors.map(v => { const sums = years.map(y => purchaseTotal(rows.filter(r => r.vendor_organization_id === v.id && r.accounting_month.startsWith(String(y))))); return <tr key={v.id} className="border-t"><td className="p-3 text-left"><span className="mr-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">{isPartnerType(v.partner_type) ? PARTNER_TYPE_LABELS[v.partner_type] : "미지정"}</span>{v.name}{v.is_active ? "" : " (비활성)"}</td>{sums.map((n, i) => <td key={years[i]} className="p-3"><button className="text-blue-700" onClick={() => { setVendor(String(v.id)); setDetailMonth(""); }}>{money(n)}</button></td>)}<td className="p-3">{purchaseChange(sums.at(-1) ?? null, sums.at(-2) ?? null)}</td></tr>; })}{!vendors.length && <tr><td colSpan={years.length + 2} className="p-8 text-center text-slate-400">등록된 업체가 없습니다.</td></tr>}</tbody></table></section>
      <section className="overflow-x-auto rounded-2xl border bg-white"><h2 className="p-4 font-semibold">분류별 비교</h2><table className="w-full text-right text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-left">분류</th>{years.map(y => <th key={y} className="p-3">{y}년 1~{throughMonth}월</th>)}</tr></thead><tbody>{PURCHASE_CATEGORIES.filter(c => (!category || c === category) && (!partnerType || rows.some(r => r.category === c))).map(c => <tr key={c} className="border-t"><td className="p-3 text-left">{c}</td>{years.map(y => <td key={y} className="p-3">{money(purchaseTotal(rows.filter(r => r.category === c && r.accounting_month.startsWith(String(y)))))}</td>)}</tr>)}</tbody></table></section>
      <section className="overflow-x-auto rounded-2xl border bg-white"><h2 className="p-4 font-semibold">월별 비교</h2><table className="w-full text-right text-sm"><thead className="bg-slate-100"><tr><th className="p-3">월</th>{years.map(y => <th key={y} className="p-3">{y}년</th>)}</tr></thead><tbody>{Array.from({ length: throughMonth }, (_, i) => <tr key={i} className="border-t"><td className="p-3">{i + 1}월</td>{years.map(y => { const key = `${y}-${String(i + 1).padStart(2, "0")}`; return <td key={y} className="p-3"><button className="text-blue-700" onClick={() => { setDetailMonth(key); setDetailPage(1); }}>{money(purchaseTotal(rows.filter(r => r.accounting_month.startsWith(key))))}</button></td>; })}</tr>)}</tbody></table></section>
      <section className="overflow-x-auto rounded-2xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-2 p-4"><h2 className="font-semibold">계산서 상세 · {details.length}건</h2><label className="flex items-center gap-2 text-sm">상세 월<input type="month" className={inputClass} value={detailMonth} onChange={e => { setDetailMonth(e.target.value); setDetailPage(1); }}/><Button onClick={() => setDetailMonth("")}>전체</Button></label></div><table className="w-full whitespace-nowrap text-right text-sm"><thead className="bg-slate-100"><tr>{["귀속연월", "업체", "분류", "공급가액", "VAT", "합계", "계산서번호", "메모", "관리"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{details.slice((page - 1) * 50, page * 50).map(r => <tr key={`${r.source}-${r.id}`} className="border-t"><td className="p-3">{r.accounting_month.slice(0, 7)}</td><td className="p-3">{names.get(r.vendor_organization_id) ?? "업체 없음"}</td><td className="p-3">{r.category}</td><td className="p-3">{money(r.supply_amount_krw)}</td><td className="p-3">{money(r.vat_amount_krw)}</td><td className="p-3">{money(r.supply_amount_krw + r.vat_amount_krw)}</td><td className="p-3">{r.invoice_number ?? "-"}</td><td className="max-w-72 whitespace-normal p-3 text-left">{r.memo ?? "-"}</td><td className="p-3">{r.source === "manual" ? data.canManage && <button disabled={busy} className="text-red-600 disabled:opacity-50" onClick={() => void voidRow(r.id)}>무효</button> : <Link className="text-blue-700" href={`/statistics/${r.source === "glass" ? "glass" : "coating"}-costs`}>원본 관리</Link>}</td></tr>)}{!details.length && <tr><td colSpan={9} className="p-8 text-center text-slate-400">입력된 계산서가 없습니다.</td></tr>}</tbody></table><div className="flex items-center justify-end gap-3 p-3"><Button disabled={page <= 1} onClick={() => setDetailPage(page - 1)}>이전</Button><span className="text-sm">{page} / {Math.max(1, Math.ceil(details.length / 50))}</span><Button disabled={page * 50 >= details.length} onClick={() => setDetailPage(page + 1)}>다음</Button></div></section>
    </>}
    {showForm && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4"><section role="dialog" aria-modal="true" aria-label="매입 등록" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5"><h2 className="text-lg font-bold">매입 등록</h2><p className="my-3 text-sm text-slate-500">지난해 등 과거 연월도 입력할 수 있습니다. 수정계산서는 음수, 거래 없음은 0원으로 입력합니다.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">귀속연월<input type="month" className={inputClass} value={form.accounting_month} onChange={e => setForm({ ...form, accounting_month: e.target.value })}/></label><label className="text-sm">업체 유형<select className={inputClass} value={formPartnerType} onChange={e => { setFormPartnerType(e.target.value); setForm({ ...form, vendor_organization_id: "" }); }}><option value="">전체 유형</option>{PARTNER_TYPES.map(t => <option key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</option>)}</select></label><label className="text-sm">업체<select className={inputClass} value={form.vendor_organization_id} onChange={e => setForm({ ...form, vendor_organization_id: e.target.value })}><option value="">선택</option>{formVendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.is_active ? "" : " (비활성)"}</option>)}</select></label><label className="text-sm">분류<select className={inputClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{PURCHASE_CATEGORIES.filter(c => c !== "유리" && c !== "도장").map(c => <option key={c}>{c}</option>)}</select></label><label className="text-sm">계산서번호<input className={inputClass} maxLength={100} value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })}/></label><label className="text-sm">공급가액<input type="number" step="1" className={inputClass} value={form.supply_amount_krw} onChange={e => setForm({ ...form, supply_amount_krw: e.target.value, vat_amount_krw: e.target.value === "" ? "" : String(Math.round(Number(e.target.value) * 0.1)) })}/></label><label className="text-sm">VAT (자동 계산·수정 가능)<input type="number" step="1" className={inputClass} value={form.vat_amount_krw} onChange={e => setForm({ ...form, vat_amount_krw: e.target.value })}/></label><label className="text-sm sm:col-span-2">메모<textarea className={inputClass} maxLength={1000} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })}/></label></div>{message && <p role="status" className="mt-3 text-sm text-blue-700">{message}</p>}<div className="mt-4 flex justify-end gap-2"><Button disabled={busy} onClick={() => setShowForm(false)}>닫기</Button><Button disabled={busy} variant="primary" onClick={() => { try { parsePurchase(form); void save([form]); } catch (e) { setMessage(e instanceof Error ? e.message : "입력 오류"); } }}>저장</Button></div></section></div>}
    {preview && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4"><section role="dialog" aria-modal="true" aria-label="업로드 확인" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5"><h2 className="font-bold">업로드 확인 · {preview.rows.length}건</h2><p className="my-3 text-sm">최종 저장 시 업체와 중복 내역을 다시 확인합니다. 오류가 있으면 전체 등록을 취소합니다.</p>{preview.errors.map((e, i) => <p key={i} className="text-sm text-red-600">{e}</p>)}<div className="my-3 max-h-80 overflow-auto"><table className="w-full text-sm"><thead><tr>{["연월", "업체", "분류", "공급가액", "VAT"].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{preview.rows.map((r, i) => <tr key={i} className="border-t"><td className="p-2">{String(r.accounting_month)}</td><td className="p-2">{names.get(Number(r.vendor_organization_id)) ?? String(r.vendor_organization_id)}</td><td className="p-2">{String(r.category)}</td><td className="p-2">{String(r.supply_amount_krw)}</td><td className="p-2">{String(r.vat_amount_krw)}</td></tr>)}</tbody></table></div>{message && <p role="status" className="my-3 text-sm text-blue-700">{message}</p>}<div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => setPreview(null)}>취소</Button><Button variant="primary" disabled={busy || preview.errors.length > 0} onClick={() => void save(preview.rows)}>확인 후 전체 등록</Button></div></section></div>}
  </main>;
}
