import assert from "node:assert/strict";
import test from "node:test";
import { applyCommentCounts } from "./comment-counts.ts";
import type { PersonalNote } from "./personal-notes.ts";

const notes = [
  { id: "a", comment_count: 1 },
  { id: "b", comment_count: 0 },
] as PersonalNote[];

test("댓글 개수만 변경하고 일정 원본 객체의 나머지 값은 유지한다", () => {
  const updated = applyCommentCounts(notes, { a: { total: 2, unread: 1 }, b: { total: 0, unread: 0 } });
  assert.equal(updated[0].comment_count, 2);
  assert.equal(updated[0].unread_comment_count, 1);
  assert.equal(updated[1], notes[1]);
});

test("권한으로 반환되지 않은 일정의 댓글 개수는 변경하지 않는다", () => {
  assert.equal(applyCommentCounts(notes, {})[0], notes[0]);
});
