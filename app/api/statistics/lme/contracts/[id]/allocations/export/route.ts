import { getLmeContext } from "@/lib/lme-server";
import { MATERIAL_ALLOCATION_TYPE_LABELS } from "@/lib/material-contract-allocations";
import { queryMaterialContractAllocations } from "@/lib/material-contract-allocations-query";

function csvValue(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, employee } = await getLmeContext();
  if (!employee) return Response.json({ error: "승인된 사용자만 조회할 수 있습니다." }, { status: 403 });

  const result = await queryMaterialContractAllocations(supabase, id);
  if (result.error || !result.data) return Response.json({ error: result.error?.message ?? "사용 이력을 조회하지 못했습니다." }, { status: 500 });

  const headers = ["배정일", "사용 대상", "대상", "프로젝트 코드", "상태", "톤수", "발주번호", "메모", "작성자", "작성일"];
  const rows = result.data.map((allocation) => [
    allocation.allocation_date,
    MATERIAL_ALLOCATION_TYPE_LABELS[allocation.allocation_type],
    allocation.allocation_type === "project" ? allocation.project_name : allocation.allocation_type === "factory" ? "공장 재고" : allocation.destination_name,
    allocation.allocation_type === "project" ? allocation.project_code : "",
    allocation.status === "planned" ? "예정" : allocation.status === "confirmed" ? "확정" : "취소",
    allocation.quantity_tons,
    allocation.purchase_order_no,
    allocation.memo,
    allocation.created_by_name,
    allocation.created_at.slice(0, 10),
  ]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="material_allocations_${id}.csv"` } });
}
