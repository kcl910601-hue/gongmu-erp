export type FactoryMaterialRequestInput = {
  quantityTons: number;
  usageDate: string;
  purchaseOrderNo: string | null;
  memo: string | null;
};

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseFactoryMaterialRequestInput(body: Record<string, unknown>) {
  const quantityKg = Number(body.quantityKg);
  const usageDate = typeof body.usageDate === "string" ? body.usageDate : "";
  const purchaseOrderNo = optionalText(body.purchaseOrderNo);
  const memo = optionalText(body.memo);
  if (!Number.isFinite(quantityKg) || quantityKg <= 0 || Math.round(quantityKg * 10) !== quantityKg * 10) return { data: null, error: "발주량을 확인해주세요." } as const;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(usageDate)) return { data: null, error: "사용일을 확인해주세요." } as const;
  if ((purchaseOrderNo?.length ?? 0) > 100 || (memo?.length ?? 0) > 2_000) return { data: null, error: "발주번호 또는 메모 길이를 확인해주세요." } as const;
  return { data: { quantityTons: quantityKg / 1_000, usageDate, purchaseOrderNo, memo } satisfies FactoryMaterialRequestInput, error: null } as const;
}
