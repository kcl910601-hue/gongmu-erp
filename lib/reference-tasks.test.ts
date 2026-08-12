import assert from "node:assert/strict";
import test from "node:test";
import { getReferenceTaskDueState, getReferencedCommentIds, isDeletedReferenceSource, isReferenceTaskCompleted, normalizeReferenceTaskOptions } from "./reference-tasks.ts";

test("참조 댓글 ID는 복사 없이 고유 ID 집합으로 관리한다", () => {
  assert.deepEqual([...getReferencedCommentIds([{ commentId: 3 }, { commentId: 3 }, { commentId: null }, { commentId: 5 }])], [3, 5]);
});

test("개인 제목, 마감일, 우선순위 입력을 검증한다", () => {
  assert.deepEqual(normalizeReferenceTaskOptions({ title: "  확인 요청  ", dueDate: "2026-08-06", priority: "high" }).options, { title: "확인 요청", dueDate: "2026-08-06", priority: "high" });
  assert.equal(normalizeReferenceTaskOptions({ title: "", dueDate: null, priority: "normal" }).options, null);
  assert.equal(normalizeReferenceTaskOptions({ title: "확인", dueDate: "08/06", priority: "normal" }).options, null);
  assert.equal(normalizeReferenceTaskOptions({ title: "확인", dueDate: null, priority: "urgent" }).options, null);
});

test("마감일을 미지정, 오늘, 임박, 지연으로 구분한다", () => {
  assert.equal(getReferenceTaskDueState(null, "2026-08-05"), "unspecified");
  assert.equal(getReferenceTaskDueState("2026-08-05", "2026-08-05"), "today");
  assert.equal(getReferenceTaskDueState("2026-08-07", "2026-08-05"), "soon");
  assert.equal(getReferenceTaskDueState("2026-08-04", "2026-08-05"), "overdue");
});

test("원본 조인이 사라지면 삭제된 원본으로 판정한다", () => {
  assert.equal(isDeletedReferenceSource({ source: null }), true);
  assert.equal(isDeletedReferenceSource({ source: { commentId: 1, content: "최신 내용", authorName: "김철수", itemId: "note", itemTitle: "일정" } }), false);
});

test("완료 판정은 completed_at이 아니라 status를 기준으로 한다", () => {
  assert.equal(isReferenceTaskCompleted({ status: "completed" }), true);
  assert.equal(isReferenceTaskCompleted({ status: "pending" }), false);
});
