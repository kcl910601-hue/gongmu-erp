import type { ProjectMaterialCostStatus } from "@/lib/project-material-cost-status";

export function MaterialCostStatus({ status, detailed = false }: { status?: ProjectMaterialCostStatus; detailed?: boolean }) {
  if (!status) return <span className="block text-xs text-slate-500">원가 연결 상태 확인 중</span>;
  const quantity = status.unallocatedKg.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  return <span className="mt-1 block space-y-1 text-xs font-normal">
    <span className="inline-block rounded bg-slate-100 px-2 py-1 text-slate-700">{status.basis === "allocation" ? "LME 연결" : "예상원가 기준"}</span>
    {status.unallocatedKg > 0 && <span className="block rounded bg-amber-50 px-2 py-1 text-amber-800">
      미배정 {quantity} kg
      {detailed && <span className="mt-1 block">{status.basis === "allocation"
        ? "이 물량은 현재 원가에 포함되지 않아 표시된 이익이 높게 나올 수 있습니다."
        : "현재 손익은 입력한 예상원가 기준입니다. 미배정 물량의 원가 포함 여부를 확인하세요."}</span>}
    </span>}
  </span>;
}
