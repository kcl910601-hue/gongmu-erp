export type CalendarTaskMetadataKind = "assembly" | "process" | "taskType";

export type CalendarTaskMetadata = {
  kind: CalendarTaskMetadataKind;
  label: string;
};

function clean(value: string | null | undefined) {
  return value?.trim() || "";
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
