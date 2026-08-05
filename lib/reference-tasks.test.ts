import assert from "node:assert/strict";
import test from "node:test";
import { getReferencedCommentIds, isDeletedReferenceSource } from "./reference-tasks.ts";

test("참조 댓글 ID는 복사 없이 고유 ID 집합으로 관리한다", () => {
  assert.deepEqual([...getReferencedCommentIds([{ commentId: 3 }, { commentId: 3 }, { commentId: null }, { commentId: 5 }])], [3, 5]);
});

test("원본 조인이 사라지면 삭제된 원본으로 판정한다", () => {
  assert.equal(isDeletedReferenceSource({ source: null }), true);
  assert.equal(isDeletedReferenceSource({ source: { commentId: 1, content: "최신 내용", authorName: "김철수", itemId: "note", itemTitle: "일정" } }), false);
});
