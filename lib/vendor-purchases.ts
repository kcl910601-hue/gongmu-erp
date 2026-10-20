import { PARTNER_TYPES, PARTNER_TYPE_LABELS, isPartnerType } from "@/lib/partners";

export const PURCHASE_CATEGORIES = ["압출", "유리", "가스켓", "조립", "도장", "부자재", "기타"] as const;
export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number];
export type PurchaseVendor = { id: number; name: string; partner_type: string; is_active: boolean };
export type PurchaseRow = {
  id: string; source: "manual" | "glass" | "coating"; vendor_organization_id: number;
  accounting_month: string; category: PurchaseCategory; invoice_number: string | null;
  supply_amount_krw: number; vat_amount_krw: number; memo: string | null;
  allocated_supply_amount_krw?: number;
};
export type PurchaseInput = Omit<PurchaseRow, "id" | "source" | "allocated_supply_amount_krw">;
export const PURCHASE_TYPE_GROUPS = [...PARTNER_TYPES.map(key => ({ key: String(key), label: PARTNER_TYPE_LABELS[key] })), { key: "unassigned", label: "미지정" }];
export function purchaseVendorType(vendor: PurchaseVendor | undefined) {
  return vendor && isPartnerType(vendor.partner_type) ? vendor.partner_type : "unassigned";
}
export function sortPurchaseVendors(vendors: PurchaseVendor[]) {
  return [...vendors].sort((a, b) => PURCHASE_TYPE_GROUPS.findIndex(g => g.key === purchaseVendorType(a)) - PURCHASE_TYPE_GROUPS.findIndex(g => g.key === purchaseVendorType(b)) || a.name.localeCompare(b.name, "ko") || a.id - b.id);
}
export function groupPurchases(rows: PurchaseRow[], vendors: PurchaseVendor[]) {
  const map = new Map(vendors.map(v => [v.id, v]));
  return PURCHASE_TYPE_GROUPS.map(group => ({ ...group, rows: rows.filter(row => purchaseVendorType(map.get(row.vendor_organization_id)) === group.key) }));
}
export function purchaseShare(amount: number | null, total: number | null) {
  return amount === null || total === null || total <= 0 ? "-" : `${(amount / total * 100).toFixed(1)}%`;
}
export function parsePurchase(value: unknown): PurchaseInput {
  if (!value || typeof value !== "object") throw new Error("입력 형식을 확인해주세요.");
  const row = value as Record<string, unknown>;
  const month = String(row.accounting_month ?? "");
  if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("귀속연월은 YYYY-MM 형식(1900~2099)으로 입력해주세요.");
  const vendor = Number(row.vendor_organization_id);
  if (!Number.isSafeInteger(vendor) || vendor <= 0) throw new Error("업체를 선택해주세요.");
  const category = String(row.category) as PurchaseCategory;
  if (!PURCHASE_CATEGORIES.includes(category)) throw new Error("거래 분류를 확인해주세요.");
  if (category === "유리" || category === "도장") throw new Error("유리·도장 계산서는 기존 원가관리에서 등록해주세요. 자동 합산됩니다.");
  const amount = (key: string) => {
    const raw = row[key];
    if ((typeof raw !== "string" && typeof raw !== "number") || String(raw).trim() === "") throw new Error("공급가액과 VAT를 입력해주세요. 거래 없음은 0으로 입력합니다.");
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || Math.abs(n) > 1_000_000_000_000) throw new Error("금액은 ±1조 원 이내의 정수여야 합니다.");
    return n;
  };
  const text = (key: string, max: number) => {
    const v = String(row[key] ?? "").trim();
    if (v.length > max) throw new Error(`${key === "memo" ? "메모" : "계산서번호"}가 너무 깁니다.`);
    return v || null;
  };
  return { vendor_organization_id: vendor, accounting_month: `${month}-01`, category, supply_amount_krw: amount("supply_amount_krw"), vat_amount_krw: amount("vat_amount_krw"), invoice_number: text("invoice_number", 100), memo: text("memo", 1000) };
}
export function purchaseTotal(rows: PurchaseRow[]): number | null {
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + row.supply_amount_krw, 0);
  if (!Number.isSafeInteger(total)) throw new Error("집계 금액이 지원 범위를 초과했습니다. 조회 범위를 줄여주세요.");
  return total;
}
export function purchaseChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) return "자료 없음";
  if (previous === 0) return current === 0 ? "변동 없음" : current > 0 ? "신규 거래" : "비교 불가";
  return `${((current - previous) / Math.abs(previous) * 100).toFixed(1)}%`;
}
