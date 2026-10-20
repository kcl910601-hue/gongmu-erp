import XLSX from "xlsx-js-style";
import { PARTNER_TYPE_LABELS, isPartnerType } from "@/lib/partners";
import { PURCHASE_CATEGORIES, purchaseChange, purchaseTotal, type PurchaseRow, type PurchaseVendor } from "@/lib/vendor-purchases";
import { PURCHASE_TYPE_GROUPS, groupPurchases, purchaseVendorType, purchaseShare, sortPurchaseVendors } from "@/lib/vendor-purchases";

type Cell = string | number;
const vendorTypeLabel = (vendor: PurchaseVendor) => isPartnerType(vendor.partner_type) ? PARTNER_TYPE_LABELS[vendor.partner_type] : "미지정";
export type PurchaseReport = { rows: PurchaseRow[]; vendors: PurchaseVendor[]; start: number; end: number; throughMonth: number; filterLabel: string; partnerType?: string };
export const PURCHASE_HEADERS = ["귀속연월", "업체명", "거래분류", "공급가액", "VAT", "계산서번호", "메모"];
const LEGACY_PURCHASE_HEADERS = ["귀속연월", "업체코드", "거래분류", "공급가액", "VAT", "계산서번호", "메모"];
function addSheet(book: XLSX.WorkBook, name: string, headers: string[], rows: Cell[][], note: string) {
  const sheet = XLSX.utils.aoa_to_sheet([[name], [note], headers, ...rows]);
  sheet["!cols"] = headers.map(h => ({ wch: h.includes("메모") ? 40 : h.includes("업체") ? 24 : 18 }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: rows.length + 2, c: headers.length - 1 } }) };
  sheet["!merges"] = [0, 1].map(r => ({ s: { r, c: 0 }, e: { r, c: headers.length - 1 } }));
  sheet["!rows"] = [{ hpt: 28 }, { hpt: 36 }, { hpt: 24 }];
  for (const address of Object.keys(sheet).filter(key => !key.startsWith("!"))) {
    const cell = sheet[address] as XLSX.CellObject;
    const { r } = XLSX.utils.decode_cell(address);
    cell.s = { font: { name: "맑은 고딕", sz: r === 0 ? 16 : 10, bold: r === 0 || r === 2, color: { rgb: r === 2 ? "FFFFFF" : "334155" } }, fill: { fgColor: { rgb: r === 2 ? "1E3A5F" : "FFFFFF" } }, alignment: { vertical: "center", wrapText: true } };
    if (cell.t === "n") cell.z = "#,##0;[Red](#,##0);0";
  }
  XLSX.utils.book_append_sheet(book, sheet, name);
}
export function downloadPurchaseReport(options: PurchaseReport) {
  const { start, end, throughMonth, partnerType } = options;
  const vendors = sortPurchaseVendors(options.vendors.filter(v => !partnerType || purchaseVendorType(v) === partnerType));
  const ids = new Set(vendors.map(v => v.id));
  const rows = options.rows.filter(r => (!partnerType || ids.has(r.vendor_organization_id)) && Number(r.accounting_month.slice(0, 4)) >= start && Number(r.accounting_month.slice(0, 4)) <= end && Number(r.accounting_month.slice(5, 7)) <= throughMonth);
  const reportLabel = PURCHASE_TYPE_GROUPS.find(g => g.key === partnerType)?.label ?? "전체매입";
  const years = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const book = XLSX.utils.book_new();
  const note = `${start}~${end}년 · 매년 1~${throughMonth}월 동일 기간 · 공급가액(원), VAT 제외 · ${options.filterLabel} · 미입력은 자료 없음, 0원은 명시적 입력 · 부분 입력 합계일 수 있음`;
  const inYear = (year: number, group = rows) => group.filter(r => Number(r.accounting_month.slice(0, 4)) === year && Number(r.accounting_month.slice(5, 7)) <= throughMonth);
  const summary = years.map(year => {
    const selected = inYear(year), total = purchaseTotal(selected), previous = purchaseTotal(inYear(year - 1));
    return [year, total ?? "미입력", total === null ? "미입력" : selected.reduce((s, r) => s + r.vat_amount_krw, 0), total === null ? "미입력" : total + selected.reduce((s, r) => s + r.vat_amount_krw, 0), total === null || previous === null ? "비교 자료 없음" : total - previous, purchaseChange(total, previous), new Set(selected.map(r => r.accounting_month)).size] as Cell[];
  });
  addSheet(book, `${reportLabel} 요약`, ["연도", "공급가액", "VAT", "합계", "전년 대비 증감액", "증감률", "자료 있는 월수"], summary, note);
  const typeGroups = groupPurchases(rows, vendors);
  if (!partnerType) {
    addSheet(book, "유형별 금액과 비중", ["업체 유형", "연도", "공급가액", "전체 매입액", "전체 대비 비중"], years.flatMap(year => {
      const total = purchaseTotal(inYear(year));
      return [...typeGroups.map(group => {
        const amount = purchaseTotal(inYear(year, group.rows));
        return [group.label, year, amount ?? "미입력", total ?? "미입력", purchaseShare(amount, total)] as Cell[];
      }), ["전체 합계", year, total ?? "미입력", total ?? "미입력", purchaseShare(total, total)] as Cell[]];
    }), `${note} · 업체 관리의 현재 유형 기준`);
  }
  addSheet(book, "월별 비교", ["월", ...years.map(String)], Array.from({ length: throughMonth }, (_, i) => [i + 1, ...years.map(year => purchaseTotal(inYear(year).filter(r => Number(r.accounting_month.slice(5, 7)) === i + 1)) ?? "미입력")]), note);
  const groupRows = (key: "vendor" | "category") => {
    const groups = key === "vendor" ? vendors.map(v => ({ labels: [vendorTypeLabel(v), v.name], rows: rows.filter(r => r.vendor_organization_id === v.id) })) : PURCHASE_CATEGORIES.filter(c => !partnerType || rows.some(r => r.category === c)).map(c => ({ labels: [c], rows: rows.filter(r => r.category === c) }));
    return groups.flatMap(group => years.map(year => {
      const selected = inYear(year, group.rows), total = purchaseTotal(selected), previous = purchaseTotal(inYear(year - 1, group.rows));
      return [...group.labels, year, ...Array.from({ length: throughMonth }, (_, i) => purchaseTotal(selected.filter(r => Number(r.accounting_month.slice(5, 7)) === i + 1)) ?? "미입력"), total ?? "미입력", previous ?? "자료 없음", total === null || previous === null ? "비교 자료 없음" : total - previous, purchaseChange(total, previous)] as Cell[];
    }));
  };
  const headers = (label: string) => [label, "연도", ...Array.from({ length: throughMonth }, (_, i) => `${i + 1}월`), "기간 합계", "전년 동기", "증감액", "증감률"];
  addSheet(book, "업체별 비교", ["업체 유형", ...headers("업체")], groupRows("vendor"), note);
  addSheet(book, "분류별 비교", headers("거래 분류"), groupRows("category"), note);
  const names = new Map(vendors.map(v => [v.id, v.name]));
  addSheet(book, "계산서 상세", ["귀속연월", "업체", "분류", "공급가액", "VAT", "합계", "계산서번호", "메모", "원본"], rows.filter(r => Number(r.accounting_month.slice(5, 7)) <= throughMonth).map(r => [r.accounting_month.slice(0, 7), names.get(r.vendor_organization_id) ?? "업체 없음", r.category, r.supply_amount_krw, r.vat_amount_krw, r.supply_amount_krw + r.vat_amount_krw, r.invoice_number ?? "", r.memo ?? "", r.source === "manual" ? "매입현황" : r.source === "glass" ? "유리 원가관리" : "도장 원가관리"]), note);
  if (!partnerType) {
    const vendorComparisons = groupRows("vendor");
    for (const group of typeGroups) {
      addSheet(book, `${group.label} 비교`, ["업체 유형", ...headers("업체")], vendorComparisons.filter(row => row[0] === group.label), note);
      addSheet(book, `${group.label} 상세`, ["귀속연월", "업체", "거래 분류", "공급가액", "VAT", "합계", "계산서번호", "메모"], [...group.rows].sort((a, b) => (names.get(a.vendor_organization_id) ?? "").localeCompare(names.get(b.vendor_organization_id) ?? "", "ko") || a.accounting_month.localeCompare(b.accounting_month) || a.id.localeCompare(b.id)).map(r => [r.accounting_month.slice(0, 7), names.get(r.vendor_organization_id) ?? "업체 없음", r.category, r.supply_amount_krw, r.vat_amount_krw, r.supply_amount_krw + r.vat_amount_krw, r.invoice_number ?? "", r.memo ?? ""]), note);
    }
  }
  XLSX.writeFile(book, `${reportLabel}_매입비교_${start}-${end}_1-${throughMonth}월.xlsx`, { compression: true });
}
export function downloadPurchaseTemplate(vendors: PurchaseVendor[]) {
  const book = XLSX.utils.book_new();
  const exampleYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date())) - 1;
  for (const group of PURCHASE_TYPE_GROUPS) {
    const vendor = sortPurchaseVendors(vendors).find(v => purchaseVendorType(v) === group.key);
    if (group.key === "unassigned" && !vendor) continue;
    const category = group.key === "supplier" ? "압출" : group.key === "assembly" ? "조립" : group.key === "glass" ? "유리" : group.key === "coating" ? "도장" : group.key === "accessory" ? "부자재" : "기타";
    const sheetName = group.label;
    const sheet = XLSX.utils.aoa_to_sheet([PURCHASE_HEADERS, [`${exampleYear}-01`, vendor?.name ?? "등록된 업체명 입력", category, 1000000, 100000, "예시-삭제후입력", "[예시] 이 행 전체를 삭제하고 실제 내역을 입력하세요."]]);
    sheet["!cols"] = [18, 30, 16, 20, 18, 25, 65].map(wch => ({ wch }));
    sheet["!rows"] = [{ hpt: 24 }, { hpt: 32 }];
    for (let c = 0; c < PURCHASE_HEADERS.length; c++) {
      sheet[XLSX.utils.encode_cell({ r: 0, c })].s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E3A5F" } } };
      const cell = sheet[XLSX.utils.encode_cell({ r: 1, c })];
      cell.s = { fill: { fgColor: { rgb: "FEF3C7" } }, font: { color: { rgb: "92400E" } }, alignment: { wrapText: true } };
      if (c === 3 || c === 4) cell.z = "#,##0";
    }
    XLSX.utils.book_append_sheet(book, sheet, sheetName);
  }
  if (!vendors.length) throw new Error("선택한 유형에 등록된 업체가 없습니다.");
  addSheet(book, "업체 목록", ["업체 유형", "업체명", "상태"], sortPurchaseVendors(vendors).map(v => [vendorTypeLabel(v), v.name, v.is_active ? "활성" : "비활성"]), "해당 유형의 업체명을 복사해 입력하세요. 업체 유형과 매입 거래분류는 별도입니다.");
  addSheet(book, "작성 안내", ["항목", "안내"], [["귀속연월", "YYYY-MM 문자열로 입력 (예: 2025-01)"], ["거래분류", "압출 / 가스켓 / 조립 / 부자재 / 기타"], ["유리·도장", "기존 원가관리에서 등록하면 자동 합산됩니다. 이 양식에 중복 입력하지 마세요."], ["금액", "원 단위 정수. 공급가액·VAT 필수. 수정계산서는 음수 허용."], ["거래 없음", "해당 월·업체·분류에 공급가액과 VAT를 0으로 입력"], ["입력 방식", "계산서별 또는 월 합계 중 한 방식만 사용하세요. 혼합하면 중복 합산됩니다."], ["한도", "파일 5MB, 1,000행. 오류나 중복이 있으면 전체 등록 취소."], ["수정", "등록 내역을 무효 처리한 뒤 다시 등록합니다."]], "과거 연도 자료를 입력할 수 있습니다.");
  const guide = book.Sheets["작성 안내"];
  XLSX.utils.sheet_add_aoa(guide, [["유형별 시트", "AL업체·조립업체·도장업체·유리업체·부자재업체별로 나뉩니다. 같은 유형의 여러 업체를 한 시트에 입력하세요."], ["예시 삭제", "각 시트의 노란 예시 행 전체를 삭제하고 2행부터 입력하세요. 계산서번호 '예시-삭제후입력' 또는 메모 '[예시]'가 남으면 업로드가 중단됩니다."], ["업체명", "업체 목록에서 해당 유형의 업체명을 복사해 입력하세요. 유형과 이름으로 자동 연결합니다. 같은 유형에 동일한 이름이 여러 개면 업체 관리에서 이름을 구분한 뒤 업로드하세요. 첫 행 제목과 유형별 시트명은 유지하세요. 사용하지 않는 시트는 예시 삭제 후 비워두세요."], ["유리·도장 시트", "작성 참고용 예시입니다. 현재 유리·도장 계산서는 기존 원가관리에서 등록해야 합니다. 업로드 파일에서는 해당 시트를 비워두세요."], ["전체 행수", "모든 유형 시트의 실제 입력 행을 합쳐 최대 1,000행입니다. 기존 단일 '매입 입력' 및 업체별 양식도 지원합니다."]], { origin: -1 });
  XLSX.writeFile(book, "업체유형별_매입_업로드양식.xlsx");
}
export async function readPurchaseFile(file: File): Promise<Record<string, unknown>[]> {
  if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw new Error("5MB 이하의 .xlsx 파일을 선택해주세요.");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const result: Record<string, unknown>[] = [];
  for (const name of book.SheetNames) {
    if (name === "업체 목록" || name === "작성 안내") continue;
    const values = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, defval: "" });
    if (!values.some(row => row.some(v => v !== ""))) continue;
    const nameBased = PURCHASE_HEADERS.every((h, i) => values[0]?.[i] === h);
    const legacy = LEGACY_PURCHASE_HEADERS.every((h, i) => values[0]?.[i] === h) && (!values[0]?.[7] || values[0][7] === "업체명");
    if (!nameBased && !legacy) throw new Error(`${name}: 첫 행의 업로드 양식 열 제목을 유지해주세요.`);
    const sheetVendor = legacy ? /^(\d+)_/.exec(name)?.[1] : undefined;
    for (let index = 1; index < values.length; index++) {
      const row = values[index];
      if (!row.some(v => v !== "")) continue;
      const location = `${name} 시트 ${index + 1}행`;
      if (String(row[5]).includes("예시-삭제후입력") || String(row[6]).includes("[예시]")) throw new Error(`${location}: 예시 행을 삭제한 뒤 업로드해주세요.`);
      if (sheetVendor && String(row[1] ?? "").trim() && Number(row[1]) !== Number(sheetVendor)) throw new Error(`${location}: 업체코드가 시트의 업체와 다릅니다.`);
      result.push({ accounting_month: String(row[0]), vendor_organization_id: nameBased ? "" : String(row[1] ?? "").trim() ? row[1] : sheetVendor ?? "", vendor_name: String((nameBased ? row[1] : row[7]) ?? "").trim(), category: row[2], supply_amount_krw: row[3], vat_amount_krw: row[4], invoice_number: row[5], memo: row[6], source_location: location, source_partner_type: PURCHASE_TYPE_GROUPS.find(group => group.label === name)?.key });
      if (result.length > 1000) throw new Error("전체 업체 시트를 합쳐 1,000행 이하로 입력해주세요.");
    }
  }
  if (!result.length) throw new Error("업체 시트에 실제 내역을 1행 이상 입력해주세요.");
  return result;
}
