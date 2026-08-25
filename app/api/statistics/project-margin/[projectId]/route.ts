import { getLmeContext } from "@/lib/lme-server";
import {
  buildMarginRecord,
  type AccessoryMarginRow,
  type CoatingMarginRow,
  type GlassMarginRow,
} from "@/lib/project-margin-analysis-server";
import type { ProjectContractEntry } from "@/lib/project-contracts";
import type {
  ProjectCostCategory,
  ProjectCostEntry,
} from "@/lib/project-costs";
import type { MaterialCostRow } from "@/lib/project-profit-analysis-server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId: raw } = await params,
    id = Number(raw),
    { supabase, employee } = await getLmeContext();
  if (!employee)
    return Response.json(
      { error: "승인된 사용자만 조회할 수 있습니다." },
      { status: 403 },
    );
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: "프로젝트 ID가 올바르지 않습니다." },
      { status: 400 },
    );
  const [p, c, m, x, k, g, coating, accessories] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id,project_code,project_name,client_name,site_address,salesperson,task_manager,status,process_type,start_date,end_date",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("project_contract_entries").select("*").eq("project_id", id),
    supabase
      .from("project_material_usages")
      .select(
        "id,project_id,material_code,pricing_basis,cost_reference_date,expected_quantity_kg,applied_unit_price_krw_per_kg,expected_cost_krw,material:lme_materials(name)",
      )
      .eq("project_id", id),
    supabase.from("project_cost_entries").select("*").eq("project_id", id),
    supabase.from("project_cost_categories").select("*").order("sort_order"),
    supabase
      .from("glass_cost_allocations")
      .select(
        "id,project_id,statement_id,allocated_supply_amount_krw,status,statement:glass_cost_statements!statement_id(id,vendor_organization_id,accounting_month,invoice_number,supply_amount_krw,vat_amount_krw,memo,status,vendor:organizations!vendor_organization_id(name),allocations:glass_cost_allocations(project_id,allocated_supply_amount_krw,status))",
      )
      .eq("project_id", id)
      .eq("status", "active"),
    supabase
      .from("coating_cost_allocations")
      .select(
        "id,project_id,statement_id,allocated_supply_amount_krw,status,statement:coating_cost_statements!statement_id(id,vendor_organization_id,accounting_month,invoice_number,supply_amount_krw,vat_amount_krw,memo,status,vendor:organizations!vendor_organization_id(name),allocations:coating_cost_allocations(project_id,allocated_supply_amount_krw,status))",
      )
      .eq("project_id", id)
      .eq("status", "active"),
    supabase.from("project_accessory_usages").select("id,project_id,total_cost_krw,status").eq("project_id", id).eq("status", "active"),
  ]);
  if (p.error || c.error || m.error || x.error || k.error || g.error || coating.error || accessories.error)
    return Response.json(
      {
        error:
          p.error?.message ??
          c.error?.message ??
          m.error?.message ??
          x.error?.message ??
          k.error?.message ??
          g.error?.message ??
          coating.error?.message ??
          accessories.error?.message,
      },
      { status: 500 },
    );
  if (!p.data)
    return Response.json(
      { error: "프로젝트를 찾을 수 없습니다." },
      { status: 404 },
    );
  const contracts = (c.data ?? []) as ProjectContractEntry[],
    costs = (x.data ?? []) as ProjectCostEntry[],
    categories = (k.data ?? []) as ProjectCostCategory[],
    rawMaterials = m.data ?? [],
    materials = rawMaterials.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      material_code: r.material_code,
      pricing_basis: r.pricing_basis,
      cost_reference_date: r.cost_reference_date,
      expected_quantity_kg: r.expected_quantity_kg,
      applied_unit_price_krw_per_kg: r.applied_unit_price_krw_per_kg,
      expected_cost_krw: r.expected_cost_krw,
    })) as MaterialCostRow[],
    record = buildMarginRecord(
      p.data,
      contracts,
      materials,
      costs,
      categories,
      (g.data ?? []) as unknown as GlassMarginRow[],
      (coating.data ?? []) as unknown as CoatingMarginRow[],
      (accessories.data ?? []) as unknown as AccessoryMarginRow[],
    ),
    total = record.analysis.expected_total_cost_krw,
    materialBreakdown = rawMaterials.map((r) => {
      const material = Array.isArray(r.material) ? r.material[0] : r.material;
      return {
        id: r.id,
        material_code: r.material_code,
        material_name: material?.name ?? null,
        expected_quantity_kg: r.expected_quantity_kg,
        pricing_basis: r.pricing_basis,
        applied_unit_price_krw_per_kg: r.applied_unit_price_krw_per_kg,
        expected_cost_krw: r.expected_cost_krw,
        share_of_total_cost:
          total && total > 0
            ? (Number(r.expected_cost_krw) / total) * 100
            : null,
        cost_reference_date: r.cost_reference_date,
      };
    }),
    categoryMap = new Map(categories.map((cat) => [cat.id, cat])),
    categoryBreakdown = Object.values(
      record.additional_cost_summary.category_breakdown,
    ).map((item) => ({
      ...item,
      latest_cost_date:
        costs
          .filter(
            (cost) =>
              cost.status === "confirmed" &&
              categoryMap.get(cost.category_id)?.code === item.code,
          )
          .map((cost) => cost.cost_date)
          .sort()
          .at(-1) ?? null,
      share_of_total_cost:
        total && total > 0 ? (item.supply_amount_krw / total) * 100 : null,
    }));
  return Response.json({
    canManage: employee.role === "admin",
    project: p.data,
    contract_summary: record.contract_summary,
    contract_entry_count: contracts.filter((e) => e.status === "confirmed")
      .length,
    material_cost_summary: record.material_cost_summary,
    material_breakdown: materialBreakdown,
    glass_cost_summary: record.glass_cost_summary,
    glass_breakdown: record.glass_breakdown,
    coating_cost_summary: record.coating_cost_summary,
    coating_breakdown: record.coating_breakdown,
    accessory_cost_summary: record.accessory_cost_summary,
    additional_cost_summary: record.additional_cost_summary,
    additional_category_breakdown: categoryBreakdown,
    cost_entry_summary: {
      confirmed_count: costs.filter((e) => e.status === "confirmed").length,
      void_count: costs.filter((e) => e.status === "void").length,
    },
    cost_composition: record.cost_composition,
    analysis: record.analysis,
    calculation_basis: {
      revenue: "confirmed 계약 이력의 최종 공급가액",
      material: "AL: project_material_usages 예상원가 snapshot",
      glass: "유리: 유효 계산서의 유효 프로젝트 배분 공급가액",
      coating: "도장: 유효 계산서의 유효 프로젝트 배분 공급가액",
      accessory: "부자재: 유효 프로젝트 소진내역의 Snapshot 총원가",
      additional: "confirmed 부대비용 공급가액",
      excluded: ["부가세", "실제 지급·정산 차이", "회계 확정 조정"],
    },
  });
}
