export type SharedTimelineEntry = {
  id: number;
  activity_type: string;
  title: string;
  description: string | null;
  employee_name: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

export function getTimelineDescription(entry: Pick<SharedTimelineEntry, "description" | "metadata">) {
  if (entry.description) return entry.description;
  const before = typeof entry.metadata?.before === "string" ? entry.metadata.before : null;
  const after = typeof entry.metadata?.after === "string" ? entry.metadata.after : null;
  return before !== null || after !== null ? `${before ?? "없음"} → ${after ?? "없음"}` : null;
}
