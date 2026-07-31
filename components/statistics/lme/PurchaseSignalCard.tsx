import type { PurchaseSignal } from "@/lib/lme-market";

const styles: Record<PurchaseSignal["code"], string> = { favorable: "border-emerald-200 bg-emerald-50 text-emerald-800", neutral: "border-blue-200 bg-blue-50 text-blue-800", cautious: "border-amber-200 bg-amber-50 text-amber-900", insufficient: "border-slate-200 bg-slate-50 text-slate-600" };
export function PurchaseSignalCard({ signal }: { signal: PurchaseSignal }) { return <section className={`rounded-2xl border p-4 ${styles[signal.code]}`}><p className="text-xs font-semibold opacity-70">구매 참고 신호</p><h2 className="mt-1 text-lg font-bold">{signal.label}</h2><p className="mt-1 text-sm">{signal.reason}</p><p className="mt-2 text-[11px] opacity-70">사내 원자재 계약 검토를 위한 규칙 기반 참고 정보입니다.</p></section>; }
