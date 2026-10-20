export type CalendarTaskMetadataKind = "assembly" | "process" | "taskType";

export type CalendarTaskMetadata = {
  kind: CalendarTaskMetadataKind;
  label: string;
};

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

export function getCalendarTaskTypePriority(taskType: string | null | undefined) {
  switch (clean(taskType)) {
    case "출고": return 0;
    case "공장 출고":
    case "공장출고": return 1;
    case "발주": return 2;
    case "입고": return 3;
    default: return 4;
  }
}

export function getCalendarTaskMetadata(input: {
  assemblyVendorName?: string | null;
  processTypeName?: string | null;
  taskType?: string | null;
}) {
  const values: Array<[CalendarTaskMetadataKind, string]> = [
    ["taskType", clean(input.taskType)],
    ["process", clean(input.processTypeName)],
    ["assembly", clean(input.assemblyVendorName)],
  ];
  return values.flatMap(([kind, label]) => label ? [{ kind, label }] : []);
}
