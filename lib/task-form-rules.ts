export type TaskFormRule = {
  showQuantity: boolean;
};

const DEFAULT_TASK_FORM_RULE: TaskFormRule = {
  showQuantity: true,
};

const TASK_FORM_RULES: Readonly<Record<string, Partial<TaskFormRule>>> = {
  "본납 문틀": { showQuantity: false },
  "본납 도어": { showQuantity: false },
};

const TASK_FORM_RULE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  rule: Partial<TaskFormRule>;
}> = [
  { pattern: /문틀$/, rule: { showQuantity: false } },
  { pattern: /도어$/, rule: { showQuantity: false } },
];

function normalizeTaskRuleKey(taskName: string | null | undefined) {
  return taskName?.trim().replace(/\s+/g, " ") ?? "";
}

export function getTaskFormRule(taskName: string | null | undefined): TaskFormRule {
  const normalizedTaskName = normalizeTaskRuleKey(taskName);
  const patternRule = TASK_FORM_RULE_PATTERNS.find(({ pattern }) => pattern.test(normalizedTaskName))?.rule;

  return {
    ...DEFAULT_TASK_FORM_RULE,
    ...patternRule,
    ...TASK_FORM_RULES[normalizedTaskName],
  };
}

function normalizeDisplayQuantity(quantity: number | null | undefined) {
  return quantity !== null && quantity !== undefined && Number.isFinite(quantity) && quantity > 0
    ? quantity
    : null;
}

export function resolveTaskDisplayQuantity(
  taskName: string | null | undefined,
  taskQuantity: number | null | undefined,
  projectQuantity: number | null | undefined
) {
  if (!getTaskFormRule(taskName).showQuantity) return null;

  return normalizeDisplayQuantity(taskQuantity)
    ?? normalizeDisplayQuantity(projectQuantity);
}
