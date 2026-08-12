export function normalizeTaskName(value: string) {
  return value.trim();
}

export function validateTaskName(value: string) {
  const normalized = normalizeTaskName(value);
  return normalized ? { valid: true as const, value: normalized } : { valid: false as const, value: "" };
}
