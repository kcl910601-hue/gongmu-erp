import { MaterialCostStatus } from "@/components/statistics/MaterialCostStatus";
import type { ProjectMaterialCostStatus } from "@/lib/project-material-cost-status";

type Props = {
  materialStatus?: ProjectMaterialCostStatus;
  materialCount: number;
  coatingCount: number;
  glassCount: number;
  accessoryCount: number;
  additionalCount: number;
  detailed?: boolean;
};

export function ProjectCostReflectionStatus({
  materialStatus, materialCount, coatingCount, glassCount,
  accessoryCount, additionalCount, detailed = false,
}: Props) {
  const items = [
    { label: "AL", count: materialCount },
    { label: "도장", count: coatingCount },
    { label: "유리", count: glassCount },
    { label: "부자재", count: accessoryCount },
    { label: "부대비용", count: additionalCount },
  ];
  return (
    <div className={detailed ? "mt-4 rounded-xl border border-slate-200 p-3" : "min-w-48"}>
      {detailed && <h3 className="text-sm font-semibold">원가 반영 상태</h3>}
      <div className="mt-1 flex flex-wrap gap-1" aria-label="항목별 원가 등록 상태">
        {items.map(({ label, count }) => (
          <span key={label}
            className={`rounded px-2 py-1 text-xs font-normal ${count > 0 ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-800"}`}
            title={count > 0 ? `현재 집계에 포함된 유효 내역 ${count}건입니다. 정산 완료 여부는 별도 확인이 필요합니다.` : "유효 내역이 없습니다. 해당 없음 또는 비용 미등록 여부를 확인하세요."}>
            {label}: {count > 0 ? `등록 ${count}건` : "미등록"}
          </span>
        ))}
      </div>
      <MaterialCostStatus status={materialStatus} detailed={detailed} />
      {detailed && <p className="mt-2 text-xs text-slate-500">
        등록 건수는 정산 완료를 의미하지 않습니다. 미등록 항목은 해당 없음인지 확인하세요.
        도장·유리·부자재·부대비용의 미등록 금액은 현재 합계에 0원으로 반영되므로, 추가 비용이 발생하면 마진이 낮아질 수 있습니다.
      </p>}
    </div>
  );
}
