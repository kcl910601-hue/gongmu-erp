export type MaterialAllocationAuditMetadata = {
  material_contract_id: string;
  allocation_id: string;
  field: string | null;
  field_label: string | null;
  before: unknown;
  after: unknown;
  before_display: string | null;
  after_display: string | null;
};

export type MaterialAllocationAuditEntry = {
  id: number;
  activity_type: string;
  title: string;
  employee_name: string | null;
  created_at: string;
  metadata: MaterialAllocationAuditMetadata;
};

export function formatMaterialAllocationAuditChange(metadata: MaterialAllocationAuditMetadata) {
  if (metadata.before_display && metadata.after_display) return `${metadata.before_display} → ${metadata.after_display}`;
  return metadata.after_display ?? metadata.before_display ?? "-";
}
