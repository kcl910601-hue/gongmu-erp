import { PARTNER_TYPES, PARTNER_TYPE_LABELS, isPartnerType, type PartnerType } from "@/lib/partners";

export type PartnerImportRow = { name: string; partner_type: PartnerType; sort_order: number; memo: string | null };
export function parsePartnerImport(value: unknown): PartnerImportRow[] {
  if (!Array.isArray(value) || !value.length || value.length > 1000) throw new Error("1~1,000행을 입력해주세요.");
  const names = new Set<string>();
  return value.map((item: unknown, i) => {
    if (!item || typeof item !== "object") throw new Error(`${i + 2}행: 입력 형식 오류`);
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const memo = typeof row.memo === "string" ? row.memo.trim() : "";
    const typeValue = typeof row.partner_type === "string" ? row.partner_type.trim() : "";
    const type = isPartnerType(typeValue) ? typeValue : PARTNER_TYPES.find(t => PARTNER_TYPE_LABELS[t] === typeValue);
    const order = row.sort_order === "" || row.sort_order == null ? 0 : Number(row.sort_order);
    if (!name || name.length > 200) throw new Error(`${i + 2}행: 업체명은 1~200자로 입력해주세요.`);
    if (!type) throw new Error(`${i + 2}행: 업체 유형을 확인해주세요.`);
    if (!Number.isInteger(order) || order < 0 || order > 2147483647) throw new Error(`${i + 2}행: 정렬 순서는 0 이상의 정수로 입력해주세요.`);
    if (memo.length > 1000) throw new Error(`${i + 2}행: 비고는 1,000자 이하로 입력해주세요.`);
    const key = name.toLocaleLowerCase("ko-KR");
    if (names.has(key)) throw new Error(`${i + 2}행: 파일 안에 같은 업체명이 있습니다 (${name}).`);
    names.add(key);
    return { name, partner_type: type, sort_order: order, memo: memo || null };
  });
}
