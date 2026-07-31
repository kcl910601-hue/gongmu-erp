import { parseMarketCsv } from "@/lib/lme-market-import";
import { getLmeContext } from "@/lib/lme-server";

export async function POST(request: Request) {
  const { supabase, user, employee } = await getLmeContext();
  if (!user || !employee || employee.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const formData = await request.formData(); const file = formData.get("file"); const mode = formData.get("mode") === "commit" ? "commit" : "preview";
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) return Response.json({ error: "UTF-8 CSV 파일을 선택해주세요." }, { status: 400 });
  if (file.size > 2_000_000) return Response.json({ error: "CSV 파일은 2MB 이하여야 합니다." }, { status: 400 });
  const parsed = parseMarketCsv(await file.text());
  const { data: activeMaterials, error: materialError } = await supabase.from("lme_materials").select("code").eq("is_active", true);
  if (materialError) return Response.json({ error: materialError.message }, { status: 500 });
  const activeCodes = new Set((activeMaterials ?? []).map((item) => item.code));
  const inactiveFailures = parsed.candidates.filter((row) => !activeCodes.has(row.material_code)).map((row) => ({ rowNumber: row.rowNumber, reason: "존재하지 않거나 비활성인 Material입니다." }));
  const validCandidates = parsed.candidates.filter((row) => activeCodes.has(row.material_code));
  const { data: existing, error: existingError } = await supabase.from("lme_market_prices").select("reference_month, round, material_code");
  if (existingError) return Response.json({ error: existingError.message }, { status: 500 });
  const existingKeys = new Set((existing ?? []).map((row) => `${row.reference_month}|${row.round}|${row.material_code}`));
  const failures = [...parsed.failures, ...inactiveFailures];
  const skipped = validCandidates.filter((row) => existingKeys.has(`${row.reference_month}|${row.round}|${row.material_code}`));
  const pending = validCandidates.filter((row) => !existingKeys.has(`${row.reference_month}|${row.round}|${row.material_code}`));
  const duplicates = skipped.map((row) => ({ rowNumber: row.rowNumber, reason: "기존 데이터 중복: 동일 기준월·회차·Material이 이미 등록되어 있습니다." }));
  if (mode === "preview") return Response.json({ mode, totalRows: parsed.totalRows, readyRows: pending.length, skippedRows: skipped.length, failedRows: failures.length, preview: pending.slice(0, 100), duplicates, failures });

  const rowsJson = pending.map((row) => ({ reference_date: row.reference_date, reference_month: row.reference_month, round: row.round, material_code: row.material_code, lme_al_usd_per_ton: row.lme_al_usd_per_ton, exchange_rate_krw_per_usd: row.exchange_rate_krw_per_usd, domestic_lme_krw_per_kg: row.domestic_lme_krw_per_kg, source_url: row.source_url, memo: row.memo }));
  const { data: rpcResult, error: importError } = await supabase.rpc("import_lme_market_prices", { rows_json: rowsJson, import_file_name: file.name, import_created_by_name: employee.name, import_pre_skipped_rows: skipped.length });
  if (importError) return Response.json({ error: `전체 Import가 취소되었습니다: ${importError.message}` }, { status: 409 });
  const committed = rpcResult as { insertedRows?: number; skippedRows?: number; failedRows?: number } | null;
  return Response.json({ mode, totalRows: parsed.totalRows, insertedRows: committed?.insertedRows ?? 0, skippedRows: committed?.skippedRows ?? skipped.length, failedRows: failures.length, duplicates, failures });
}
