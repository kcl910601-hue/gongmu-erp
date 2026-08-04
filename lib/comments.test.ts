import test from "node:test";
import assert from "node:assert/strict";
import { COMMENT_MAX_LENGTH, canAccessComments, getCommentNotificationRecipientIds, getCommentPermissions, normalizeCommentContent } from "./comments.ts";

test("댓글 내용을 trim하고 공백 및 길이 초과를 차단한다", () => {
  assert.deepEqual(normalizeCommentContent("  확인했습니다.  "), { content: "확인했습니다.", error: null });
  assert.equal(normalizeCommentContent("   ").content, null);
  assert.equal(normalizeCommentContent("가".repeat(COMMENT_MAX_LENGTH + 1)).content, null);
});

test("작성자만 수정하고 작성자 또는 소유자만 삭제한다", () => {
  assert.deepEqual(getCommentPermissions(2, 1, 2), { canEdit: true, canDelete: true });
  assert.deepEqual(getCommentPermissions(1, 1, 2), { canEdit: false, canDelete: true });
  assert.deepEqual(getCommentPermissions(3, 1, 2), { canEdit: false, canDelete: false });
});

test("소유자와 view/edit 참여자는 접근하고 비참여자와 공유 해제 사용자는 차단한다", () => {
  assert.equal(canAccessComments(1, 1), true);
  assert.equal(canAccessComments(2, 1, { employeeId: 2, permission: "view" }), true);
  assert.equal(canAccessComments(3, 1, { employeeId: 3, permission: "edit" }), true);
  assert.equal(canAccessComments(4, 1, null), false);
});

test("댓글 알림은 소유자와 현재 참여자에게만 보내고 작성자를 제외한다", () => {
  assert.deepEqual(getCommentNotificationRecipientIds(1, [2, 3, 3], 2), [1, 3]);
  assert.deepEqual(getCommentNotificationRecipientIds(1, [], 1), []);
});
