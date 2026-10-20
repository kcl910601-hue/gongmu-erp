import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { calculateCoatingExpectedKrw, type CoatingPlanContext } from "@/lib/coating-plans";
import { COATING_COSTS_CHANGED_EVENT } from "@/lib/collaboration-events";

const categories = { accessory: "부자재", factory_stock: "공장 재고", other: "기타" } as const;
type Item = { id: string; version: number; vendor_organization_id: number; category: keyof typeof categories; item_name: string; quantity: number; unit: string; unit_price_krw: number; expected_amount_krw: number; memo: string | null; status: string };
const fresh = () => ({ id: crypto.randomUUID(), version: 0, vendorId: "", category: "accessory", itemName: "", quantity: "", unit: "kg", unitPrice: "", memo: "" });
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const money = (amount: number) => Number.isSafeInteger(amount) ? `${amount.toLocaleString("ko-KR")}원` : "금액 범위 확인 필요";

export function CoatingExtraItems({ projectId, data, linkedExpected, summaryOnly }: { projectId: number; data: CoatingPlanContext; linkedExpected: number; summaryOnly: boolean }) {
  const [rows, setRows] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ReturnType<typeof fresh> | null>(null);
  const [saveError, setSaveError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/statistics/coating-extras?projectId=${projectId}`, { cache: "no-store", signal });
      const body = await response.json() as { rows?: Item[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "조회 실패");
      if (!signal?.aborted) { setRows(body.rows ?? []); setError(""); setLoaded(true); }
    } catch (reason) { if (!signal?.aborted) { setError(reason instanceof Error ? reason.message : "조회 실패"); setLoaded(false); } }
  }, [projectId]);
  useEffect(() => {
    let controller = new AbortController();
    const refresh = () => { controller.abort(); controller = new AbortController(); void load(controller.signal); };
    void load(controller.signal);
    window.addEventListener(COATING_COSTS_CHANGED_EVENT, refresh); window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.removeEventListener(COATING_COSTS_CHANGED_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, [load]);
  async function save(payload: Record<string, unknown>) {
    setSaving(true); setSaveError("");
    try {
      const response = await fetch("/api/statistics/coating-extras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, projectId }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "저장 실패");
      setForm(null); window.dispatchEvent(new CustomEvent(COATING_COSTS_CHANGED_EVENT));
    } catch (reason) { setSaveError(reason instanceof Error ? reason.message : "저장 실패"); }
    finally { setSaving(false); }
  }
  const total = rows.filter(row => row.status === "active").reduce((sum, row) => sum + Number(row.expected_amount_krw), 0);
  const preview = form ? calculateCoatingExpectedKrw(Number(form.quantity), Number(form.unitPrice)) : null;
  return <section className="mt-4 rounded-xl border border-slate-200 p-3">
    <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">압출 외 도장 항목</h4>{!summaryOnly && data.canManage && <Button size="sm" disabled={!loaded || saving} onClick={() => { setForm(fresh()); setSaveError(""); }}>항목 추가</Button>}</div>
    <p className="mt-1 text-xs text-slate-500">부자재·공장 재고 등 압출 발주가 없는 도장 물량입니다. AL 원가와 압출 잔량에는 반영하지 않으며, 공장 재고 수량도 자동 차감하지 않습니다.</p>
    {error && <p role="alert" className="mt-2 text-sm text-amber-800">{error} <button type="button" className="underline" onClick={() => void load()}>다시 조회</button></p>}
    {loaded && <p className="mt-2 text-sm">압출 외 예상금액 <strong>{money(total)}</strong> · 압출 연계 포함 도장 예상금액 <strong>{money(linkedExpected + total)}</strong></p>}
    <p className="mt-1 text-xs text-slate-500">도장 실제원가는 기존 계산서로 정산합니다. 예상금액을 실제원가에 중복 합산하지 않습니다.</p>
    {!summaryOnly && loaded && <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-50"><tr>{["구분 / 품명", "업체", "수량", "단가", "예상금액", "상태", "관리"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className={`border-t ${row.status !== "active" ? "text-slate-400" : ""}`}>
      <td className="p-2">{categories[row.category]} · {row.item_name}{row.memo && <p className="whitespace-pre-wrap text-slate-500">{row.memo}</p>}</td><td>{data.vendors.find(vendor => vendor.id === row.vendor_organization_id)?.name ?? "업체 정보 없음"}</td><td>{Number(row.quantity).toLocaleString("ko-KR")} {row.unit}</td><td>{Number(row.unit_price_krw).toLocaleString("ko-KR")}원/{row.unit}</td><td>{money(Number(row.expected_amount_krw))}</td><td>{row.status === "active" ? "유효" : "취소"}</td><td>{data.canManage && row.status === "active" && <div className="flex gap-2"><button disabled={saving} className="text-blue-700" onClick={() => { setSaveError(""); setForm({ id: row.id, version: row.version, vendorId: String(row.vendor_organization_id), category: row.category, itemName: row.item_name, quantity: String(row.quantity), unit: row.unit, unitPrice: String(row.unit_price_krw), memo: row.memo ?? "" }); }}>수정</button><button disabled={saving} onClick={() => { if (window.confirm("이 도장 항목을 취소하시겠습니까?")) void save({ id: row.id, version: row.version, action: "cancel" }); }}>취소</button></div>}</td>
    </tr>)}{!rows.length && <tr><td colSpan={7} className="p-4 text-center text-slate-500">등록된 압출 외 도장 항목이 없습니다.</td></tr>}</tbody></table></div>}
    {form && <form className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3" onSubmit={event => { event.preventDefault(); if (preview !== null) void save(form); }}>
      <h4 className="text-sm font-semibold">{form.version ? "항목 수정" : "항목 등록"}</h4>
      <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs">구분<select className={inputClass} value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs">품명<input required maxLength={200} className={inputClass} value={form.itemName} onChange={event => setForm({ ...form, itemName: event.target.value })}/></label>
        <label className="text-xs">도장업체<select required className={inputClass} value={form.vendorId} onChange={event => setForm({ ...form, vendorId: event.target.value })}><option value="">선택</option>{data.vendors.filter(vendor => vendor.is_active || String(vendor.id) === form.vendorId).map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
        <label className="text-xs">단위<select className={inputClass} value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })}>{["kg", "m", "EA", "SET", "lot"].map(unit => <option key={unit} value={unit}>{unit === "lot" ? "일괄 (lot)" : unit}</option>)}</select></label>
        <label className="text-xs">수량<input required type="number" min="0.001" step="0.001" className={inputClass} value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })}/></label>
        <label className="text-xs">단가 (원·VAT 제외)<input required type="number" min="0.01" step="0.01" className={inputClass} value={form.unitPrice} onChange={event => setForm({ ...form, unitPrice: event.target.value })}/></label>
        <label className="text-xs sm:col-span-2">메모<textarea maxLength={2000} className={inputClass} value={form.memo} onChange={event => setForm({ ...form, memo: event.target.value })}/></label>
      </fieldset>
      <p className="text-sm">예상금액: {preview === null ? "수량·단가 확인 필요" : money(preview)}</p>
      <div className="flex gap-2"><Button type="submit" variant="primary" disabled={saving || preview === null}>저장</Button><Button disabled={saving} onClick={() => { setForm(null); setSaveError(""); }}>닫기</Button></div>
    </form>}
    {saveError && <p role="alert" className="mt-2 text-sm text-red-700">{saveError}</p>}
  </section>;
}
