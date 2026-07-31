export const PARTNER_TYPES = ["supplier", "assembly"] as const;

export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  supplier: "구매처",
  assembly: "조립처",
};

export function isPartnerType(value: unknown): value is PartnerType {
  return typeof value === "string" && PARTNER_TYPES.includes(value as PartnerType);
}
