import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PurchaseRow, PurchaseVendor } from "@/lib/vendor-purchases";

export function PurchaseAllocationReconciliation({ rows, vendors }: { rows: PurchaseRow[]; vendors: PurchaseVendor[] }) {
  const [onlyUnbalanced, setOnlyUnbalanced] = useState(false);
  const [requestedPage, setRequestedPage] = useState(1);
  const statements = rows.filter(row => row.source === "glass" || row.source === "coating");
  const missing = statements.some(row => row.allocated_supply_amount_krw === undefined);
  const totals = statements.reduce((sum, row) => {
    const allocated = row.allocated_supply_amount_krw ?? 0;
    const remaining = row.supply_amount_krw - allocated;
    return { supply: sum.supply + row.supply_amount_krw, allocated: sum.allocated + allocated,
      remaining: sum.remaining + Math.max(remaining, 0), excess: sum.excess + Math.max(-remaining, 0) };
  }, { supply: 0, allocated: 0, remaining: 0, excess: 0 });
  const visible = statements.filter(row => !onlyUnbalanced || row.supply_amount_krw !== row.allocated_supply_amount_krw)
    .sort((a, b) => b.accounting_month.localeCompare(a.accounting_month) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(visible.length / 20));
  const page = Math.min(requestedPage, pages);
  const names = new Map(vendors.map(vendor => [vendor.id, vendor.name]));
  const money = (amount: number) => amount.toLocaleString("ko-KR");
  return <section className="rounded-2xl border bg-white p-4">
    <h2 className="font-semibold">유리·도장 계산서와 프로젝트 배분 대조</h2>
    <p className="mt-1 text-xs text-slate-500">선택 연도·동일 기간·업체 유형·업체·분류 필터 기준입니다. 유효 계산서의 공급가액과 현재 유효 프로젝트 배분액을 비교하며 VAT는 제외합니다. 배분일이 아닌 계산서 귀속연월 기준입니다.</p>
    <p className="mt-1 text-xs text-slate-500">AL·부자재 등 수기 매입은 대조 대상에서 제외합니다. 배분 완료는 지급·정산 완료를 의미하지 않습니다. 이 대조표는 화면 조회용이며 기존 Excel에는 포함되지 않습니다.</p>
    {missing ? <p role="alert" className="mt-3 text-sm text-amber-800">배분 정보를 확인할 수 없습니다. 새로 조회해주세요.</p> : <>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {([ ["계산서 공급가액", totals.supply], ["프로젝트 배분액", totals.allocated], ["미배분 잔액", totals.remaining], ["초과 배분액", totals.excess] ] as const).map(([label, amount]) => <article key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{statements.length ? `${money(amount)}원` : "자료 없음"}</p></article>)}
      </div>
      <label className="my-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyUnbalanced} onChange={event => { setOnlyUnbalanced(event.target.checked); setRequestedPage(1); }}/>미배분·초과 배분만 보기 <span className="text-xs text-slate-500">(위 합계는 전체 대조 대상 기준)</span></label>
      <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-xs">
        <thead className="bg-slate-100"><tr>{["귀속연월", "업체", "분류", "계산서번호", "공급가액", "배분액", "잔액", "배분 상태", "원본"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{visible.slice((page - 1) * 20, page * 20).map(row => {
          const allocated = row.allocated_supply_amount_krw ?? 0;
          const remaining = row.supply_amount_krw - allocated;
          return <tr key={`${row.source}-${row.id}`} className="border-t">
            <td className="p-2">{row.accounting_month.slice(0, 7)}</td><td className="p-2">{names.get(row.vendor_organization_id) ?? "업체 없음"}</td>
            <td className="p-2">{row.category}</td><td className="p-2">{row.invoice_number ?? "—"}</td>
            <td className="p-2">{money(row.supply_amount_krw)}</td><td className="p-2">{money(allocated)}</td><td className="p-2">{money(remaining)}</td>
            <td className={`p-2 ${remaining === 0 ? "text-slate-600" : remaining > 0 ? "text-amber-800" : "text-red-700"}`}>{remaining === 0 ? "배분 완료" : remaining < 0 ? "초과 배분" : allocated === 0 ? "미배분" : "일부 배분"}</td>
            <td className="p-2"><Link className="text-blue-700 underline" href={`/statistics/${row.source === "glass" ? "glass" : "coating"}-costs`}>원가관리</Link></td>
          </tr>;
        })}{!visible.length && <tr><td colSpan={9} className="p-6 text-center text-slate-500">{onlyUnbalanced && statements.length ? "미배분·초과 배분 계산서가 없습니다." : "대조할 유리·도장 계산서가 없습니다."}</td></tr>}</tbody>
      </table></div>
      <div className="mt-3 flex items-center justify-end gap-3 text-sm"><Button disabled={page <= 1} onClick={() => setRequestedPage(page - 1)}>이전</Button><span>{page} / {pages} · {visible.length}건</span><Button disabled={page >= pages} onClick={() => setRequestedPage(page + 1)}>다음</Button></div>
    </>}
  </section>;
}
