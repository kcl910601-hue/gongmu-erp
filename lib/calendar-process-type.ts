export type CalendarProcessType = {
  code: string;
  name: string;
};

type ProcessTypeMaster = {
  code: string | null;
  name: string | null;
};

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

export function buildCalendarProcessTypeMap(rows: ProcessTypeMaster[]) {
  return new Map(
    rows.flatMap((row) => {
      const code = clean(row.code);
      if (!code) return [];
      return [[code, { code, name: clean(row.name) || code }] as const];
    })
  );
}

export function resolveCalendarProcessType(
  sectionProcessType: string | null | undefined,
  projectProcessType: string | null | undefined,
  processTypesByCode: ReadonlyMap<string, CalendarProcessType>
) {
  const code = clean(sectionProcessType) || clean(projectProcessType);
  return code ? processTypesByCode.get(code) ?? null : null;
}
