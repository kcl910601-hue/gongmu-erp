export type ProjectContractEntryType = "original" | "increase" | "decrease";
export type ProjectContractEntryStatus = "confirmed" | "void";

export type ProjectContractEntry = {
  id: string; project_id: number; entry_type: ProjectContractEntryType; contract_title: string;
  contract_date: string; effective_date: string; document_number: string | null;
  supply_amount_krw: number; vat_amount_krw: number; total_amount_krw: number;
  status: ProjectContractEntryStatus; memo: string | null; created_by: string;
  created_by_name?: string | null; created_at: string; updated_by: string | null; updated_at: string;
};

export type ProjectContractSummary = {
  original_supply_amount_krw: number | null; increase_supply_amount_krw: number;
  decrease_supply_amount_krw: number; final_supply_amount_krw: number | null;
  original_vat_amount_krw: number | null; increase_vat_amount_krw: number;
  decrease_vat_amount_krw: number; final_vat_amount_krw: number | null;
  final_total_amount_krw: number | null; confirmed_entry_count: number; has_original_contract: boolean;
};

export const ENTRY_TYPE_LABEL: Record<ProjectContractEntryType, string> = { original: "최초 계약", increase: "증액", decrease: "감액" };
export const ENTRY_STATUS_LABEL: Record<ProjectContractEntryStatus, string> = { confirmed: "유효", void: "무효" };
export function calculateVat(supplyAmount: number) { return Math.round(supplyAmount * 0.1); }
export function formatContractAmount(value: number | null) { return value === null ? "계산 불가" : `${value.toLocaleString("ko-KR")}원`; }

export function summarizeProjectContracts(entries: ProjectContractEntry[]): ProjectContractSummary {
  const confirmed = entries.filter((entry) => entry.status === "confirmed");
  const original = confirmed.find((entry) => entry.entry_type === "original") ?? null;
  const sum = (type: ProjectContractEntryType, field: "supply_amount_krw" | "vat_amount_krw") => confirmed.filter((entry) => entry.entry_type === type).reduce((total, entry) => total + Number(entry[field]), 0);
  const increaseSupply = sum("increase", "supply_amount_krw"); const decreaseSupply = sum("decrease", "supply_amount_krw");
  const increaseVat = sum("increase", "vat_amount_krw"); const decreaseVat = sum("decrease", "vat_amount_krw");
  const finalSupply = original ? Number(original.supply_amount_krw) + increaseSupply - decreaseSupply : null;
  const finalVat = original ? Number(original.vat_amount_krw) + increaseVat - decreaseVat : null;
  return { original_supply_amount_krw: original ? Number(original.supply_amount_krw) : null, increase_supply_amount_krw: increaseSupply, decrease_supply_amount_krw: decreaseSupply, final_supply_amount_krw: finalSupply, original_vat_amount_krw: original ? Number(original.vat_amount_krw) : null, increase_vat_amount_krw: increaseVat, decrease_vat_amount_krw: decreaseVat, final_vat_amount_krw: finalVat, final_total_amount_krw: finalSupply === null || finalVat === null ? null : finalSupply + finalVat, confirmed_entry_count: confirmed.length, has_original_contract: Boolean(original) };
}
