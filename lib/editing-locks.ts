export const EDITING_LOCK_RESOURCE_TYPES = [
  "project", "task", "personal_note", "shipment", "employee", "comment", "setting", "material_usage_request", "material_usage_group", "glass_cost_statement", "coating_cost_statement", "accessory_item", "project_accessory_usage",
] as const;

export type EditingLockResourceType = (typeof EDITING_LOCK_RESOURCE_TYPES)[number];
export type EditingLockState = "idle" | "acquiring" | "acquired" | "locked" | "error";

export type EditingLockInfo = {
  resourceType: EditingLockResourceType;
  resourceId: string;
  employeeId: number;
  employeeName: string;
  expiresAt: string;
  isMine: boolean;
};

export type HierarchicalDeleteLock = {
  resource_type: string;
  resource_id: string;
  resource_title: string;
  employee_id: number;
  employee_name: string;
  expires_at: string;
};

export type HierarchicalDeleteResult = {
  deleted?: boolean;
  lock_count?: number;
  locks?: HierarchicalDeleteLock[];
};

export const EDITING_LOCK_HEARTBEAT_MS = 20_000;

export function isEditingLockResourceType(value: unknown): value is EditingLockResourceType {
  return typeof value === "string" && EDITING_LOCK_RESOURCE_TYPES.includes(value as EditingLockResourceType);
}

export function normalizeEditingLockResourceId(value: string | number) {
  return String(value).trim();
}

export function formatHierarchicalDeleteLockMessage(result: HierarchicalDeleteResult) {
  const locks = (result.locks ?? []).slice(0, 5);
  if (locks.length === 0) return "현재 편집 중인 하위 항목이 있어 삭제할 수 없습니다.";
  const lines = locks.map((lock) => `${lock.employee_name}님이 “${lock.resource_title}”을(를) 현재 수정 중입니다.`);
  const remaining = Math.max(0, (result.lock_count ?? locks.length) - locks.length);
  if (remaining > 0) lines.push(`추가 ${remaining}건`);
  lines.push("잠금이 해제된 후 다시 시도해주세요.");
  return lines.join("\n");
}

export async function requestEditingLock(
  action: "acquire" | "heartbeat" | "release" | "status",
  body: Record<string, unknown>,
) {
  const response = await fetch(`/api/editing-locks/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as { lock?: EditingLockInfo; token?: string; acquired?: boolean; released?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error ?? "편집 잠금 요청을 처리하지 못했습니다.");
  return result;
}

export class EditingLockConflictError extends Error {
  readonly lock: EditingLockInfo | null;

  constructor(lock: EditingLockInfo | null) {
    super(lock ? `${lock.employeeName}님이 현재 수정 중입니다.` : "다른 사용자가 현재 수정 중입니다.");
    this.name = "EditingLockConflictError";
    this.lock = lock;
  }
}

export async function withShortEditingLock<T>(
  resourceType: EditingLockResourceType,
  resourceId: string | number,
  mutation: () => PromiseLike<T>,
) {
  const result = await requestEditingLock("acquire", {
    resourceType,
    resourceId: normalizeEditingLockResourceId(resourceId),
  });
  if (!result.acquired || !result.token) throw new EditingLockConflictError(result.lock ?? null);
  try {
    return await mutation();
  } finally {
    await requestEditingLock("release", { token: result.token }).catch(() => undefined);
  }
}

export async function withShortEditingLocks<T>(
  resources: ReadonlyArray<{ resourceType: EditingLockResourceType; resourceId: string | number }>,
  mutation: () => PromiseLike<T>,
) {
  const ordered = [...resources]
    .map((resource) => ({ ...resource, normalizedId: normalizeEditingLockResourceId(resource.resourceId) }))
    .sort((left, right) => `${left.resourceType}:${left.normalizedId}`.localeCompare(`${right.resourceType}:${right.normalizedId}`));
  const tokens: string[] = [];
  try {
    for (const resource of ordered) {
      const result = await requestEditingLock("acquire", { resourceType: resource.resourceType, resourceId: resource.normalizedId });
      if (!result.acquired || !result.token) throw new EditingLockConflictError(result.lock ?? null);
      tokens.push(result.token);
    }
    return await mutation();
  } finally {
    await Promise.all(tokens.reverse().map((token) => requestEditingLock("release", { token }).catch(() => undefined)));
  }
}
