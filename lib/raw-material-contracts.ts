export type RawMaterialContractStatus = "scheduled" | "active" | "completed" | "cancelled";
export type RawMaterialContract = {
  id: string; supplier_id: string; supplier_name: string | null; material_code: string; contract_name: string; contract_year: number;
  contract_price_krw_per_kg: number; processing_cost_krw_per_kg: number; effective_start_date: string; effective_end_date: string;
  contract_quantity_ton: number; remaining_quantity_ton: number; status: RawMaterialContractStatus; memo: string | null;
  created_by: string; created_at: string; updated_by: string | null; updated_at: string;
};
export const CONTRACT_STATUS_PRESENTATION: Record<RawMaterialContractStatus, { label: string; className: string }> = {
  scheduled: { label: "예정", className: "bg-slate-100 text-slate-700" }, active: { label: "진행중", className: "bg-blue-100 text-blue-700" }, completed: { label: "종료", className: "bg-emerald-100 text-emerald-700" }, cancelled: { label: "취소", className: "bg-red-100 text-red-700" },
};
export function suggestContractStatus(startDate: string, endDate: string, remaining: number, today = new Date().toISOString().slice(0,10)): RawMaterialContractStatus { if (remaining <= 0 || endDate < today) return "completed"; if (startDate > today) return "scheduled"; return "active"; }
export function isContractEndingSoon(contract: Pick<RawMaterialContract,"status"|"effective_end_date">, days = 30) { if (contract.status !== "active") return false; const end = new Date(`${contract.effective_end_date}T00:00:00Z`).getTime(); const now = new Date(`${new Date().toISOString().slice(0,10)}T00:00:00Z`).getTime(); return end >= now && end <= now + days * 86_400_000; }
