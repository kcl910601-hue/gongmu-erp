import assert from "node:assert/strict";
import test from "node:test";
import { EditingLockConflictError, formatHierarchicalDeleteLockMessage, isEditingLockResourceType, normalizeEditingLockResourceId, withShortEditingLock } from "./editing-locks.ts";

test("공통 잠금 리소스 타입만 허용한다", () => {
  for (const value of ["project", "task", "personal_note", "shipment", "employee", "comment", "setting", "material_usage_request", "material_usage_group"]) assert.equal(isEditingLockResourceType(value), true);
  assert.equal(isEditingLockResourceType("projects"), false);
  assert.equal(isEditingLockResourceType(""), false);
});

test("숫자 및 UUID PK를 동일한 문자열 키로 정규화한다", () => {
  assert.equal(normalizeEditingLockResourceId(101), "101");
  assert.equal(normalizeEditingLockResourceId(" 550e8400-e29b-41d4-a716-446655440000 "), "550e8400-e29b-41d4-a716-446655440000");
});

test("짧은 잠금은 저장 성공과 실패 모두 즉시 해제한다", async () => {
  const originalFetch = globalThis.fetch;
  const actions: string[] = [];
  globalThis.fetch = (async (input) => {
    const action = String(input).split("/").at(-1) ?? "";
    actions.push(action);
    return Response.json(action === "acquire" ? { acquired: true, token: "550e8400-e29b-41d4-a716-446655440000" } : { released: true });
  }) as typeof fetch;
  try {
    assert.equal(await withShortEditingLock("task", 500, async () => "saved"), "saved");
    await assert.rejects(() => withShortEditingLock("task", 501, async () => { throw new Error("save failed"); }), /save failed/);
    assert.deepEqual(actions, ["acquire", "release", "acquire", "release"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("같은 레코드가 잠겨 있으면 수정 함수를 실행하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  let mutated = false;
  globalThis.fetch = (async () => Response.json({ acquired: false, lock: { resourceType: "task", resourceId: "500", employeeId: 2, employeeName: "김철수", expiresAt: new Date().toISOString(), isMine: false } })) as typeof fetch;
  try {
    await assert.rejects(() => withShortEditingLock("task", 500, async () => { mutated = true; }), EditingLockConflictError);
    assert.equal(mutated, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("계층 삭제 잠금은 최대 5개와 추가 건수를 안내한다", () => {
  const locks = Array.from({ length: 5 }, (_, index) => ({ resource_type: "task", resource_id: String(index + 1), resource_title: `업무 ${index + 1}`, employee_id: index + 1, employee_name: `사용자${index + 1}`, expires_at: new Date().toISOString() }));
  const message = formatHierarchicalDeleteLockMessage({ deleted: false, lock_count: 7, locks });
  assert.match(message, /사용자1님이 “업무 1”/);
  assert.match(message, /추가 2건/);
  assert.match(message, /잠금이 해제된 후/);
});
