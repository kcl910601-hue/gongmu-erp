import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateVat, summarizeProjectContracts, type ProjectContractEntry, type ProjectContractEntryType } from "@/lib/project-contracts";

const entryTypes = new Set<ProjectContractEntryType>(["original", "increase", "decrease"]);
function integerAmount(value: unknown) { const number = Number(value); return Number.isSafeInteger(number) && number >= 0 ? number : null; }
export function parseContractEntry(body: Record<string, unknown>) {
  const projectId = Number(body.project_id); const entryType = typeof body.entry_type === "string" && entryTypes.has(body.entry_type as ProjectContractEntryType) ? body.entry_type as ProjectContractEntryType : null;
  const title = typeof body.contract_title === "string" ? body.contract_title.trim() : ""; const contractDate = typeof body.contract_date === "string" ? body.contract_date : ""; const effectiveDate = typeof body.effective_date === "string" ? body.effective_date : "";
  const documentNumber = typeof body.document_number === "string" && body.document_number.trim() ? body.document_number.trim() : null; const supply = integerAmount(body.supply_amount_krw); const suppliedVat = body.vat_amount_krw === undefined || body.vat_amount_krw === null || body.vat_amount_krw === "" ? null : integerAmount(body.vat_amount_krw); const memo = typeof body.memo === "string" && body.memo.trim() ? body.memo.trim() : null;
  const vat = suppliedVat ?? (supply === null ? null : calculateVat(supply));
  if (!Number.isInteger(projectId) || projectId <= 0 || !entryType || !title || title.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(contractDate) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || (documentNumber?.length ?? 0) > 100 || supply === null || vat === null || (entryType === "original" && supply <= 0) || (memo?.length ?? 0) > 2000 || !Number.isSafeInteger(supply + vat)) return { data: null, error: "계약 입력값을 확인해주세요." };
  return { data: { project_id: projectId, entry_type: entryType, contract_title: title, contract_date: contractDate, effective_date: effectiveDate, document_number: documentNumber, supply_amount_krw: supply, vat_amount_krw: vat, total_amount_krw: supply + vat, status: "confirmed" as const, memo }, error: null };
}

export async function getEntriesForProjects(supabase: SupabaseClient, projectIds: number[]) {
  if (!projectIds.length) return { data: new Map<number, ProjectContractEntry[]>(), error: null };
  const { data, error } = await supabase.from("project_contract_entries").select("*").in("project_id", projectIds).order("contract_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) return { data: null, error };
  const grouped = new Map<number, ProjectContractEntry[]>(); for (const row of (data ?? []) as ProjectContractEntry[]) grouped.set(row.project_id, [...(grouped.get(row.project_id) ?? []), row]);
  return { data: grouped, error: null };
}

export function buildProjectSummaries(entriesByProject: Map<number, ProjectContractEntry[]>, projectIds: number[]) {
  return new Map(projectIds.map((id) => [id, summarizeProjectContracts(entriesByProject.get(id) ?? [])]));
}
