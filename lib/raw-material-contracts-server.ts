import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawMaterialContract } from "@/lib/raw-material-contracts";

export async function queryRawMaterialContracts(supabase: SupabaseClient, params: URLSearchParams) {
  let query = supabase.from("raw_material_contracts").select("*, supplier:suppliers(id, name)"); const supplier = params.get("supplier"); const status = params.get("status"); const material = params.get("material"); const year = params.get("year");
  if (supplier) query = query.eq("supplier_id", supplier); if (status) query = query.eq("status", status); if (material) query = query.eq("material_code", material); if (year && /^\d{4}$/.test(year)) query = query.eq("contract_year", Number(year));
  const { data, error } = await query.order("effective_start_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) return { data: null, error }; const records = (data ?? []).map((record) => { const supplierRow = Array.isArray(record.supplier) ? record.supplier[0] : record.supplier; return { ...record, supplier_name: supplierRow?.name ?? null, supplier: undefined } as RawMaterialContract; }); return { data: records, error: null };
}
