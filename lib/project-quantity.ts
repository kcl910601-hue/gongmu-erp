export function parseProjectQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const quantity = Number(trimmed);
  return Number.isFinite(quantity) ? quantity : null;
}

export function formatProjectQuantity(quantity: number | null | undefined, quantityUnit: string | null | undefined) {
  if (quantity === null || quantity === undefined || !Number.isFinite(Number(quantity))) return "-";
  const formatted = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 10 }).format(Number(quantity));
  const unit = (quantityUnit || "").trim();
  return `${formatted}${unit}`;
}
