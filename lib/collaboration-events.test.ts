import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMENTS_CHANGED_EVENT,
  NOTIFICATIONS_CHANGED_EVENT,
  PERSONAL_NOTES_CHANGED_EVENT,
  REALTIME_TABLE_EVENTS,
  SHARING_CHANGED_EVENT,
  TIMELINE_CHANGED_EVENT,
} from "./collaboration-events.ts";

test("Realtime 테이블 변경을 필요한 화면 갱신 이벤트로만 연결한다", () => {
  assert.deepEqual(REALTIME_TABLE_EVENTS.personal_notes, [PERSONAL_NOTES_CHANGED_EVENT, TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT]);
  assert.deepEqual(REALTIME_TABLE_EVENTS.shared_comments, [COMMENTS_CHANGED_EVENT]);
  assert.deepEqual(REALTIME_TABLE_EVENTS.shared_comment_mentions, [NOTIFICATIONS_CHANGED_EVENT, TIMELINE_CHANGED_EVENT]);
  assert.equal(REALTIME_TABLE_EVENTS.shared_comments.includes(PERSONAL_NOTES_CHANGED_EVENT), false);
  assert.ok(REALTIME_TABLE_EVENTS.shared_item_members.includes(SHARING_CHANGED_EVENT));
  assert.deepEqual(REALTIME_TABLE_EVENTS.activity_logs, [TIMELINE_CHANGED_EVENT, NOTIFICATIONS_CHANGED_EVENT]);
  assert.deepEqual(REALTIME_TABLE_EVENTS.notification_reads, [NOTIFICATIONS_CHANGED_EVENT]);
  assert.ok(REALTIME_TABLE_EVENTS.shared_comment_reads.includes("collaboration:comment-counts-invalidated"));
});

test("존재하지 않는 notifications 테이블은 구독하지 않는다", () => {
  assert.equal("notifications" in REALTIME_TABLE_EVENTS, false);
});
