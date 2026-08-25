export const PARTNER_TYPES = ["supplier", "assembly", "coating", "glass", "accessory"] as const;

export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  supplier: "AL업체",
  assembly: "조립업체",
  coating: "도장업체",
  glass: "유리업체",
  accessory: "부자재업체",
};

export function isPartnerType(value: unknown): value is PartnerType {
  return typeof value === "string" && PARTNER_TYPES.includes(value as PartnerType);
}
