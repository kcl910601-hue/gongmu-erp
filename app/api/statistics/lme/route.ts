import { calculateLmeValues, LME_SOURCE_URL, type LmeInput } from "@/lib/lme";
import { getLmeContext, queryLmeRecords } from "@/lib/lme-server";

type LmePayload = Record<string, unknown> & { id?: unknown };

function finiteNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePayload(body: LmePayload): { data: LmeInput | null; error: string | null } {
  const referenceDate = typeof body.referenceDate === "string" ? body.referenceDate : "";
  const round = finiteNumber(body.round);
  const lmeAlUsdPerTon = finiteNumber(body.lmeAlUsdPerTon);
  const exchangeRateKrwPerUsd = finiteNumber(body.exchangeRateKrwPerUsd);
  const processingCostKrwPerKg = finiteNumber(body.processingCostKrwPerKg);
  const appliedPriceKrwPerKg = finiteNumber(body.appliedPriceKrwPerKg);
  const rawQuantity = body.quantityTon;
  const quantityTon = rawQuantity === null || rawQuantity === "" || rawQuantity === undefined ? null : finiteNumber(rawQuantity);
  const effectiveStartDate = typeof body.effectiveStartDate === "string" ? body.effectiveStartDate : "";
  const effectiveEndDate = typeof body.effectiveEndDate === "string" ? body.effectiveEndDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || (round !== 1 && round !== 2)) {
    return { data: null, error: "기준일과 회차를 확인해주세요." };
  }
  if (typeof body.supplierId !== "string" || !body.supplierId) return { data: null, error: "공급업체를 선택해주세요." };
  if ([lmeAlUsdPerTon, exchangeRateKrwPerUsd, processingCostKrwPerKg, appliedPriceKrwPerKg].some((value) => value === null || value < 0)) {
    return { data: null, error: "시세, 환율, 인가공비와 적용단가는 0 이상의 숫자여야 합니다." };
  }
  if (quantityTon !== null && (quantityTon === null || quantityTon < 0)) return { data: null, error: "수량은 0 이상이어야 합니다." };
  if (effectiveStartDate && effectiveEndDate && effectiveEndDate < effectiveStartDate) return { data: null, error: "적용 종료일은 시작일보다 빠를 수 없습니다." };

  const data: LmeInput = {
    referenceDate,
    round,
    supplierId: typeof body.supplierId === "string" ? body.supplierId : "",
    lmeAlUsdPerTon: lmeAlUsdPerTon as number,
    exchangeRateKrwPerUsd: exchangeRateKrwPerUsd as number,
    processingCostKrwPerKg: processingCostKrwPerKg as number,
    appliedPriceKrwPerKg: appliedPriceKrwPerKg as number,
    effectiveStartDate,
    effectiveEndDate,
    quantityTon,
    sourceUrl: typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? body.sourceUrl.trim() : LME_SOURCE_URL,
    memo: typeof body.memo === "string" ? body.memo.trim() : "",
  };
  calculateLmeValues(data);
  return { data, error: null };
}

function toDatabasePayload(input: LmeInput) {
  return {
    reference_date: input.referenceDate,
    reference_month: `${input.referenceDate.slice(0, 7)}-01`,
    round: input.round,
    supplier_id: input.supplierId,
    lme_al_usd_per_ton: input.lmeAlUsdPerTon,
    exchange_rate_krw_per_usd: input.exchangeRateKrwPerUsd,
    processing_cost_krw_per_kg: input.processingCostKrwPerKg,
    applied_price_krw_per_kg: input.appliedPriceKrwPerKg,
    effective_start_date: input.effectiveStartDate || null,
    effective_end_date: input.effectiveEndDate || null,
    quantity_ton: input.quantityTon,
    source_url: input.sourceUrl,
    memo: input.memo || null,
  };
}

function databaseError(error: { code?: string; message: string }) {
  if (error.code === "23505") return Response.json({ error: "같은 기준연월, 회차, 공급업체 자료가 이미 있습니다." }, { status: 409 });
  if (error.code === "23514") return Response.json({ error: "입력값이 허용 범위를 벗어났습니다." }, { status: 400 });
  return Response.json({ error: error.message }, { status: 500 });
}

export async function GET(request: Request) {
  const result = await queryLmeRecords(new URL(request.url).searchParams);
  if (result.error) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ records: result.data });
}

export async function POST(request: Request) {
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const parsed = parsePayload(await request.json() as LmePayload);
  if (!parsed.data) return Response.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await supabase.from("lme_price_records").insert({ ...toDatabasePayload(parsed.data), created_by: user.id, created_by_name: employee.name }).select("*").single();
  if (error) return databaseError(error);
  return Response.json({ record: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as LmePayload;
  const id = typeof body.id === "string" ? body.id : "";
  const parsed = parsePayload(body);
  if (!id || !parsed.data) return Response.json({ error: parsed.error ?? "수정할 자료가 올바르지 않습니다." }, { status: 400 });
  const { data: previous, error: previousError } = await supabase.from("lme_price_records").select("id").eq("id", id).eq("is_current", true).maybeSingle();
  if (previousError) return databaseError(previousError);
  if (!previous) return Response.json({ error: "수정할 현재 자료를 찾을 수 없습니다." }, { status: 404 });
  const { data, error } = await supabase.from("lme_price_records").insert({ ...toDatabasePayload(parsed.data), created_by: user.id, created_by_name: employee.name, updated_by: user.id, supersedes_id: id }).select("*").single();
  if (error) return databaseError(error);
  if (!data) return Response.json({ error: "수정할 자료를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ record: data });
}

export async function DELETE(request: Request) {
  const { supabase, employee } = await getLmeContext();
  if (!employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json() as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "삭제할 자료가 올바르지 않습니다." }, { status: 400 });
  const { error } = await supabase.from("lme_price_records").delete().eq("id", id);
  if (error) return databaseError(error);
  return Response.json({ ok: true });
}
