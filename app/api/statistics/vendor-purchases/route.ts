import { getLmeContext } from "@/lib/lme-server";
import { isCalendarOnlyStaff } from "@/lib/permissions";
import { parsePurchase, type PurchaseRow, type PurchaseVendor } from "@/lib/vendor-purchases";

export async function GET(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || isCalendarOnlyStaff(employee)) return Response.json({ error: "조회 권한이 없습니다." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const start = Number(params.get("start")), end = Number(params.get("end"));
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1900 || end > 2099 || end < start || end - start > 10) return Response.json({ error: "1900~2099년 중 최대 11개 연도를 선택해주세요." }, { status: 400 });
  try {
    const category = await supabase.from("organization_categories").select("id").eq("code", "partner").single();
    if (category.error) throw new Error(category.error.message);
    const vendors: PurchaseVendor[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await supabase.from("organizations").select("id,name,partner_type,is_active").eq("category_id", category.data.id).order("id").range(offset, offset + 999);
      if (result.error) throw new Error(result.error.message);
      vendors.push(...result.data as PurchaseVendor[]);
      if (result.data.length < 1000) break;
    }
    const results = await Promise.all([
      { table: "vendor_purchase_entries", source: "manual" as const, category: null },
      { table: "glass_cost_statements", source: "glass" as const, category: "유리" as const },
      { table: "coating_cost_statements", source: "coating" as const, category: "도장" as const },
    ].map(async (source) => {
      const rows: PurchaseRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await supabase.from(source.table).select(`id,vendor_organization_id,accounting_month,invoice_number,supply_amount_krw,vat_amount_krw,memo${source.category ? "" : ",category"}`)
          .eq("status", "active").gte("accounting_month", `${start}-01-01`).lte("accounting_month", `${end}-12-01`).order("id").range(offset, offset + 999);
        if (result.error) throw new Error(`${source.table}: ${result.error.message}`);
        for (const raw of result.data as unknown as PurchaseRow[]) rows.push({ ...raw, source: source.source, category: source.category ?? raw.category, supply_amount_krw: Number(raw.supply_amount_krw), vat_amount_krw: Number(raw.vat_amount_krw) });
        if (result.data.length < 1000) break;
      }
      if (source.source !== "manual") {
        const allocated = new Map<string, number>();
        const table = source.source === "glass" ? "glass_cost_allocations" : "coating_cost_allocations";
        for (let batch = 0; batch < rows.length; batch += 200) {
          const ids = rows.slice(batch, batch + 200).map(row => row.id);
          for (let offset = 0; ; offset += 1000) {
            const result = await supabase.from(table)
              .select("id,statement_id,allocated_supply_amount_krw")
              .in("statement_id", ids).eq("status", "active")
              .order("id").range(offset, offset + 999);
            if (result.error) throw new Error(`${table}: ${result.error.message}`);
            for (const item of result.data) {
              const amount = Number(item.allocated_supply_amount_krw);
              const total = (allocated.get(item.statement_id) ?? 0) + amount;
              if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(total)) throw new Error("배분 금액이 지원 범위를 초과했습니다.");
              allocated.set(item.statement_id, total);
            }
            if (result.data.length < 1000) break;
          }
        }
        for (const row of rows) row.allocated_supply_amount_krw = allocated.get(row.id) ?? 0;
      }
      return rows;
    }));
    const rows = results.flat();
    let maximumTotal = 0;
    for (const row of rows) {
      if (!Number.isSafeInteger(row.supply_amount_krw) || !Number.isSafeInteger(row.vat_amount_krw)) throw new Error("원본 금액이 지원 범위를 초과했습니다.");
      maximumTotal += Math.abs(row.supply_amount_krw) + Math.abs(row.vat_amount_krw) + Math.abs(row.allocated_supply_amount_krw ?? 0);
      if (!Number.isSafeInteger(maximumTotal)) throw new Error("집계 금액이 지원 범위를 초과했습니다. 조회 연도 범위를 줄여주세요.");
    }
    return Response.json({ rows, vendors, canManage: employee.role === "admin" });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "조회 실패" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin" || isCalendarOnlyStaff(employee)) return Response.json({ error: "관리자만 등록할 수 있습니다." }, { status: 403 });
  try {
    const body = await request.json() as { rows?: unknown[] };
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 1000) throw new Error("1~1,000행을 입력해주세요.");
    const rows = body.rows.map((row, index) => { try { return parsePurchase(row); } catch (error) { throw new Error(`${index + 1}행: ${error instanceof Error ? error.message : "입력 오류"}`); } });
    const { error } = await supabase.rpc("import_vendor_purchases", { p_rows: rows });
    if (error) throw new Error(error.message);
    return Response.json({ count: rows.length }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "저장 실패" }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin" || isCalendarOnlyStaff(employee)) return Response.json({ error: "관리자만 무효 처리할 수 있습니다." }, { status: 403 });
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new Error("내역을 확인해주세요.");
    const { data, error } = await supabase.from("vendor_purchase_entries").update({ status: "void" }).eq("id", body.id).eq("status", "active").select("id").single();
    if (error || !data) throw new Error(error?.message ?? "내역이 변경되었습니다. 새로 조회해주세요.");
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "무효 처리 실패" }, { status: 400 }); }
}
