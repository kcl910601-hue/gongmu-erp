import { normalizeProcessTypeCode } from "./process-type-code.ts";

export type ProcessTypeAuditMaster = { code: string; name: string; is_active: boolean };
export type ProcessTypeUsage = { process_type: string | null };
export type ProcessTypeAuditStatus = "NORMAL" | "UNUSED_MASTER" | "MISSING_MASTER" | "INACTIVE_BUT_USED";

export type ProcessTypeAuditRow = {
  code: string;
  name: string | null;
  isActive: boolean | null;
  sectionCount: number;
  templateCount: number;
  status: ProcessTypeAuditStatus;
  potentialAliasOf: string | null;
};

function countUsage(rows: ProcessTypeUsage[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const code = row.process_type?.trim();
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

export function auditProcessTypeConsistency(masters: ProcessTypeAuditMaster[], sections: ProcessTypeUsage[], templates: ProcessTypeUsage[] = []) {
  const masterByCode = new Map(masters.map((master) => [master.code, master]));
  const sectionCounts = countUsage(sections);
  const templateCounts = countUsage(templates);
  const codes = new Set([...masterByCode.keys(), ...sectionCounts.keys()]);

  return [...codes].sort((left, right) => left.localeCompare(right, "ko-KR")).map<ProcessTypeAuditRow>((code) => {
    const master = masterByCode.get(code);
    const sectionCount = sectionCounts.get(code) ?? 0;
    const templateCount = templateCounts.get(code) ?? 0;
    const status: ProcessTypeAuditStatus = !master
      ? "MISSING_MASTER"
      : sectionCount > 0 && !master.is_active
        ? "INACTIVE_BUT_USED"
        : sectionCount === 0 && templateCount === 0
          ? "UNUSED_MASTER"
          : "NORMAL";
    const normalizedName = master ? normalizeProcessTypeCode(master.name) : code;
    const potentialAliasOf = master && normalizedName !== code && masterByCode.has(normalizedName) ? normalizedName : null;
    return { code, name: master?.name ?? null, isActive: master?.is_active ?? null, sectionCount, templateCount, status, potentialAliasOf };
  });
}
