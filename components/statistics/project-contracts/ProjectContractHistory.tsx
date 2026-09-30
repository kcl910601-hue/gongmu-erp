import { ENTRY_TYPE_LABEL, formatContractAmount, type ContractHistory, type ProjectContractEntry } from "@/lib/project-contracts";

function describe(entry: ProjectContractEntry | undefined) {
  if (!entry) return "신규 등록";
  return `${entry.contract_title} · ${ENTRY_TYPE_LABEL[entry.entry_type]} · ${entry.status === "void" ? "무효" : "유효"} · 계약일 ${entry.contract_date} · 적용일 ${entry.effective_date} · ${entry.amount_input_mode === "total" ? "총액 입력" : "증감액 입력"} · 입력 공급가액 ${formatContractAmount(Number(entry.input_supply_amount_krw ?? entry.supply_amount_krw))} · 입력 부가세 ${formatContractAmount(Number(entry.input_vat_amount_krw ?? entry.vat_amount_krw))} · 문서번호 ${entry.document_number ?? "-"} · 비고 ${entry.memo ?? "-"}`;
}

export function ProjectContractHistory({ history }: { history: ContractHistory[] }) {
  return <section className="mt-5 rounded-xl border p-4"><h3 className="text-sm font-semibold">등록·수정·무효 이력</h3><p className="mt-1 text-xs text-slate-500">기능 적용 이후 변경 이력부터 표시합니다.</p><div className="mt-3 space-y-2">
    {history.map((item) => <details key={item.id} className="rounded-lg bg-slate-50 p-3 text-xs"><summary className="cursor-pointer">{item.title} · {item.employee_name ?? "-"} · {new Date(item.created_at).toLocaleString("ko-KR")}<span className="mt-1 block">최종 공급가액 {formatContractAmount(item.metadata.before_supply)} → {formatContractAmount(item.metadata.after_supply)}</span></summary>
      <div className="mt-3 space-y-3">{item.metadata.changes.map((change) => <div key={change.id} className="space-y-1 whitespace-pre-wrap break-words"><p className="font-semibold">{change.title}{!change.is_target && " · 후속 계약 재계산"}</p><p>변경 전: {describe(item.metadata.before.find((entry) => entry.id === change.id))}</p><p>변경 후: {describe(item.metadata.after.find((entry) => entry.id === change.id))}</p><p>반영 증감액: {formatContractAmount(change.before_delta)} → {formatContractAmount(change.after_delta)}</p></div>)}</div>
    </details>)}
    {!history.length && <p className="text-xs text-slate-400">기록된 변경 이력이 없습니다.</p>}
  </div></section>;
}
