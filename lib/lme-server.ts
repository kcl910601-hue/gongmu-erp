import { getEmployeeByAuth } from "@/lib/auth";
import { isAuthorizedEmployee } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const sortableColumns = new Set([
  "reference_date",
  "lme_al_usd_per_ton",
  "standard_cost_krw_per_kg",
  "applied_price_krw_per_kg",
  "difference_rate",
]);

export async function getLmeContext() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, employee: null };
  const result = await getEmployeeByAuth(supabase, user);
  const employee = isAuthorizedEmployee(result.employee) ? result.employee : null;
  return { supabase, user, employee };
}

export async function queryLmeRecords(searchParams: URLSearchParams) {
  const { supabase, employee } = await getLmeContext();
  if (!employee) return { data: null, error: "승인된 사용자만 조회할 수 있습니다.", status: 403 };

  let query = supabase.from("lme_price_records").select("*, supplier:suppliers(id, name)");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const month = searchParams.get("month");
  const round = searchParams.get("round");
  const supplier = searchParams.get("supplier");
  const statusFilter = searchParams.get("status");
  if (startDate) query = query.gte("reference_date", startDate);
  if (endDate) query = query.lte("reference_date", endDate);
  if (month) query = query.eq("reference_month", `${month}-01`);
  if (round === "1" || round === "2") query = query.eq("round", Number(round));
  if (supplier) query = query.eq("supplier_id", supplier);
  if (["favorable", "normal", "caution", "high"].includes(statusFilter ?? "")) query = query.eq("status", statusFilter);

  const requestedSort = searchParams.get("sort") ?? "reference_date";
  const sort = sortableColumns.has(requestedSort) ? requestedSort : "reference_date";
  const ascending = searchParams.get("direction") === "asc";
  const { data, error } = await query.order(sort, { ascending }).order("created_at", { ascending: false });
  if (error) return { data: null, error: error.message, status: 500 };
  const records = (data ?? []).map((record) => {
    const supplier = Array.isArray(record.supplier) ? record.supplier[0] : record.supplier;
    return { ...record, supplier_name: supplier?.name ?? null, supplier: undefined };
  });
  return { data: records, error: null, status: 200, employee };
}
