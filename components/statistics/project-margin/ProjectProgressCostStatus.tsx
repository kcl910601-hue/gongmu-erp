import Link from "next/link";
import { isTaskCompleted } from "@/lib/status";
import { getLocalDateString } from "@/lib/task-priority";

export type ProgressCostTask = { id: number; task_name: string | null; status: string | null; due_date: string | null };
type CostItem = { name: string; count: number; supply_amount_krw: number };

export function ProjectProgressCostStatus({ projectId, tasks, costs, totalCost }: {
  projectId: number; tasks: ProgressCostTask[]; costs: Record<string, CostItem>; totalCost: number | null;
}) {
  const today = getLocalDateString();
  const completed = tasks.filter(task => isTaskCompleted(task.status)).length;
  const incomplete = tasks.filter(task => !isTaskCompleted(task.status));
  const overdue = incomplete.filter(task => task.due_date && task.due_date < today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || a.id - b.id);
  const unscheduled = incomplete.filter(task => !task.due_date).length;
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : null;
  const allComplete = tasks.length > 0 && completed === tasks.length;
  const missing = [
    { code: "al", label: "AL" }, { code: "coating", label: "도장" },
    { code: "glass", label: "유리" }, { code: "accessory", label: "부자재" },
  ].filter(item => !costs[item.code]?.count).map(item => item.label);
  const additional = Object.entries(costs).filter(([code]) => !["al", "coating", "glass", "accessory"].includes(code));
  if (!additional.some(([, item]) => item.count > 0)) missing.push("부대비용");
  const money = (amount: number | null) => amount === null || !Number.isSafeInteger(amount) ? "계산 불가" : `${amount.toLocaleString("ko-KR")}원`;
  return <section className="mt-4 rounded-xl border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">공정 진행·지연과 비용 반영</h3><Link className="text-xs text-blue-700 underline" href={`/projects/${projectId}`}>프로젝트 업무 확인</Link></div>
    <p className="mt-1 text-xs text-slate-500">{today} 기준 · 업무 완료율은 업무 건수 기준이며 실제 시공 물량이나 원가 발생률이 아닙니다.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["업무 완료율", progress === null ? "업무 없음" : `${progress}% (${completed}/${tasks.length}건)`],
        ["지연 업무", `${overdue.length}건`],
        ["미완료·마감일 미등록", `${unscheduled}건`],
        ["현재 집계 총원가", money(totalCost)],
      ].map(([label, value]) => <article key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></article>)}
    </div>
    {overdue.length > 0 && <p className="mt-3 text-xs text-amber-800">지연 업무가 있습니다. 운송·노무·설치·AS 등 비용 내역과 앞으로 발생할 비용을 함께 확인하세요. 아래 금액 전체가 지연으로 발생한 비용이라는 뜻은 아닙니다.</p>}
    {allComplete && <p className={`mt-3 text-xs ${missing.length ? "text-amber-800" : "text-slate-600"}`}>{missing.length ? `업무는 모두 완료되었으나 ${missing.join("·")} 비용 내역이 없습니다. 해당 없음인지, 아직 원가가 반영되지 않았는지 확인하세요.` : "업무가 모두 완료되었고 비용 항목별 등록 내역이 있습니다. 계산서 배분과 최종 정산 완료 여부는 별도 확인이 필요합니다."}</p>}
    {!allComplete && missing.length > 0 && <p className="mt-2 text-xs text-slate-500">미등록 비용 항목: {missing.join(" · ")}. 업무 진행 단계와 항목 적용 여부를 확인하세요.</p>}
    {unscheduled > 0 && <p className="mt-2 text-xs text-slate-500">마감일이 없는 미완료 업무는 지연 여부를 판단할 수 없어 지연 건수에서 제외했습니다.</p>}
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-80 text-xs"><thead className="bg-slate-50"><tr><th className="p-2 text-left">비용 항목</th><th className="p-2 text-right">유효 내역</th><th className="p-2 text-right">현재 집계 공급가액</th></tr></thead><tbody>
      {Object.entries(costs).map(([code, item]) => <tr key={code} className="border-t"><th className="p-2 text-left font-medium">{item.name}</th><td className="p-2 text-right">{item.count}건</td><td className="p-2 text-right">{item.count > 0 ? money(item.supply_amount_krw) : "미등록"}</td></tr>)}
    </tbody></table></div>
    <details className="mt-3"><summary className="cursor-pointer text-sm">지연 업무 확인 · {overdue.length}건</summary>
      <ul className="mt-2 max-h-52 space-y-2 overflow-auto text-xs">{overdue.map(task => <li key={task.id} className="flex justify-between gap-3 rounded-lg bg-amber-50 p-2"><span>{task.task_name || "업무명 없음"}</span><span className="shrink-0">마감 {task.due_date}</span></li>)}</ul>
      {!overdue.length && <p className="mt-2 text-xs text-slate-500">마감일 기준 지연된 미완료 업무가 없습니다.</p>}
    </details>
    <p className="mt-2 text-xs text-slate-500">금액은 프로젝트 전체 누적 집계입니다. 과거 시점의 공정·원가 이력이 없어 지연 전후 비용 증가율이나 인과관계는 계산하지 않습니다.</p>
  </section>;
}
