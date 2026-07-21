export type AuditValue = string | number | boolean | null;

export type AuditChange = {
  field: string;
  label: string;
  before: AuditValue;
  after: AuditValue;
  beforeLabel?: string;
  afterLabel?: string;
};

export type AuditFieldDefinition = {
  field: string;
  label: string;
  type?: "text" | "number" | "date" | "boolean";
  valueLabels?: Record<string, string>;
};

function isEmptyAuditValue(value: unknown) {
  return value === null || value === undefined || value === "";
}

export function normalizeAuditValue(
  value: unknown,
  type: AuditFieldDefinition["type"] = "text"
): AuditValue {
  if (isEmptyAuditValue(value)) return null;

  if (type === "number") {
    const numericValue = Number(value);
    return Number.isNaN(numericValue) ? String(value) : numericValue;
  }

  if (type === "boolean") return Boolean(value);

  if (type === "date") {
    const stringValue = String(value);
    const dateMatch = stringValue.match(/^\d{4}-\d{2}-\d{2}/);
    return dateMatch?.[0] ?? stringValue;
  }

  return typeof value === "boolean" || typeof value === "number"
    ? value
    : String(value);
}

export function createAuditChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: AuditFieldDefinition[]
) {
  return fields.flatMap<AuditChange>((definition) => {
    const beforeValue = normalizeAuditValue(
      before[definition.field],
      definition.type
    );
    const afterValue = normalizeAuditValue(
      after[definition.field],
      definition.type
    );

    if (beforeValue === afterValue) return [];

    const beforeKey = beforeValue === null ? "" : String(beforeValue);
    const afterKey = afterValue === null ? "" : String(afterValue);

    return [
      {
        field: definition.field,
        label: definition.label,
        before: beforeValue,
        after: afterValue,
        beforeLabel: definition.valueLabels?.[beforeKey],
        afterLabel: definition.valueLabels?.[afterKey],
      },
    ];
  });
}

export function formatAuditValue(
  value: AuditValue,
  displayLabel?: string
) {
  if (displayLabel) return displayLabel;
  if (value === null) return "없음";
  if (typeof value === "boolean") return value ? "활성" : "비활성";
  return String(value);
}

export const PROJECT_AUDIT_FIELDS: AuditFieldDefinition[] = [
  { field: "project_name", label: "프로젝트명" },
  { field: "project_code", label: "프로젝트 코드" },
  { field: "client_name", label: "발주처" },
  { field: "site_address", label: "현장 주소" },
  { field: "salesperson", label: "영업 담당자" },
  { field: "process_type", label: "공정" },
  { field: "task_manager", label: "업무 담당자" },
  {
    field: "status",
    label: "상태",
    valueLabels: {
      pending: "대기",
      in_progress: "진행중",
      completed: "완료",
      hold: "보류",
    },
  },
  { field: "start_date", label: "시작일", type: "date" },
  { field: "end_date", label: "종료일", type: "date" },
];

export const TASK_AUDIT_FIELDS: AuditFieldDefinition[] = [
  { field: "task_name", label: "업무명" },
  { field: "task_type", label: "업무 유형" },
  { field: "assignee", label: "담당자" },
  {
    field: "status",
    label: "상태",
    valueLabels: {
      pending: "대기",
      in_progress: "진행중",
      completed: "완료",
    },
  },
  { field: "start_date", label: "시작일", type: "date" },
  { field: "due_date", label: "마감일", type: "date" },
  { field: "completed_date", label: "완료일", type: "date" },
  { field: "task_order", label: "순서", type: "number" },
];

export const SHIPMENT_AUDIT_FIELDS: AuditFieldDefinition[] = [
  { field: "status", label: "상태" },
  { field: "planned_date", label: "출고 예정일", type: "date" },
  { field: "actual_date", label: "실제 출고일", type: "date" },
  { field: "shipment_date", label: "출고일", type: "date" },
  { field: "driver_name", label: "담당자" },
  { field: "quantity", label: "수량", type: "number" },
  { field: "memo", label: "비고" },
];

export const EMPLOYEE_AUDIT_FIELDS: AuditFieldDefinition[] = [
  { field: "name", label: "이름" },
  { field: "position", label: "직급" },
  { field: "role", label: "권한" },
  { field: "active", label: "활성 상태", type: "boolean" },
  { field: "approval_status", label: "승인 상태" },
];
