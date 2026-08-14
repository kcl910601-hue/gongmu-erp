export function normalizeProcessTypeCode(value: string) {
  const trimmed = value.trim();
  const comparisonKey = trimmed
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLocaleLowerCase("ko-KR");

  if (comparisonKey === "본납문틀") return "본납-문틀";
  if (comparisonKey === "본납도어") return "본납-도어";
  return trimmed;
}
