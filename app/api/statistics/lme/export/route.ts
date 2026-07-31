import * as XLSX from "xlsx-js-style";
import { LME_STATUS_PRESENTATION, formatNumber, type LmeRecord } from "@/lib/lme";
import { queryLmeRecords } from "@/lib/lme-server";

const headers = [
  "번호", "기준일", "기준연월", "회차", "공급업체", "LME Al(USD/ton)", "환율(KRW/USD)",
  "국내 환산 LME(KRW/kg)", "인가공비(KRW/kg)", "기준 원가(KRW/kg)", "회사 적용단가(KRW/kg)",
  "차액(KRW/kg)", "차이율(%)", "상태", "적용 시작일", "적용 종료일", "수량(ton)", "비고", "등록자", "등록일시", "출처",
];

const border = {
  top: { style: "thin", color: { rgb: "FFD6DEE8" } }, bottom: { style: "thin", color: { rgb: "FFD6DEE8" } },
  left: { style: "thin", color: { rgb: "FFD6DEE8" } }, right: { style: "thin", color: { rgb: "FFD6DEE8" } },
};

function datePart(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const result = await queryLmeRecords(searchParams);
  if (result.error) return Response.json({ error: result.error }, { status: result.status });
  const records = (result.data ?? []) as LmeRecord[];
  const latest = [...records].sort((left, right) => right.reference_date.localeCompare(left.reference_date))[0];
  const startDate = searchParams.get("startDate") || records.at(-1)?.reference_date || "전체";
  const endDate = searchParams.get("endDate") || records[0]?.reference_date || "전체";
  const summary = [
    ["LME 알루미늄 시세 비교"],
    ["조회기간", `${startDate} ~ ${endDate}`, "최근 LME", latest ? `${formatNumber(latest.lme_al_usd_per_ton, 1)} USD/ton` : "-", "최근 환율", latest ? `${formatNumber(latest.exchange_rate_krw_per_usd, 1)} KRW/USD` : "-"],
    ["최근 기준 원가", latest ? latest.standard_cost_krw_per_kg : "-", "최근 회사 적용단가", latest ? latest.applied_price_krw_per_kg : "-", "최근 차액/차이율", latest ? `${formatNumber(latest.difference_krw_per_kg)}원 / ${formatNumber(latest.difference_rate, 2)}%` : "-"],
    headers,
  ];
  const rows = records.map((record, index) => [
    index + 1, record.reference_date, record.reference_month.slice(0, 7), `${record.round}차`, record.supplier_name ?? "-",
    record.lme_al_usd_per_ton, record.exchange_rate_krw_per_usd, record.domestic_lme_krw_per_kg,
    record.processing_cost_krw_per_kg, record.standard_cost_krw_per_kg, record.applied_price_krw_per_kg,
    record.difference_krw_per_kg, record.difference_rate / 100, LME_STATUS_PRESENTATION[record.status].label,
    datePart(record.effective_start_date), datePart(record.effective_end_date), record.quantity_ton ?? "", record.memo ?? "",
    record.created_by_name, record.created_at.slice(0, 19).replace("T", " "), record.source_url,
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([...summary, ...rows]);
  sheet["!merges"] = [XLSX.utils.decode_range("A1:U1")];
  sheet["!cols"] = headers.map((header, index) => ({ wch: index === 17 || index === 20 ? 30 : Math.max(11, Math.min(22, header.length * 1.7)) }));
  sheet["!autofilter"] = { ref: `A4:U${Math.max(4, rows.length + 4)}` };
  const layoutSheet = sheet as XLSX.WorkSheet & {
    "!freeze"?: { xSplit: number; ySplit: number };
    "!pageSetup"?: { orientation: "landscape"; fitToWidth: number; fitToHeight: number };
  };
  layoutSheet["!freeze"] = { xSplit: 0, ySplit: 4 };
  layoutSheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  if (sheet.A1) sheet.A1.s = { font: { bold: true, sz: 16, color: { rgb: "FF1E3A8A" } }, fill: { fgColor: { rgb: "FFDBEAFE" } }, alignment: { horizontal: "center" } };
  for (let column = 0; column < headers.length; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 3, c: column })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFFFF" } }, fill: { fgColor: { rgb: "FF334155" } }, alignment: { horizontal: "center", vertical: "center" }, border };
  }
  rows.forEach((row, rowIndex) => {
    row.forEach((_, column) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex + 4, c: column })];
      if (!cell) return;
      cell.s = { border, alignment: { vertical: "center" } };
      if ([5, 6].includes(column)) cell.z = "#,##0.0";
      if ([7, 8, 9, 10, 11].includes(column)) cell.z = "#,##0";
      if (column === 12) cell.z = "0.00%";
      if (column === 13) {
        const fills: Record<string, string> = { 유리: "FFD1FAE5", 정상: "FFDBEAFE", 주의: "FFFEF3C7", 높음: "FFFEE2E2" };
        cell.s = { ...cell.s, font: { bold: true }, fill: { fgColor: { rgb: fills[String(row[column])] } } };
      }
    });
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "LME 시세현황");
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  const responseBody = new ArrayBuffer(output.byteLength);
  new Uint8Array(responseBody).set(output);
  const filename = `LME_알루미늄_시세비교_${startDate}_${endDate}.xlsx`;
  return new Response(responseBody, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
